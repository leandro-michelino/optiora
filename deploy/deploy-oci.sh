#!/bin/bash

################################################################################
# OptiOra OCI Deployment Script
#
# Local-to-OCI deployment:
# - Runs from your laptop
# - Provisions/starts OCI compute instance with the latest Oracle Linux 9 image
# - Uploads local project files to VM from your current local workspace
# - Installs dependencies and starts systemd services on VM
# - Does not clone from Git or depend on CI/CD triggers
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TFVARS_PATH="${ROOT_DIR}/terraform/terraform.tfvars"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DEPLOYMENT_TYPE=${1:-"compute"}
REGION=${OCI_REGION:-"uk-london-1"}
DEFAULT_COMPARTMENT_ID="ocid1.compartment.oc1..aaaaaaaa3qjzj6affgfpcnioxmbz6vy2ksynl6h55k3zy5jk5qrnizoxbxya"
COMPARTMENT_ID=${OCI_COMPARTMENT_ID:-$DEFAULT_COMPARTMENT_ID}
INSTANCE_NAME=${OCI_INSTANCE_NAME:-"optiora-api"}
SHAPE=${OCI_SHAPE:-"VM.Standard.E4.Flex"}
OCPU_COUNT=${OCI_OCPU_COUNT:-"2"}
MEMORY_GB=${OCI_MEMORY_GB:-"8"}
DRY_RUN=${DRY_RUN:-false}
SUBNET_ID=${OCI_SUBNET_ID:-}
VCN_ID=${OCI_VCN_ID:-}
ASSIGN_PUBLIC_IP=${OCI_ASSIGN_PUBLIC_IP:-"true"}
SSH_PUBLIC_KEY_PATH=${OCI_SSH_PUBLIC_KEY_PATH:-}
SSH_PRIVATE_KEY_PATH=${OCI_SSH_PRIVATE_KEY_PATH:-}
SSH_PUBLIC_KEY_VALUE=${OCI_SSH_PUBLIC_KEY:-}
REMOTE_USER=${OCI_INSTANCE_USER:-opc}
APP_DIR=${OCI_APP_DIR:-/opt/optiora}
APP_USER=${OCI_APP_USER:-optiora}
CLI_PROFILE=${OCI_PROFILE:-${OCI_CLI_PROFILE:-DEFAULT}}
IMAGE_COMPARTMENT_ID=${OCI_IMAGE_COMPARTMENT_ID:-}
IMAGE_OS=${OCI_IMAGE_OS:-"Oracle Linux"}
IMAGE_OS_VERSION=${OCI_IMAGE_OS_VERSION:-"9"}
RAW_EXTRA_VOLUME_ENABLED=${OCI_EXTRA_VOLUME_ENABLED:-}
RAW_EXTRA_VOLUME_SIZE_GBS=${OCI_EXTRA_VOLUME_SIZE_GBS:-}
RAW_EXTRA_VOLUME_VPUS_PER_GB=${OCI_EXTRA_VOLUME_VPUS_PER_GB:-}
RAW_EXTRA_VOLUME_DEVICE=${OCI_EXTRA_VOLUME_DEVICE:-}

RESOLVED_SUBNET_ID=""
RESOLVED_SSH_PUBLIC_KEY=""
RESOLVED_SSH_PUBLIC_KEY_PATH=""
RESOLVED_SSH_PRIVATE_KEY_PATH=""
RESOLVED_IMAGE_COMPARTMENT_ID=""
RESOLVED_EXTRA_VOLUME_ENABLED=""
RESOLVED_EXTRA_VOLUME_SIZE_GBS=""
RESOLVED_EXTRA_VOLUME_VPUS_PER_GB=""
RESOLVED_EXTRA_VOLUME_DEVICE=""
CURRENT_INSTANCE_ID=""
CURRENT_PUBLIC_IP=""
CURRENT_AVAILABILITY_DOMAIN=""

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_step() {
    echo -e "\n${BLUE}============================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================================${NC}"
}

format_duration() {
    local total_seconds="${1:-0}"
    local hours minutes seconds

    if [ "$total_seconds" -lt 0 ]; then
        total_seconds=0
    fi

    hours=$((total_seconds / 3600))
    minutes=$(((total_seconds % 3600) / 60))
    seconds=$((total_seconds % 60))

    if [ "$hours" -gt 0 ]; then
        printf '%dh %dm %ds' "$hours" "$minutes" "$seconds"
    elif [ "$minutes" -gt 0 ]; then
        printf '%dm %ds' "$minutes" "$seconds"
    else
        printf '%ds' "$seconds"
    fi
}

prompt_value() {
    local label="$1"
    local default_value="${2:-}"
    local answer

    if [[ -n "$default_value" ]]; then
        read -r -p "$label [$default_value]: " answer
        if [[ -z "$answer" ]]; then
            echo "$default_value"
            return 0
        fi
        echo "$answer"
        return 0
    fi

    read -r -p "$label: " answer
    echo "$answer"
}

prompt_yes_no() {
    local label="$1"
    local default_yes="${2:-true}"
    local answer
    local suffix="[Y/n]"

    if [[ "$default_yes" != "true" ]]; then
        suffix="[y/N]"
    fi

    read -r -p "$label $suffix " answer
    local normalized
    normalized="$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')"
    case "$normalized" in
        y|yes) return 0 ;;
        n|no) return 1 ;;
        "") [[ "$default_yes" == "true" ]] && return 0 || return 1 ;;
        *) [[ "$default_yes" == "true" ]] && return 0 || return 1 ;;
    esac
}

read_tfvar() {
    local key="$1"
    local file="$2"
    if [[ ! -f "$file" ]]; then
        return 0
    fi
    awk -v key="$key" '
        $0 ~ "^[[:space:]]*" key "[[:space:]]*=" {
            sub("^[[:space:]]*" key "[[:space:]]*=[[:space:]]*", "", $0)
            sub(/[[:space:]]*(#.*)?$/, "", $0)
            if ($0 ~ /^".*"$/ || $0 ~ /^\047.*\047$/) {
                print substr($0, 2, length($0) - 2)
            } else {
                print $0
            }
            exit
        }
    ' "$file"
}

read_tfvar_list() {
    local key="$1"
    local file="$2"
    if [[ ! -f "$file" ]]; then
        return 0
    fi
    sed -n "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*\[\(.*\)\][[:space:]]*$/\1/p" "$file" | head -n 1 | tr -d '"' | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed '/^$/d'
}

upsert_tfvar() {
    local key="$1"
    local value="$2"
    local file="$3"
    local escaped
    local tmp_file

    escaped="${value//\"/\\\"}"
    tmp_file="$(mktemp)"

    if [[ ! -f "$file" ]]; then
        touch "$file"
    fi

    if grep -Eq "^[[:space:]]*${key}[[:space:]]*=" "$file"; then
        awk -v k="$key" -v v="$escaped" '
      BEGIN { updated = 0 }
      $0 ~ "^[[:space:]]*" k "[[:space:]]*=" {
        print k " = \"" v "\""
        updated = 1
        next
      }
      { print }
      END {
        if (updated == 0) {
          print k " = \"" v "\""
        }
      }
    ' "$file" > "$tmp_file"
    else
        cat "$file" > "$tmp_file"
        echo "${key} = \"${escaped}\"" >> "$tmp_file"
    fi

    mv "$tmp_file" "$file"
}

upsert_tfvar_raw() {
    local key="$1"
    local value="$2"
    local file="$3"
    local tmp_file

    tmp_file="$(mktemp)"

    if [[ ! -f "$file" ]]; then
        touch "$file"
    fi

    if grep -Eq "^[[:space:]]*${key}[[:space:]]*=" "$file"; then
        awk -v k="$key" -v v="$value" '
      BEGIN { updated = 0 }
      $0 ~ "^[[:space:]]*" k "[[:space:]]*=" {
        print k " = " v
        updated = 1
        next
      }
      { print }
      END {
        if (updated == 0) {
          print k " = " v
        }
      }
    ' "$file" > "$tmp_file"
    else
        cat "$file" > "$tmp_file"
        echo "${key} = ${value}" >> "$tmp_file"
    fi

    mv "$tmp_file" "$file"
}

require_command() {
    local cmd="$1"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        log_error "Required command not found: $cmd"
        exit 1
    fi
}

run_terraform() {
    require_command terraform
    terraform -chdir="${ROOT_DIR}/terraform" "$@"
}

is_true() {
    local value
    value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
    [[ "$value" == "true" || "$value" == "1" || "$value" == "yes" || "$value" == "y" ]]
}

resolve_extra_volume_config() {
    local tf_enabled
    local tf_size
    local tf_vpus
    local tf_device

    tf_enabled="$(read_tfvar extra_block_volume_enabled "$TFVARS_PATH")"
    tf_size="$(read_tfvar extra_block_volume_size_gbs "$TFVARS_PATH")"
    tf_vpus="$(read_tfvar extra_block_volume_vpus_per_gb "$TFVARS_PATH")"
    tf_device="$(read_tfvar extra_block_volume_device "$TFVARS_PATH")"

    RESOLVED_EXTRA_VOLUME_ENABLED="${RAW_EXTRA_VOLUME_ENABLED:-$tf_enabled}"
    RESOLVED_EXTRA_VOLUME_SIZE_GBS="${RAW_EXTRA_VOLUME_SIZE_GBS:-$tf_size}"
    RESOLVED_EXTRA_VOLUME_VPUS_PER_GB="${RAW_EXTRA_VOLUME_VPUS_PER_GB:-$tf_vpus}"
    RESOLVED_EXTRA_VOLUME_DEVICE="${RAW_EXTRA_VOLUME_DEVICE:-$tf_device}"

    [[ -n "$RESOLVED_EXTRA_VOLUME_ENABLED" ]] || RESOLVED_EXTRA_VOLUME_ENABLED="true"
    [[ -n "$RESOLVED_EXTRA_VOLUME_SIZE_GBS" ]] || RESOLVED_EXTRA_VOLUME_SIZE_GBS="200"
    [[ -n "$RESOLVED_EXTRA_VOLUME_VPUS_PER_GB" ]] || RESOLVED_EXTRA_VOLUME_VPUS_PER_GB="10"
    [[ -n "$RESOLVED_EXTRA_VOLUME_DEVICE" ]] || RESOLVED_EXTRA_VOLUME_DEVICE="/dev/oracleoci/oraclevdb"

    if ! [[ "$RESOLVED_EXTRA_VOLUME_SIZE_GBS" =~ ^[0-9]+$ ]] || [ "$RESOLVED_EXTRA_VOLUME_SIZE_GBS" -lt 50 ]; then
        log_error "Extra block volume size must be an integer >= 50 GiB"
        exit 1
    fi

    if ! [[ "$RESOLVED_EXTRA_VOLUME_VPUS_PER_GB" =~ ^[0-9]+$ ]]; then
        log_error "Extra block volume VPUs/GB must be an integer"
        exit 1
    fi
}

get_instance_availability_domain() {
    local instance_id="$1"
    oci compute instance get \
        --instance-id "$instance_id" \
        --region "$REGION" \
        --query 'data."availability-domain"' \
        --raw-output 2>/dev/null
}

get_extra_volume_name() {
    echo "${INSTANCE_NAME}-data"
}

get_extra_volume_id() {
    local availability_domain="$1"
    local volume_name

    volume_name="$(get_extra_volume_name)"
    oci bv volume list \
        --compartment-id "$COMPARTMENT_ID" \
        --availability-domain "$availability_domain" \
        --region "$REGION" \
        --all \
        --query "data[?\"display-name\" == '${volume_name}' && \"lifecycle-state\" != 'TERMINATED'] | [0].id" \
        --raw-output 2>/dev/null
}

ensure_extra_block_volume() {
    local instance_id="$1"
    local availability_domain="$2"
    local volume_id
    local attachment_id
    local volume_name

    if ! is_true "$RESOLVED_EXTRA_VOLUME_ENABLED"; then
        return 0
    fi

    volume_name="$(get_extra_volume_name)"
    volume_id="$(get_extra_volume_id "$availability_domain")"

    if [ -z "$volume_id" ] || [ "$volume_id" = "null" ]; then
        log_step "Creating Extra OCI Block Volume"
        log_info "Volume: ${volume_name} (${RESOLVED_EXTRA_VOLUME_SIZE_GBS} GiB, ${RESOLVED_EXTRA_VOLUME_VPUS_PER_GB} VPUs/GB)"
        volume_id=$(oci bv volume create \
            --compartment-id "$COMPARTMENT_ID" \
            --availability-domain "$availability_domain" \
            --display-name "$volume_name" \
            --size-in-gbs "$RESOLVED_EXTRA_VOLUME_SIZE_GBS" \
            --vpus-per-gb "$RESOLVED_EXTRA_VOLUME_VPUS_PER_GB" \
            --freeform-tags '{"project":"optiora","purpose":"app-data"}' \
            --wait-for-state AVAILABLE \
            --max-wait-seconds 1800 \
            --region "$REGION" \
            --query 'data.id' \
            --raw-output)
        log_success "Extra block volume created: $volume_id"
    else
        log_success "Using existing extra block volume: $volume_id"
    fi

    attachment_id=$(oci compute volume-attachment list \
        --compartment-id "$COMPARTMENT_ID" \
        --instance-id "$instance_id" \
        --volume-id "$volume_id" \
        --region "$REGION" \
        --all \
        --query 'data[0].id' \
        --raw-output 2>/dev/null || echo "")

    if [ -z "$attachment_id" ] || [ "$attachment_id" = "null" ]; then
        log_info "Attaching extra block volume to instance..."
        oci compute volume-attachment attach-paravirtualized-volume \
            --instance-id "$instance_id" \
            --volume-id "$volume_id" \
            --device "$RESOLVED_EXTRA_VOLUME_DEVICE" \
            --display-name "$volume_name" \
            --wait-for-state ATTACHED \
            --max-wait-seconds 1800 \
            --region "$REGION" >/dev/null
        log_success "Extra block volume attached at ${RESOLVED_EXTRA_VOLUME_DEVICE}"
    else
        log_success "Extra block volume already attached"
    fi
}

show_help() {
    cat << EOF
${BLUE}OptiOra OCI Deployment Script${NC}

${YELLOW}USAGE:${NC}
    $0 [COMMAND]

${YELLOW}COMMANDS:${NC}
    menu                 Interactive deployment menu (scratch setup, review/fix, CIDR management, ideas)
    full                 Fancy end-to-end flow (Terraform + compute + Ansible + verify)
    compute              Create/start instance and deploy local code (default)
    status               Check current deployment status
    verify               Run end-to-end verification against the deployed dashboard and API
    logs                 Show SSH commands to inspect logs
    stop                 Stop deployed compute instance
    start                Start deployed compute instance
    restart              Reboot deployed compute instance
    destroy              Remove deployment (WARNING: irreversible)
    --help               Show this help message

${YELLOW}DEFAULT TARGET:${NC}
    OCI compartment: ${DEFAULT_COMPARTMENT_ID}
    Override with OCI_COMPARTMENT_ID when needed.

${YELLOW}COMMON ENV:${NC}
    OCI_REGION                 Region (default: uk-london-1)
    OCI_INSTANCE_NAME          VM display name (default: optiora-api)
    OCI_SHAPE                  VM shape (default: VM.Standard.E4.Flex)
    OCI_OCPU_COUNT             vCPU count (default: 2)
    OCI_MEMORY_GB              Memory GB (default: 8)
    OCI_PROFILE                OCI CLI profile for image lookup (default: DEFAULT)
    OCI_IMAGE_COMPARTMENT_ID   Optional image compartment override (defaults to profile tenancy)
    OCI_IMAGE_OS               OS image family (default: Oracle Linux)
    OCI_IMAGE_OS_VERSION       OS major version (default: 9)
    OCI_SUBNET_ID              Subnet OCID (recommended)
    OCI_VCN_ID                 Optional if auto-selecting subnet
    OCI_ASSIGN_PUBLIC_IP       true/false (default: true)
    OCI_SSH_PRIVATE_KEY_PATH   Private key path for SSH/SCP
    OCI_SSH_PUBLIC_KEY_PATH    Public key path for instance metadata
    OCI_SSH_PUBLIC_KEY         Raw public key string alternative
    OCI_INSTANCE_USER          SSH user (default: opc)
    OCI_APP_DIR                App directory on VM (default: /opt/optiora)
    OCI_EXTRA_VOLUME_ENABLED   Attach extra data volume (default: true)
    OCI_EXTRA_VOLUME_SIZE_GBS  Extra data volume size in GiB (default: 200)
    OCI_EXTRA_VOLUME_VPUS_PER_GB Extra data volume performance tier (default: 10)
    OCI_EXTRA_VOLUME_DEVICE    Device path presented to the VM (default: /dev/oracleoci/oraclevdb)
    OCI_GENAI_COMPARTMENT_ID   Optional GenAI-specific compartment OCID

${YELLOW}EXAMPLE:${NC}
    export OCI_COMPARTMENT_ID=ocid1.compartment.oc1..override_if_needed
    export OCI_SUBNET_ID=ocid1.subnet.oc1...
    export OCI_SSH_PRIVATE_KEY_PATH=~/.ssh/optiora-deploy
    export OCI_PROFILE=DEFAULT
    ./deploy/deploy-oci.sh compute
EOF
}

check_prerequisites() {
    log_step "Checking Prerequisites"

    require_command oci
    require_command ssh
    require_command scp
    require_command tar
    require_command base64
    require_command curl
    log_success "Local CLI tools found"

    if [ ! -f "$HOME/.oci/config" ]; then
        log_error "OCI config not found at ~/.oci/config"
        log_info "Run: oci setup config"
        exit 1
    fi
    log_success "OCI config found"

    if [ -z "$COMPARTMENT_ID" ]; then
        log_error "Compartment ID is empty after resolution"
        exit 1
    fi
    log_success "Compartment ID configured: $COMPARTMENT_ID"

    if [ ! -f "${ROOT_DIR}/.env.example" ]; then
        log_error ".env.example not found in project root"
        exit 1
    fi
    log_success "Project files detected"
}

get_instance_json() {
    oci compute instance list \
        --compartment-id "$COMPARTMENT_ID" \
        --region "$REGION" \
        --query "data[?\"display-name\" == '$INSTANCE_NAME' && \"lifecycle-state\" != 'TERMINATED'] | [0]" \
        2>/dev/null || echo "null"
}

get_instance_id() {
    local instance
    instance=$(get_instance_json)
    if [ "$instance" = "null" ] || [ -z "$instance" ]; then
        return 1
    fi
    echo "$instance" | grep -o '"id": "[^"]*' | cut -d'"' -f4
}

get_instance_state() {
    local instance
    instance=$(get_instance_json)
    if [ "$instance" = "null" ] || [ -z "$instance" ]; then
        return 1
    fi
    echo "$instance" | grep -o '"lifecycle-state": "[^"]*' | cut -d'"' -f4
}

get_public_ip_for_instance() {
    local instance_id="$1"
    oci compute instance list-vnics \
        --instance-id "$instance_id" \
        --region "$REGION" \
        --query 'data[0]."public-ip"' \
        --raw-output 2>/dev/null
}

resolve_subnet_id() {
    if [ -n "$SUBNET_ID" ]; then
        RESOLVED_SUBNET_ID="$SUBNET_ID"
        log_success "Using OCI_SUBNET_ID=$RESOLVED_SUBNET_ID"
        return
    fi

    local resolved_vcn_id
    resolved_vcn_id="$VCN_ID"

    if [ -z "$resolved_vcn_id" ]; then
        resolved_vcn_id=$(oci network vcn list \
            --compartment-id "$COMPARTMENT_ID" \
            --region "$REGION" \
            --query "data[?\"lifecycle-state\" == 'AVAILABLE'].id | [0]" \
            --raw-output 2>/dev/null || echo "")
    fi

    if [ -z "$resolved_vcn_id" ] || [ "$resolved_vcn_id" = "null" ]; then
        log_error "Could not resolve a VCN. Set OCI_SUBNET_ID explicitly."
        exit 1
    fi

    if [ "$ASSIGN_PUBLIC_IP" = "true" ]; then
        RESOLVED_SUBNET_ID=$(oci network subnet list \
            --compartment-id "$COMPARTMENT_ID" \
            --vcn-id "$resolved_vcn_id" \
            --region "$REGION" \
            --query "data[?\"lifecycle-state\" == 'AVAILABLE' && \"prohibit-public-ip-on-vnic\" == \`false\`].id | [0]" \
            --raw-output 2>/dev/null || echo "")
    else
        RESOLVED_SUBNET_ID=$(oci network subnet list \
            --compartment-id "$COMPARTMENT_ID" \
            --vcn-id "$resolved_vcn_id" \
            --region "$REGION" \
            --query "data[?\"lifecycle-state\" == 'AVAILABLE'].id | [0]" \
            --raw-output 2>/dev/null || echo "")
    fi

    if [ -z "$RESOLVED_SUBNET_ID" ] || [ "$RESOLVED_SUBNET_ID" = "null" ]; then
        log_error "Could not resolve a subnet automatically. Set OCI_SUBNET_ID."
        exit 1
    fi

    log_success "Auto-selected subnet: $RESOLVED_SUBNET_ID"
}

resolve_ssh_credentials() {
    local pub_path="$SSH_PUBLIC_KEY_PATH"
    local priv_path="$SSH_PRIVATE_KEY_PATH"

    if [ -n "$SSH_PUBLIC_KEY_VALUE" ]; then
        RESOLVED_SSH_PUBLIC_KEY_PATH=$(mktemp)
        printf '%s\n' "$SSH_PUBLIC_KEY_VALUE" > "$RESOLVED_SSH_PUBLIC_KEY_PATH"
        RESOLVED_SSH_PUBLIC_KEY="$SSH_PUBLIC_KEY_VALUE"
    else
        if [ -z "$pub_path" ]; then
            if [ -n "$priv_path" ] && [ -f "${priv_path}.pub" ]; then
                pub_path="${priv_path}.pub"
            elif [ -f "$HOME/.ssh/optiora-deploy.pub" ]; then
                pub_path="$HOME/.ssh/optiora-deploy.pub"
            elif [ -f "$HOME/.ssh/id_ed25519.pub" ]; then
                pub_path="$HOME/.ssh/id_ed25519.pub"
            elif [ -f "$HOME/.ssh/id_rsa.pub" ]; then
                pub_path="$HOME/.ssh/id_rsa.pub"
            else
                log_error "No SSH public key found. Set OCI_SSH_PUBLIC_KEY_PATH or OCI_SSH_PUBLIC_KEY."
                exit 1
            fi
        fi

        if [ ! -f "$pub_path" ]; then
            log_error "SSH public key file not found: $pub_path"
            exit 1
        fi
        RESOLVED_SSH_PUBLIC_KEY_PATH="$pub_path"
        RESOLVED_SSH_PUBLIC_KEY=$(tr -d '\n' < "$pub_path")
    fi

    if [ -z "$priv_path" ]; then
        if [ -f "$HOME/.ssh/optiora-deploy" ]; then
            priv_path="$HOME/.ssh/optiora-deploy"
        elif [ -f "$HOME/.ssh/id_ed25519" ]; then
            priv_path="$HOME/.ssh/id_ed25519"
        elif [ -f "$HOME/.ssh/id_rsa" ]; then
            priv_path="$HOME/.ssh/id_rsa"
        else
            log_error "No SSH private key found. Set OCI_SSH_PRIVATE_KEY_PATH."
            exit 1
        fi
    fi

    if [ ! -f "$priv_path" ]; then
        log_error "SSH private key file not found: $priv_path"
        exit 1
    fi

    if ! ssh-keygen -y -f "$priv_path" >/dev/null 2>&1; then
        log_error "SSH private key is unreadable or invalid: $priv_path"
        exit 1
    fi

    RESOLVED_SSH_PRIVATE_KEY_PATH="$priv_path"
    log_success "SSH credentials resolved for local-to-OCI deployment"
}

resolve_image_compartment_id() {
    if [ -n "$IMAGE_COMPARTMENT_ID" ]; then
        RESOLVED_IMAGE_COMPARTMENT_ID="$IMAGE_COMPARTMENT_ID"
        log_success "Using OCI_IMAGE_COMPARTMENT_ID=$RESOLVED_IMAGE_COMPARTMENT_ID for platform image lookup"
        return
    fi

    local config_file="${OCI_CONFIG_FILE:-$HOME/.oci/config}"
    if [ ! -f "$config_file" ]; then
        log_error "OCI config not found while resolving image compartment: $config_file"
        exit 1
    fi

    RESOLVED_IMAGE_COMPARTMENT_ID=$(awk -F= -v profile="$CLI_PROFILE" '
        BEGIN {
            section = "[" profile "]"
            in_section = 0
        }
        $0 == section {
            in_section = 1
            next
        }
        /^\[/ && $0 != section {
            in_section = 0
        }
        in_section && $1 == "tenancy" {
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2)
            print $2
            exit
        }
    ' "$config_file")

    if [ -z "$RESOLVED_IMAGE_COMPARTMENT_ID" ]; then
        log_error "Could not resolve tenancy OCID from OCI config profile '$CLI_PROFILE'. Set OCI_IMAGE_COMPARTMENT_ID explicitly."
        exit 1
    fi

    log_success "Resolved platform image compartment from OCI profile '$CLI_PROFILE'"
}

find_latest_compatible_image() {
    local image_ids_json
    local image_id

    image_ids_json=$(oci compute image list \
        --compartment-id "$RESOLVED_IMAGE_COMPARTMENT_ID" \
        --region "$REGION" \
        --operating-system "$IMAGE_OS" \
        --operating-system-version "$IMAGE_OS_VERSION" \
        --query "reverse(sort_by(data, &\"time-created\"))[0:50].id" \
        2>/dev/null || echo "")

    if [ -z "$image_ids_json" ] || [ "$image_ids_json" = "null" ]; then
        return 1
    fi

    while IFS= read -r image_id; do
        if [ -z "$image_id" ]; then
            continue
        fi
        if oci compute image-shape-compatibility-entry get \
            --image-id "$image_id" \
            --shape-name "$SHAPE" \
            --region "$REGION" >/dev/null 2>&1; then
            echo "$image_id"
            return 0
        fi
    done < <(printf '%s\n' "$image_ids_json" | grep -o 'ocid1\.image[^"[:space:]]*' || true)

    return 1
}

wait_for_ssh() {
    local public_ip="$1"
    log_info "Waiting for SSH on ${REMOTE_USER}@${public_ip} ..."

    for _ in {1..36}; do
        if ssh -o ConnectTimeout=8 \
            -o StrictHostKeyChecking=no \
            -o UserKnownHostsFile=/dev/null \
            -i "$RESOLVED_SSH_PRIVATE_KEY_PATH" \
            "${REMOTE_USER}@${public_ip}" "echo ready" >/dev/null 2>&1; then
            log_success "SSH is ready"
            return 0
        fi
        sleep 10
    done

    log_error "SSH did not become ready in time"
    return 1
}

sync_local_project() {
    local public_ip="$1"
    local unpack_remote="${2:-true}"
    local archive_path="/tmp/optiora-deploy-$$.tar.gz"
    local local_private_key_path=""

    log_step "Uploading Local Project To OCI VM"
    log_info "Deployment source: local filesystem snapshot from this laptop (no Git clone)."
    log_info "Creating deployment archive from local workspace..."
    COPYFILE_DISABLE=1 tar -czf "$archive_path" \
        --exclude=".git" \
        --exclude=".venv" \
        --exclude=".pytest_cache" \
        --exclude="__pycache__" \
        --exclude=".DS_Store" \
        --exclude="._*" \
        --exclude="dashboard/node_modules" \
        --exclude="dashboard/.next" \
        --exclude="dashboard/tsconfig.tsbuildinfo" \
        --exclude="optiora.db" \
        .

    log_info "Copying archive to ${REMOTE_USER}@${public_ip} ..."
    scp -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -i "$RESOLVED_SSH_PRIVATE_KEY_PATH" \
        "$archive_path" "${REMOTE_USER}@${public_ip}:/tmp/optiora-deploy.tar.gz"

    if [ -f ".env" ]; then
        local_private_key_path=$(grep '^OCI_PRIVATE_KEY_PATH=' .env | tail -1 | cut -d'=' -f2- || true)
        local_private_key_path="${local_private_key_path%\"}"
        local_private_key_path="${local_private_key_path#\"}"
        if [ -n "$local_private_key_path" ]; then
            if [[ "$local_private_key_path" == ~/* ]]; then
                local_private_key_path="${HOME}${local_private_key_path#\~}"
            fi
            if [ -f "$local_private_key_path" ]; then
                log_info "Copying OCI private key referenced by OCI_PRIVATE_KEY_PATH into the deployment bundle..."
                scp -o StrictHostKeyChecking=no \
                    -o UserKnownHostsFile=/dev/null \
                    -i "$RESOLVED_SSH_PRIVATE_KEY_PATH" \
                    "$local_private_key_path" "${REMOTE_USER}@${public_ip}:/tmp/optiora-oci-api-key.pem"
            else
                log_warning "OCI_PRIVATE_KEY_PATH is set locally but the file was not found: $local_private_key_path"
            fi
        fi
    fi

    rm -f "$archive_path"

    if [[ "$unpack_remote" != "true" ]]; then
        log_success "Deployment archive uploaded to VM"
        return 0
    fi

    log_info "Unpacking project on VM ..."
    ssh -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -i "$RESOLVED_SSH_PRIVATE_KEY_PATH" \
        "${REMOTE_USER}@${public_ip}" "sudo APP_DIR='$APP_DIR' bash -s" <<'EOF'
set -euo pipefail

mkdir -p "$APP_DIR"
if [ -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env" /tmp/optiora.env.backup
fi

find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name ".env" -exec rm -rf {} +
tar -xzf /tmp/optiora-deploy.tar.gz -C "$APP_DIR"
rm -f /tmp/optiora-deploy.tar.gz
find "$APP_DIR" -name '._*' -delete
find "$APP_DIR" -name '.DS_Store' -delete

if [ -f /tmp/optiora.env.backup ]; then
    cp /tmp/optiora.env.backup "$APP_DIR/.env"
    rm -f /tmp/optiora.env.backup
fi

restorecon -RF "$APP_DIR" >/dev/null 2>&1 || true
EOF

    log_success "Local project uploaded to VM"
}

prepare_compute_instance() {
    log_step "Preparing OCI Compute Instance"
    log_info "Region: $REGION"
    log_info "Shape: $SHAPE | OCPUs: $OCPU_COUNT | Memory: ${MEMORY_GB}GB"
    log_info "Instance: $INSTANCE_NAME"

    resolve_subnet_id
    resolve_ssh_credentials
    resolve_image_compartment_id
    resolve_extra_volume_config

    if [ "$DRY_RUN" = "true" ]; then
        log_warning "DRY RUN mode enabled"
        log_info "Would use subnet: $RESOLVED_SUBNET_ID"
        log_info "Would use SSH key: $RESOLVED_SSH_PRIVATE_KEY_PATH"
        log_info "Would use image compartment: $RESOLVED_IMAGE_COMPARTMENT_ID"
        if is_true "$RESOLVED_EXTRA_VOLUME_ENABLED"; then
            log_info "Would provision extra block volume: ${RESOLVED_EXTRA_VOLUME_SIZE_GBS} GiB at ${RESOLVED_EXTRA_VOLUME_DEVICE}"
        fi
        return 0
    fi

    local instance_id=""
    local state=""
    local instance_found="false"

    if instance_id=$(get_instance_id); then
        state=$(get_instance_state || echo "")
        log_info "Found existing instance: $instance_id (state: $state)"
        if [ "$state" = "TERMINATED" ]; then
            log_info "Instance is TERMINATED — creating a new one"
            instance_found="false"
            instance_id=""
        else
            instance_found="true"
        fi
    fi

    if [ "$instance_found" = "false" ]; then
        local image_id
        local ad
        local response
        local launch_status

        if [ "$IMAGE_OS" != "Oracle Linux" ]; then
            log_error "Only Oracle Linux images are supported for this deployment flow."
            log_info "Set OCI_IMAGE_OS=Oracle Linux"
            exit 1
        fi

        log_info "Finding latest ${IMAGE_OS} ${IMAGE_OS_VERSION} image compatible with shape ${SHAPE}..."
        image_id=$(find_latest_compatible_image || true)

        if [ -z "$image_id" ] || [ "$image_id" = "null" ]; then
            log_error "Could not find a compatible ${IMAGE_OS} ${IMAGE_OS_VERSION} image for shape ${SHAPE} from image compartment $RESOLVED_IMAGE_COMPARTMENT_ID"
            exit 1
        fi
        log_success "Image: $image_id"

        ad=$(oci network subnet get \
            --subnet-id "$RESOLVED_SUBNET_ID" \
            --region "$REGION" \
            --query 'data."availability-domain"' \
            --raw-output 2>/dev/null || echo "")
        if [ -z "$ad" ] || [ "$ad" = "null" ]; then
            ad=$(oci iam availability-domain list \
                --region "$REGION" \
                --query 'data[0].name' \
                --raw-output)
        fi
        log_info "Availability domain: $ad"

        log_info "Creating compute instance..."
        set +e
        response=$(oci compute instance launch \
            --compartment-id "$COMPARTMENT_ID" \
            --availability-domain "$ad" \
            --display-name "$INSTANCE_NAME" \
            --image-id "$image_id" \
            --shape "$SHAPE" \
            --shape-config "{\"ocpus\":${OCPU_COUNT},\"memoryInGBs\":${MEMORY_GB}}" \
            --subnet-id "$RESOLVED_SUBNET_ID" \
            --assign-public-ip "$ASSIGN_PUBLIC_IP" \
            --ssh-authorized-keys-file "$RESOLVED_SSH_PUBLIC_KEY_PATH" \
            --wait-for-state RUNNING \
            --region "$REGION" \
            --max-wait-seconds 900 \
            2>&1)
        launch_status=$?
        set -e

        if [ "$launch_status" -ne 0 ]; then
            log_error "Compute instance launch failed"
            printf '%s\n' "$response"
            exit "$launch_status"
        fi

        instance_id=$(echo "$response" | grep -o '"id": "[^"]*' | head -1 | cut -d'"' -f4)
        if [ -z "$instance_id" ]; then
            log_error "Failed to create instance"
            exit 1
        fi
        log_success "Instance created: $instance_id"
    else
        ensure_instance_running "$instance_id" "$state"
    fi

    CURRENT_INSTANCE_ID="$instance_id"
    CURRENT_AVAILABILITY_DOMAIN="$(get_instance_availability_domain "$instance_id")"

    CURRENT_PUBLIC_IP=$(get_public_ip_for_instance "$instance_id")
    if [ -z "$CURRENT_PUBLIC_IP" ] || [ "$CURRENT_PUBLIC_IP" = "null" ]; then
        log_error "Could not resolve public IP for instance"
        log_info "Ensure subnet allows public IPs or set OCI_ASSIGN_PUBLIC_IP=true"
        exit 1
    fi
    log_success "Instance public IP: $CURRENT_PUBLIC_IP"

    wait_for_ssh "$CURRENT_PUBLIC_IP"
}

ensure_instance_running() {
    local instance_id="$1"
    local state="$2"

    if [ "$state" = "RUNNING" ]; then
        return
    fi

    log_info "Starting instance ${instance_id} ..."
    oci compute instance action \
        --instance-id "$instance_id" \
        --action START \
        --region "$REGION" \
        --wait-for-state RUNNING \
        --max-wait-seconds 600 >/dev/null
}

deploy_compute() {
    local deploy_started_at
    local deploy_elapsed

    deploy_started_at=$(date +%s)
    prepare_compute_instance

    ensure_extra_block_volume "$CURRENT_INSTANCE_ID" "$CURRENT_AVAILABILITY_DOMAIN"
    sync_local_project "$CURRENT_PUBLIC_IP" false
    run_ansible_playbook_for_instance "$CURRENT_PUBLIC_IP"

    log_step "Deployment Complete"
    log_success "Dashboard: http://$CURRENT_PUBLIC_IP:3000"
    log_success "API: http://$CURRENT_PUBLIC_IP:8000"
    log_info "Verification: ./deploy/deploy-oci.sh verify"
    log_info "API logs:   sudo journalctl -u optiora-api -n 100 --no-pager"
    log_info "UI logs:    sudo journalctl -u optiora-dashboard -n 100 --no-pager"
    deploy_elapsed=$(( $(date +%s) - deploy_started_at ))
    log_success "End-to-end compute deploy time: $(format_duration "$deploy_elapsed")"
}

instance_action() {
    local action="$1"
    local wait_state="$2"
    local instance_id

    if ! instance_id=$(get_instance_id); then
        log_error "No deployment found with name: $INSTANCE_NAME"
        return 1
    fi

    log_info "Applying action '$action' to instance $instance_id..."
    oci compute instance action \
        --instance-id "$instance_id" \
        --action "$action" \
        --region "$REGION" \
        --wait-for-state "$wait_state" \
        --max-wait-seconds 600 >/dev/null

    log_success "Instance action '$action' completed"
    get_status
}

get_status() {
    log_step "Checking Deployment Status"

    local instance
    local instance_id
    local state
    local public_ip

    instance=$(get_instance_json)
    if [ "$instance" = "null" ] || [ -z "$instance" ]; then
        log_warning "No deployment found with name: $INSTANCE_NAME"
        return 1
    fi

    instance_id=$(echo "$instance" | grep -o '"id": "[^"]*' | cut -d'"' -f4)
    state=$(echo "$instance" | grep -o '"lifecycle-state": "[^"]*' | cut -d'"' -f4)

    log_info "Instance: $INSTANCE_NAME"
    log_info "Instance ID: $instance_id"
    log_info "State: $state"

    resolve_extra_volume_config

    if [ "$state" = "RUNNING" ]; then
        public_ip=$(get_public_ip_for_instance "$instance_id")
        if [ -n "$public_ip" ] && [ "$public_ip" != "null" ]; then
            log_info "Public IP: $public_ip"
            log_info "Dashboard URL: http://$public_ip:3000"
            log_info "API URL: http://$public_ip:8000"
        fi
    fi

    if is_true "$RESOLVED_EXTRA_VOLUME_ENABLED"; then
        local ad
        local volume_id
        ad="$(get_instance_availability_domain "$instance_id")"
        volume_id="$(get_extra_volume_id "$ad")"
        if [ -n "$volume_id" ] && [ "$volume_id" != "null" ]; then
            log_info "Extra data volume: $volume_id (${RESOLVED_EXTRA_VOLUME_SIZE_GBS} GiB target, device ${RESOLVED_EXTRA_VOLUME_DEVICE})"
        else
            log_warning "Extra data volume enabled in config but not found yet"
        fi
    fi
}

view_logs() {
    log_step "Log Access"
    resolve_ssh_credentials

    local instance_id
    local public_ip

    if ! instance_id=$(get_instance_id); then
        log_error "No deployment found"
        return 1
    fi

    public_ip=$(get_public_ip_for_instance "$instance_id")
    if [ -z "$public_ip" ] || [ "$public_ip" = "null" ]; then
        log_error "Could not resolve public IP"
        return 1
    fi

    log_info "Use the following commands from your laptop:"
    echo "ssh -i \"$RESOLVED_SSH_PRIVATE_KEY_PATH\" ${REMOTE_USER}@${public_ip}"
    echo "sudo journalctl -u optiora-api -n 100 --no-pager"
    echo "sudo journalctl -u optiora-dashboard -n 100 --no-pager"
    echo "sudo tail -f /var/log/optiora-api.log"
}

verify_deployment() {
    log_step "Running Deployment Verification"

    local instance_id
    local public_ip

    if ! instance_id=$(get_instance_id); then
        log_error "No deployment found"
        return 1
    fi

    public_ip=$(get_public_ip_for_instance "$instance_id")
    if [ -z "$public_ip" ] || [ "$public_ip" = "null" ]; then
        log_error "Could not resolve public IP"
        return 1
    fi

    local direct_api="http://${public_ip}:8000"
    local direct_dashboard="http://${public_ip}:3000"
    local front_api="http://${public_ip}"
    local front_dashboard="http://${public_ip}"
    local selected_api=""
    local selected_dashboard=""

    if curl -fsS --max-time 8 "${direct_api}/health" >/dev/null 2>&1; then
        selected_api="$direct_api"
    elif curl -fsS --max-time 8 "${front_api}/health" >/dev/null 2>&1; then
        selected_api="$front_api"
    else
        selected_api="$direct_api"
    fi

    if curl -fsS --max-time 8 "${direct_dashboard}/dashboard" >/dev/null 2>&1; then
        selected_dashboard="$direct_dashboard"
    elif curl -fsS --max-time 8 "${front_dashboard}/dashboard" >/dev/null 2>&1; then
        selected_dashboard="$front_dashboard"
    else
        selected_dashboard="$direct_dashboard"
    fi

    log_info "Verification API base: ${selected_api}"
    log_info "Verification dashboard base: ${selected_dashboard}"

    HOST="http://${public_ip}" \
    API_BASE="${selected_api}" \
    DASHBOARD_BASE="${selected_dashboard}" \
    bash "$(dirname "$0")/../tests/smoke_test_0_9.sh"
}

run_ansible_playbook_for_instance() {
    local public_ip="$1"

    require_command ansible-playbook

    local inv
    local ssh_user
    local ssh_key
    local genai_key_path=""
    local local_oci_key_path=""
    local local_oci_config_file=""
    local runtime_oci_config_file=""
    local local_oci_profile=""
    local genai_model=""
    local genai_endpoint=""

    ssh_user="${OCI_ANSIBLE_USER:-$REMOTE_USER}"
    ssh_key="${OCI_ANSIBLE_SSH_KEY_PATH:-$RESOLVED_SSH_PRIVATE_KEY_PATH}"
    inv="$(mktemp -t optiora-inventory.XXXXXX).yml"

    # Resolve OCI private key path for GenAI (env var > local .env file).
    local_oci_key_path="${OCI_PRIVATE_KEY_PATH:-}"
    local_oci_config_file="${OCI_CONFIG_FILE:-}"
    local_oci_profile="${OCI_PROFILE:-${OCI_CLI_PROFILE:-DEFAULT}}"
    genai_model="${OCI_GENAI_MODEL:-}"
    genai_endpoint="${OCI_GENAI_ENDPOINT:-}"

    if [ -f "${ROOT_DIR}/.env" ]; then
        if [ -z "$local_oci_key_path" ]; then
            local_oci_key_path=$(grep '^OCI_PRIVATE_KEY_PATH=' "${ROOT_DIR}/.env" | tail -1 | cut -d'=' -f2- || true)
            local_oci_key_path="${local_oci_key_path%\"}"
            local_oci_key_path="${local_oci_key_path#\"}"
        fi
        if [ -z "$local_oci_config_file" ]; then
            local_oci_config_file=$(grep '^OCI_CONFIG_FILE=' "${ROOT_DIR}/.env" | tail -1 | cut -d'=' -f2- || true)
            local_oci_config_file="${local_oci_config_file%\"}"
            local_oci_config_file="${local_oci_config_file#\"}"
        fi
        if [ -z "$genai_model" ]; then
            genai_model=$(grep '^OCI_GENAI_MODEL=' "${ROOT_DIR}/.env" | tail -1 | cut -d'=' -f2- || true)
            genai_model="${genai_model%\"}"
            genai_model="${genai_model#\"}"
        fi
        if [ -z "$genai_endpoint" ]; then
            genai_endpoint=$(grep '^OCI_GENAI_ENDPOINT=' "${ROOT_DIR}/.env" | tail -1 | cut -d'=' -f2- || true)
            genai_endpoint="${genai_endpoint%\"}"
            genai_endpoint="${genai_endpoint#\"}"
        fi
    fi

    if [[ "$local_oci_key_path" == ~/* ]]; then
        local_oci_key_path="${HOME}${local_oci_key_path#\~}"
    fi
    if [[ "$local_oci_config_file" == ~/* ]]; then
        local_oci_config_file="${HOME}${local_oci_config_file#\~}"
    fi

    if [ -n "$local_oci_key_path" ] && [ -f "$local_oci_key_path" ]; then
        genai_key_path="/opt/optiora/oci_api_key.pem"
        log_info "Copying OCI API key to VM for GenAI use..."
        scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
            -i "$ssh_key" \
            "$local_oci_key_path" "${ssh_user}@${public_ip}:/tmp/optiora-oci-api-key.pem"
    fi

    if [ -n "$local_oci_config_file" ] && [ -f "$local_oci_config_file" ]; then
        runtime_oci_config_file="/opt/optiora/oci_config"
        log_info "Copying OCI config file to VM for GenAI/OCI SDK use..."
        scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
            -i "$ssh_key" \
            "$local_oci_config_file" "${ssh_user}@${public_ip}:/tmp/optiora-oci-config"
    elif [ -n "$local_oci_config_file" ]; then
        # Assume caller provided a path already valid on the VM.
        runtime_oci_config_file="$local_oci_config_file"
    fi

    cat > "$inv" <<EOF
all:
  children:
    optiora:
      hosts:
        optiora-prod:
          ansible_host: ${public_ip}
          ansible_user: ${ssh_user}
          ansible_ssh_private_key_file: ${ssh_key}
          optiora_configure_firewall: false
          optiora_firewall_expose_direct_services: true
          optiora_manage_source: true
          optiora_remote_archive: /tmp/optiora-deploy.tar.gz
          optiora_frontend_url: http://${public_ip}:3000
          optiora_api_url: http://${public_ip}:8000
          optiora_region: ${REGION}
          optiora_genai_endpoint: "${genai_endpoint}"
          optiora_genai_model: "${genai_model}"
          optiora_tenancy_ocid: "${OCI_TENANCY_OCID:-}"
          optiora_user_ocid: "${OCI_USER_OCID:-}"
          optiora_fingerprint: "${OCI_FINGERPRINT:-}"
          optiora_private_key_path: "${genai_key_path}"
          optiora_compartment_ocid: "${COMPARTMENT_ID:-}"
          optiora_genai_compartment_ocid: "${OCI_GENAI_COMPARTMENT_ID:-}"
          optiora_oci_config_file: "${runtime_oci_config_file}"
          optiora_oci_profile: "${local_oci_profile}"
EOF

    if is_true "$RESOLVED_EXTRA_VOLUME_ENABLED"; then
        cat >> "$inv" <<EOF
          optiora_data_device: ${RESOLVED_EXTRA_VOLUME_DEVICE}
EOF
    fi

    log_info "Running Ansible post-provisioning hardening/playbook..."
    ANSIBLE_STDOUT_CALLBACK=default ansible-playbook \
        -i "$inv" \
        --extra-vars "@${ROOT_DIR}/ansible/group_vars/all.yml" \
        "${ROOT_DIR}/ansible/playbooks/site.yml"
    rm -f "$inv"
    log_success "Ansible provisioning completed"
}

run_fancy_end_to_end_deploy() {
    local full_started_at
    local full_elapsed

    full_started_at=$(date +%s)
    log_step "Fancy End-to-End Deploy (Terraform + Compute + Ansible)"

    if [[ ! -f "$TFVARS_PATH" && -f "${ROOT_DIR}/terraform/terraform.tfvars.example" ]]; then
        cp "${ROOT_DIR}/terraform/terraform.tfvars.example" "$TFVARS_PATH"
        log_warning "Created terraform/terraform.tfvars from example"
    fi

    run_terraform init
    run_terraform validate
    run_terraform plan -out=tfplan

    if prompt_yes_no "Apply Terraform network baseline now?" true; then
        run_terraform apply tfplan
    else
        log_warning "Terraform apply skipped by user"
    fi

    deploy_compute
    verify_deployment || true

    full_elapsed=$(( $(date +%s) - full_started_at ))
    log_success "End-to-end full deploy time: $(format_duration "$full_elapsed")"
    log_success "End-to-end deployment flow finished"
}

review_and_fix_deployment() {
    log_step "Review Current Deployment And Fix Issues"
    get_status || true

    if verify_deployment; then
        log_success "Deployment verification passed — no repair actions needed"
        return 0
    fi

    log_warning "Verification failed. Attempting automated repair..."
    local instance_id
    local public_ip

    if ! instance_id=$(get_instance_id); then
        log_error "No running deployment found to repair"
        return 1
    fi

    public_ip=$(get_public_ip_for_instance "$instance_id")
    if [[ -z "$public_ip" || "$public_ip" == "null" ]]; then
        log_error "Could not resolve instance public IP for repair"
        return 1
    fi

    resolve_ssh_credentials
    ssh -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -i "$RESOLVED_SSH_PRIVATE_KEY_PATH" \
        "${REMOTE_USER}@${public_ip}" "sudo APP_DIR='$APP_DIR' bash -s" <<'EOF'
set -euo pipefail

if [ -f "$APP_DIR/.env" ]; then
  set -a
  . "$APP_DIR/.env"
  set +a
fi

if [ -d "$APP_DIR/venv" ] && [ -f "$APP_DIR/alembic.ini" ]; then
  "$APP_DIR/venv/bin/alembic" -c "$APP_DIR/alembic.ini" upgrade head || true
fi

systemctl daemon-reload || true
systemctl restart optiora-api.service || true
systemctl restart optiora-dashboard.service || true
EOF

    run_ansible_playbook_for_instance "$public_ip"
    verify_deployment
    log_success "Repair cycle completed"
}

manage_allowed_ips() {
    log_step "Manage Allowed Ingress CIDRs"

    if [[ ! -f "$TFVARS_PATH" && -f "${ROOT_DIR}/terraform/terraform.tfvars.example" ]]; then
        cp "${ROOT_DIR}/terraform/terraform.tfvars.example" "$TFVARS_PATH"
    fi

    local current_laptop
    local new_laptop
    local action
    local cidr
    local list_items=()
    local updated=()

    current_laptop="$(read_tfvar laptop_cidr "$TFVARS_PATH")"
    echo "Current primary laptop CIDR: ${current_laptop:-<unset>}"
    echo "Current additional CIDRs:"
    while IFS= read -r item; do
        list_items+=("$item")
    done < <(read_tfvar_list allowed_public_ingress_cidrs "$TFVARS_PATH")
    if [[ ${#list_items[@]} -eq 0 ]]; then
        echo "  (none)"
    else
        for cidr in "${list_items[@]}"; do
            echo "  - $cidr"
        done
    fi

    if prompt_yes_no "Update primary laptop CIDR?" false; then
        new_laptop="$(prompt_value "Enter new laptop CIDR" "$current_laptop")"
        if [[ -n "$new_laptop" ]]; then
            upsert_tfvar "laptop_cidr" "$new_laptop" "$TFVARS_PATH"
            log_success "Updated laptop_cidr"
        fi
    fi

    action="$(prompt_value "Choose action: add/remove/skip" "skip")"
    case "$action" in
        add|ADD|Add)
            cidr="$(prompt_value "CIDR to add")"
            if [[ -n "$cidr" ]]; then
                updated=("${list_items[@]}")
                updated+=("$cidr")
            fi
            ;;
        remove|REMOVE|Remove)
            cidr="$(prompt_value "CIDR to remove")"
            for item in "${list_items[@]}"; do
                if [[ "$item" != "$cidr" ]]; then
                    updated+=("$item")
                fi
            done
            ;;
        *)
            updated=("${list_items[@]}")
            ;;
    esac

    # de-duplicate list while preserving order
    local dedup=()
    local seen=""
    for item in "${updated[@]}"; do
        [[ -z "$item" ]] && continue
        if [[ ",${seen}," == *",${item},"* ]]; then
            continue
        fi
        dedup+=("$item")
        seen="${seen},${item}"
    done

    local cidr_array="[]"
    if [[ ${#dedup[@]} -gt 0 ]]; then
        cidr_array="["
        for item in "${dedup[@]}"; do
            if [[ "$cidr_array" != "[" ]]; then
                cidr_array+=" , "
            fi
            cidr_array+="\"$item\""
        done
        cidr_array+="]"
    fi
    upsert_tfvar_raw "allowed_public_ingress_cidrs" "$cidr_array" "$TFVARS_PATH"
    log_success "Updated allowed_public_ingress_cidrs"

    run_terraform init
    run_terraform validate
    run_terraform plan
    if prompt_yes_no "Apply security-list CIDR changes now?" true; then
        run_terraform apply -auto-approve
        log_success "Security list CIDR changes applied"
    else
        log_warning "CIDR changes saved in tfvars but not applied"
    fi
}

show_deployment_ideas() {
    log_step "Deployment Ideas"
    cat <<'EOF'
1) Add nginx + TLS front door and disable direct 3000/8000 ingress in Terraform.
2) Add Redis-backed rate limiting for auth endpoints (multi-replica safe).
3) Add blue/green release flow with health-gated service switch and rollback.
4) Add nightly verify + smoke + drift detection job (Terraform plan in CI).
5) Add OCI Load Balancer + WAF for internet-facing production environments.
EOF
}

interactive_deploy_menu() {
    log_step "Interactive Deployment Menu"
    echo "1 - New setup from scratch"
    echo "2 - Review the current deployment and fix issues"
    echo "3 - Add or remove allowed IPs from security list"
    echo "4 - Give some ideas"

    local choice
    choice="$(prompt_value "Select option" "1")"
    case "$choice" in
        1) run_fancy_end_to_end_deploy ;;
        2) review_and_fix_deployment ;;
        3) manage_allowed_ips ;;
        4) show_deployment_ideas ;;
        *) log_error "Invalid menu option: $choice"; return 1 ;;
    esac
}

destroy_deployment() {
    log_step "Destroy Deployment"
    log_warning "This permanently terminates the compute instance and attached storage."
    read -r -p "Type 'yes' to confirm: " CONFIRM

    if [ "$CONFIRM" != "yes" ]; then
        log_info "Cancelled"
        return 0
    fi

    local instance_id
    if ! instance_id=$(get_instance_id); then
        log_warning "No deployment found"
        return 0
    fi

    log_info "Terminating instance $instance_id ..."
    oci compute instance terminate \
        --instance-id "$instance_id" \
        --force \
        --region "$REGION" \
        --wait-for-state TERMINATED \
        --max-wait-seconds 600 >/dev/null || true

    resolve_extra_volume_config
    if is_true "$RESOLVED_EXTRA_VOLUME_ENABLED"; then
        local volume_name
        local volume_id
        volume_name="$(get_extra_volume_name)"
        volume_id=$(oci bv volume list \
            --compartment-id "$COMPARTMENT_ID" \
            --region "$REGION" \
            --all \
            --query "data[?\"display-name\" == '${volume_name}' && \"lifecycle-state\" != 'TERMINATED'] | [0].id" \
            --raw-output 2>/dev/null || echo "")
        if [ -n "$volume_id" ] && [ "$volume_id" != "null" ]; then
            log_info "Deleting extra block volume $volume_id ..."
            oci bv volume delete \
                --volume-id "$volume_id" \
                --region "$REGION" \
                --force \
                --wait-for-state TERMINATED \
                --max-wait-seconds 1800 >/dev/null || true
        fi
    fi

    log_success "Deployment destroyed"
}

main() {
    cd "$ROOT_DIR"
    echo "============================================================"
    echo "OptiOra OCI Deployment"
    echo "Mode: $DEPLOYMENT_TYPE"
    echo "============================================================"

    case "$DEPLOYMENT_TYPE" in
        --help|-h|help)
            show_help
            ;;
        compute)
            check_prerequisites
            deploy_compute
            ;;
        full)
            check_prerequisites
            run_fancy_end_to_end_deploy
            ;;
        menu)
            check_prerequisites
            interactive_deploy_menu
            ;;
        status)
            check_prerequisites
            get_status
            ;;
        logs)
            check_prerequisites
            view_logs
            ;;
        verify)
            check_prerequisites
            verify_deployment
            ;;
        stop)
            check_prerequisites
            instance_action STOP STOPPED
            ;;
        start)
            check_prerequisites
            instance_action START RUNNING
            ;;
        restart)
            check_prerequisites
            instance_action RESET RUNNING
            ;;
        destroy)
            check_prerequisites
            destroy_deployment
            ;;
        *)
            log_error "Unknown command: $DEPLOYMENT_TYPE"
            show_help
            exit 1
            ;;
    esac
}

main
