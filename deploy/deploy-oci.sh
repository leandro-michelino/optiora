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
COMPARTMENT_ID=${OCI_COMPARTMENT_ID:-}
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
CLI_PROFILE=${OCI_PROFILE:-${OCI_CLI_PROFILE:-DEFAULT}}
IMAGE_COMPARTMENT_ID=${OCI_IMAGE_COMPARTMENT_ID:-}
IMAGE_OS=${OCI_IMAGE_OS:-"Oracle Linux"}
IMAGE_OS_VERSION=${OCI_IMAGE_OS_VERSION:-"9"}

RESOLVED_SUBNET_ID=""
RESOLVED_SSH_PUBLIC_KEY=""
RESOLVED_SSH_PUBLIC_KEY_PATH=""
RESOLVED_SSH_PRIVATE_KEY_PATH=""
RESOLVED_IMAGE_COMPARTMENT_ID=""

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
    sed -n "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*\"\(.*\)\"[[:space:]]*$/\1/p" "$file" | head -n 1
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

${YELLOW}REQUIRED ENV:${NC}
    OCI_COMPARTMENT_ID   Target compartment OCID

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

${YELLOW}EXAMPLE:${NC}
    export OCI_COMPARTMENT_ID=ocid1.compartment.oc1...
    export OCI_SUBNET_ID=ocid1.subnet.oc1...
    export OCI_SSH_PRIVATE_KEY_PATH=~/.ssh/id_ed25519
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
    log_success "Local CLI tools found"

    if [ ! -f "$HOME/.oci/config" ]; then
        log_error "OCI config not found at ~/.oci/config"
        log_info "Run: oci setup config"
        exit 1
    fi
    log_success "OCI config found"

    if [ -z "$COMPARTMENT_ID" ]; then
        log_error "OCI_COMPARTMENT_ID not set"
        log_info "Set with: export OCI_COMPARTMENT_ID=ocid1.compartment.oc1..xxxxx"
        exit 1
    fi
    log_success "Compartment ID configured"

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
        --query "data[?\"display-name\" == '$INSTANCE_NAME'] | [0]" \
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
        if [ -f "$HOME/.ssh/id_ed25519" ]; then
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

wait_for_ssh() {
    local public_ip="$1"
    log_info "Waiting for SSH on ${REMOTE_USER}@${public_ip} ..."

    for _ in $(seq 1 36); do
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

provision_remote_services() {
    local public_ip="$1"

    log_step "Provisioning Services On OCI VM"
    ssh -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -i "$RESOLVED_SSH_PRIVATE_KEY_PATH" \
        "${REMOTE_USER}@${public_ip}" "sudo APP_DIR='$APP_DIR' PUBLIC_IP='$public_ip' bash -s" <<'EOF'
set -euo pipefail

exec > >(tee -a /var/log/optiora-setup.log)
exec 2>&1

echo "=== OptiOra setup started: $(date) ==="

install_runtime_dependencies() {
    if command -v dnf >/dev/null 2>&1; then
        dnf -y install \
            python3 python3-pip python3-devel \
            gcc gcc-c++ make \
            openssl-devel libffi-devel \
            curl wget openssl tar gzip findutils git jq \
            postgresql

        for pkg in \
            python3.13 python3.13-pip python3.13-devel \
            python3.12 python3.12-pip python3.12-devel \
            python3.11 python3.11-pip python3.11-devel \
            python3.10 python3.10-pip python3.10-devel; do
            dnf -y install "$pkg" >/dev/null 2>&1 || true
        done

        if ! command -v node >/dev/null 2>&1 || ! node --version | grep -q '^v20\.'; then
            dnf module reset -y nodejs >/dev/null 2>&1 || true
            dnf module enable -y nodejs:20 >/dev/null 2>&1 || true
            dnf -y install nodejs npm
        fi
        return
    fi

    if command -v apt-get >/dev/null 2>&1; then
        export DEBIAN_FRONTEND=noninteractive
        apt-get update
        apt-get install -y python3 python3-venv python3-pip python3-dev build-essential libssl-dev libffi-dev curl wget openssl postgresql-client jq

        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
        return
    fi

    echo "Unsupported package manager on target host"
    exit 1
}

select_python_command() {
    for cmd in python3.13 python3.12 python3.11 python3.10 python3; do
        if command -v "$cmd" >/dev/null 2>&1; then
            echo "$cmd"
            return
        fi
    done

    echo "python3"
}

install_runtime_dependencies

PYTHON_CMD="$(select_python_command)"
"$PYTHON_CMD" -m ensurepip --upgrade >/dev/null 2>&1 || true

if [ ! -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
fi

ensure_env_value() {
    local key="$1"
    local value="$2"
    if grep -q "^${key}=" "$APP_DIR/.env"; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$APP_DIR/.env"
    else
        echo "${key}=${value}" >> "$APP_DIR/.env"
    fi
}

normalize_env_for_shell() {
    local sanitized_env
    local key
    local value
    sanitized_env="$(mktemp)"

    while IFS= read -r line || [ -n "$line" ]; do
        if [[ -z "$line" ]] || [[ "$line" == \#* ]] || [[ "$line" != *=* ]]; then
            printf '%s\n' "$line" >> "$sanitized_env"
            continue
        fi

        key="${line%%=*}"
        value="${line#*=}"

        if [[ "$value" == *"<"* ]] || [[ "$value" == *">"* ]]; then
            value=""
        elif [[ "$value" == *" "* ]] && [[ "$value" != \"*\" ]] && [[ "$value" != \'*\' ]]; then
            value="${value//\\/\\\\}"
            value="${value//\"/\\\"}"
            value="\"$value\""
        fi

        printf '%s=%s\n' "$key" "$value" >> "$sanitized_env"
    done < "$APP_DIR/.env"

    cat "$sanitized_env" > "$APP_DIR/.env"
    rm -f "$sanitized_env"
}

current_secret="$(grep '^SECRET_KEY=' "$APP_DIR/.env" | tail -1 | cut -d'=' -f2- || true)"
if [ -z "$current_secret" ] || [ "$current_secret" = "replace_with_random_64_char_hex" ] || [ "$current_secret" = "your-secret-key-change-in-production" ]; then
    ensure_env_value "SECRET_KEY" "$(openssl rand -hex 32)"
fi
ensure_env_value "FRONTEND_URL" "http://${PUBLIC_IP}:3000"
ensure_env_value "NEXT_PUBLIC_API_URL" "http://${PUBLIC_IP}:8000"
ensure_env_value "PORT" "8000"
ensure_env_value "UVICORN_RELOAD" "false"
ensure_env_value "ENVIRONMENT" "production"
ensure_env_value "PASSWORD_RESET_RETURN_TOKEN" "false"
ensure_env_value "PASSWORD_RESET_TOKEN_MINUTES" "30"
normalize_env_for_shell

if [ -f /tmp/optiora-oci-api-key.pem ]; then
    install -m 0600 /tmp/optiora-oci-api-key.pem "$APP_DIR/oci_api_key.pem"
    rm -f /tmp/optiora-oci-api-key.pem
    ensure_env_value "OCI_PRIVATE_KEY_PATH" "$APP_DIR/oci_api_key.pem"
fi

if [ ! -d "$APP_DIR/venv" ]; then
    if "$PYTHON_CMD" -m venv "$APP_DIR/venv" >/dev/null 2>&1; then
        true
    else
        "$PYTHON_CMD" -m pip install --upgrade virtualenv
        "$PYTHON_CMD" -m virtualenv "$APP_DIR/venv"
    fi
fi

"$APP_DIR/venv/bin/pip" install --upgrade pip setuptools wheel poetry-core
"$APP_DIR/venv/bin/pip" install -e "$APP_DIR"

set -a
. "$APP_DIR/.env"
set +a

cd "$APP_DIR"

# Validate database connectivity before running migrations.
# If DATABASE_URL points to PostgreSQL, verify the server is reachable first so
# that a failed migration does not leave the app starting on SQLite fallback.
if echo "${DATABASE_URL:-}" | grep -q "^postgresql"; then
    DB_HOST=$(echo "${DATABASE_URL}" | sed 's|.*@\([^:/]*\).*|\1|')
    DB_PORT=$(echo "${DATABASE_URL}" | sed 's|.*:\([0-9]*\)/.*|\1|')
    DB_PORT=${DB_PORT:-5432}
    echo "Checking PostgreSQL connectivity at ${DB_HOST}:${DB_PORT}..."
    _db_retries=0
    until "$APP_DIR/venv/bin/python" -c "
import sys, socket
try:
    s = socket.create_connection(('${DB_HOST}', ${DB_PORT}), timeout=5)
    s.close()
    sys.exit(0)
except Exception as e:
    print(f'DB not reachable: {e}', file=sys.stderr)
    sys.exit(1)
" 2>/dev/null; do
        _db_retries=$((_db_retries + 1))
        if [ "$_db_retries" -ge 12 ]; then
            echo "ERROR: PostgreSQL at ${DB_HOST}:${DB_PORT} is not reachable after 60 seconds. Aborting deployment." >&2
            exit 1
        fi
        echo "  Waiting for database... (attempt ${_db_retries}/12)"
        sleep 5
    done
    echo "Database is reachable."
fi

"$APP_DIR/venv/bin/alembic" -c "$APP_DIR/alembic.ini" upgrade head

cd "$APP_DIR/dashboard"
npm ci --legacy-peer-deps
export NEXT_PUBLIC_API_URL="http://${PUBLIC_IP}:8000"
npm run build

cat > /etc/systemd/system/optiora-api.service <<EOL
[Unit]
Description=OptiOra API Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
Environment=PATH=${APP_DIR}/venv/bin
ExecStart=${APP_DIR}/venv/bin/python -m uvicorn finops_mcp.app:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10
StandardOutput=append:/var/log/optiora-api.log
StandardError=append:/var/log/optiora-api.log

[Install]
WantedBy=multi-user.target
EOL

cat > /etc/systemd/system/optiora-dashboard.service <<EOL
[Unit]
Description=OptiOra Dashboard
After=network.target optiora-api.service

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}/dashboard
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/npm run start -- --hostname 0.0.0.0 --port 3000
Restart=always
RestartSec=10
StandardOutput=append:/var/log/optiora-dashboard.log
StandardError=append:/var/log/optiora-dashboard.log

[Install]
WantedBy=multi-user.target
EOL

systemctl daemon-reload
systemctl enable optiora-api.service optiora-dashboard.service
systemctl restart optiora-api.service
systemctl restart optiora-dashboard.service

sleep 8
curl -fsS http://localhost:8000/health >/dev/null
curl -fsS http://localhost:3000 >/dev/null

echo "=== OptiOra setup completed: $(date) ==="
EOF

    log_success "Remote services are provisioned and running"
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
    log_step "Deploying Local Workspace To OCI Compute"
    log_info "Region: $REGION"
    log_info "Shape: $SHAPE | OCPUs: $OCPU_COUNT | Memory: ${MEMORY_GB}GB"
    log_info "Instance: $INSTANCE_NAME"

    resolve_subnet_id
    resolve_ssh_credentials
    resolve_image_compartment_id

    if [ "$DRY_RUN" = "true" ]; then
        log_warning "DRY RUN mode enabled"
        log_info "Would use subnet: $RESOLVED_SUBNET_ID"
        log_info "Would use SSH key: $RESOLVED_SSH_PRIVATE_KEY_PATH"
        log_info "Would use image compartment: $RESOLVED_IMAGE_COMPARTMENT_ID"
        return 0
    fi

    local instance_id=""
    local state=""
    local instance_found="false"

    if instance_id=$(get_instance_id); then
        instance_found="true"
        state=$(get_instance_state || echo "")
        log_info "Found existing instance: $instance_id (state: $state)"
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

        log_info "Finding latest ${IMAGE_OS} ${IMAGE_OS_VERSION} image..."
        image_id=$(oci compute image list \
            --compartment-id "$RESOLVED_IMAGE_COMPARTMENT_ID" \
            --region "$REGION" \
            --operating-system "$IMAGE_OS" \
            --operating-system-version "$IMAGE_OS_VERSION" \
            --shape "$SHAPE" \
            --query "reverse(sort_by(data, &\"time-created\"))[0].id" \
            --raw-output 2>/dev/null)

        if [ -z "$image_id" ] || [ "$image_id" = "null" ]; then
            log_error "Could not find ${IMAGE_OS} ${IMAGE_OS_VERSION} image from image compartment $RESOLVED_IMAGE_COMPARTMENT_ID"
            exit 1
        fi
        log_success "Image: $image_id"

        ad=$(oci iam availability-domain list \
            --region "$REGION" \
            --query 'data[0].name' \
            --raw-output)
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

    local public_ip=""
    public_ip=$(get_public_ip_for_instance "$instance_id")
    if [ -z "$public_ip" ] || [ "$public_ip" = "null" ]; then
        log_error "Could not resolve public IP for instance"
        log_info "Ensure subnet allows public IPs or set OCI_ASSIGN_PUBLIC_IP=true"
        exit 1
    fi
    log_success "Instance public IP: $public_ip"

    wait_for_ssh "$public_ip"
    sync_local_project "$public_ip"
    provision_remote_services "$public_ip"

    log_step "Deployment Complete"
    log_success "Dashboard: http://$public_ip:3000"
    log_success "API: http://$public_ip:8000"
    log_info "Verification: ./deploy/deploy-oci.sh verify"
    log_info "On VM, logs are in /var/log/optiora-api.log and /var/log/optiora-dashboard.log"
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

    if [ "$state" = "RUNNING" ]; then
        public_ip=$(get_public_ip_for_instance "$instance_id")
        if [ -n "$public_ip" ] && [ "$public_ip" != "null" ]; then
            log_info "Public IP: $public_ip"
            log_info "Dashboard URL: http://$public_ip:3000"
            log_info "API URL: http://$public_ip:8000"
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
    echo "sudo tail -f /var/log/optiora-api.log"
    echo "sudo tail -f /var/log/optiora-dashboard.log"
    echo "sudo tail -f /var/log/optiora-setup.log"
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

    HOST="http://${public_ip}" \
    API_BASE="http://${public_ip}:8000" \
    DASHBOARD_BASE="http://${public_ip}:3000" \
    bash "$(dirname "$0")/../tests/smoke_test_0_9.sh"
}

run_ansible_playbook_for_instance() {
    local public_ip="$1"

    if ! command -v ansible-playbook >/dev/null 2>&1; then
        log_warning "ansible-playbook not installed. Skipping Ansible provisioning step."
        return 0
    fi

    local inv
    local ssh_user
    local ssh_key

    ssh_user="${OCI_ANSIBLE_USER:-$REMOTE_USER}"
    ssh_key="${OCI_ANSIBLE_SSH_KEY_PATH:-$RESOLVED_SSH_PRIVATE_KEY_PATH}"
    inv="$(mktemp)"

    cat > "$inv" <<EOF
all:
  children:
    optiora:
      hosts:
        optiora-prod:
          ansible_host: ${public_ip}
          ansible_user: ${ssh_user}
          ansible_ssh_private_key_file: ${ssh_key}
          optiora_configure_firewall: true
          optiora_firewall_expose_direct_services: true
EOF

    log_info "Running Ansible post-provisioning hardening/playbook..."
    ansible-playbook -i "$inv" "${ROOT_DIR}/ansible/playbooks/site.yml"
    rm -f "$inv"
    log_success "Ansible provisioning completed"
}

run_fancy_end_to_end_deploy() {
    log_step "Fancy End-to-End Deploy (Terraform + Compute + Ansible)"

    if [[ ! -f "$TFVARS_PATH" && -f "${ROOT_DIR}/terraform/terraform.tfvars.example" ]]; then
        cp "${ROOT_DIR}/terraform/terraform.tfvars.example" "$TFVARS_PATH"
        log_warning "Created terraform/terraform.tfvars from example"
    fi

    TMPDIR=/tmp terraform -chdir="${ROOT_DIR}/terraform" init
    TMPDIR=/tmp terraform -chdir="${ROOT_DIR}/terraform" validate
    TMPDIR=/tmp terraform -chdir="${ROOT_DIR}/terraform" plan -out=tfplan

    if prompt_yes_no "Apply Terraform network baseline now?" true; then
        TMPDIR=/tmp terraform -chdir="${ROOT_DIR}/terraform" apply tfplan
    else
        log_warning "Terraform apply skipped by user"
    fi

    deploy_compute

    local instance_id
    local public_ip
    if instance_id=$(get_instance_id); then
        public_ip=$(get_public_ip_for_instance "$instance_id")
        if [[ -n "$public_ip" && "$public_ip" != "null" ]]; then
            run_ansible_playbook_for_instance "$public_ip"
            verify_deployment || true
        fi
    fi

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

    TMPDIR=/tmp terraform -chdir="${ROOT_DIR}/terraform" init
    TMPDIR=/tmp terraform -chdir="${ROOT_DIR}/terraform" validate
    TMPDIR=/tmp terraform -chdir="${ROOT_DIR}/terraform" plan
    if prompt_yes_no "Apply security-list CIDR changes now?" true; then
        TMPDIR=/tmp terraform -chdir="${ROOT_DIR}/terraform" apply -auto-approve
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
