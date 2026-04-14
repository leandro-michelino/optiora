#!/bin/bash

################################################################################
# OptiOra OCI Deployment Script
#
# Local-to-OCI deployment:
# - Runs from your laptop
# - Provisions/starts OCI compute instance
# - Uploads local project files to VM from your current local workspace
# - Installs dependencies and starts systemd services on VM
# - Does not clone from Git or depend on CI/CD triggers
################################################################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DEPLOYMENT_TYPE=${1:-"compute"}
REGION=${OCI_REGION:-"us-phoenix-1"}
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

RESOLVED_SUBNET_ID=""
RESOLVED_SSH_PUBLIC_KEY=""
RESOLVED_SSH_PRIVATE_KEY_PATH=""

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
    compute              Create/start instance and deploy local code (default)
    status               Check current deployment status
    logs                 Show SSH commands to inspect logs
    stop                 Stop deployed compute instance
    start                Start deployed compute instance
    restart              Reboot deployed compute instance
    destroy              Remove deployment (WARNING: irreversible)
    container            Placeholder
    kubernetes           Placeholder
    --help               Show this help message

${YELLOW}REQUIRED ENV:${NC}
    OCI_COMPARTMENT_ID   Target compartment OCID

${YELLOW}COMMON ENV:${NC}
    OCI_REGION                 Region (default: us-phoenix-1)
    OCI_INSTANCE_NAME          VM display name (default: optiora-api)
    OCI_SHAPE                  VM shape (default: VM.Standard.E4.Flex)
    OCI_OCPU_COUNT             vCPU count (default: 2)
    OCI_MEMORY_GB              Memory GB (default: 8)
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

    if [ ! -f ".env.example" ]; then
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

    log_step "Uploading Local Project To OCI VM"
    log_info "Deployment source: local filesystem snapshot from this laptop (no Git clone)."
    log_info "Creating deployment archive from local workspace..."
    tar -czf "$archive_path" \
        --exclude=".git" \
        --exclude=".venv" \
        --exclude=".pytest_cache" \
        --exclude="__pycache__" \
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

if [ -f /tmp/optiora.env.backup ]; then
    mv /tmp/optiora.env.backup "$APP_DIR/.env"
fi
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

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y python3 python3-venv python3-pip python3-dev build-essential libssl-dev libffi-dev curl wget openssl postgresql-client

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

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

current_secret="$(grep '^SECRET_KEY=' "$APP_DIR/.env" | tail -1 | cut -d'=' -f2- || true)"
if [ -z "$current_secret" ] || [ "$current_secret" = "replace_with_random_64_char_hex" ] || [ "$current_secret" = "your-secret-key-change-in-production" ]; then
    ensure_env_value "SECRET_KEY" "$(openssl rand -hex 32)"
fi
ensure_env_value "FRONTEND_URL" "http://${PUBLIC_IP}:3000"
ensure_env_value "NEXT_PUBLIC_API_URL" "http://${PUBLIC_IP}:8000"
ensure_env_value "PORT" "8000"
ensure_env_value "UVICORN_RELOAD" "false"

if [ ! -d "$APP_DIR/venv" ]; then
    python3 -m venv "$APP_DIR/venv"
fi

"$APP_DIR/venv/bin/pip" install --upgrade pip setuptools wheel poetry-core
"$APP_DIR/venv/bin/pip" install -e "$APP_DIR"

cd "$APP_DIR/dashboard"
npm ci
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

    if [ "$DRY_RUN" = "true" ]; then
        log_warning "DRY RUN mode enabled"
        log_info "Would use subnet: $RESOLVED_SUBNET_ID"
        log_info "Would use SSH key: $RESOLVED_SSH_PRIVATE_KEY_PATH"
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
        local escaped_ssh_key
        local metadata_file
        local vnic_file
        local response

        log_info "Finding latest Ubuntu 24.04 image..."
        image_id=$(oci compute image list \
            --compartment-id "$COMPARTMENT_ID" \
            --region "$REGION" \
            --query "data[?\"display-name\" like 'Canonical-Ubuntu-24.04%'].id | [0]" \
            --raw-output 2>/dev/null)

        if [ -z "$image_id" ] || [ "$image_id" = "null" ]; then
            log_error "Could not find Ubuntu 24.04 image"
            exit 1
        fi
        log_success "Image: $image_id"

        ad=$(oci iam availability-domain list \
            --region "$REGION" \
            --query 'data[0].name' \
            --raw-output)
        log_info "Availability domain: $ad"

        escaped_ssh_key=$(printf '%s' "$RESOLVED_SSH_PUBLIC_KEY" | sed 's/\\/\\\\/g; s/"/\\"/g')
        metadata_file=$(mktemp)
        vnic_file=$(mktemp)
        printf '{"ssh_authorized_keys":"%s"}' "$escaped_ssh_key" > "$metadata_file"
        printf '{"subnetId":"%s","assignPublicIp":%s}' "$RESOLVED_SUBNET_ID" "$ASSIGN_PUBLIC_IP" > "$vnic_file"

        log_info "Creating compute instance..."
        response=$(oci compute instance launch \
            --compartment-id "$COMPARTMENT_ID" \
            --availability-domain "$ad" \
            --display-name "$INSTANCE_NAME" \
            --image-id "$image_id" \
            --shape "$SHAPE" \
            --shape-config "ocpus=$OCPU_COUNT,memory-in-gbs=$MEMORY_GB" \
            --create-vnic-details "file://$vnic_file" \
            --metadata "file://$metadata_file" \
            --wait-for-state RUNNING \
            --region "$REGION" \
            --max-wait-seconds 900 \
            2>&1)

        rm -f "$metadata_file" "$vnic_file"

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

deploy_container() {
    log_step "Container Deployment"
    log_warning "Container deployment is not implemented yet."
    log_info "Use compute deployment: ./deploy/deploy-oci.sh compute"
}

deploy_kubernetes() {
    log_step "Kubernetes Deployment"
    log_warning "Kubernetes deployment is not implemented yet."
    log_info "Use compute deployment: ./deploy/deploy-oci.sh compute"
}

main() {
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
        status)
            check_prerequisites
            get_status
            ;;
        logs)
            check_prerequisites
            view_logs
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
        container)
            check_prerequisites
            deploy_container
            ;;
        kubernetes)
            check_prerequisites
            deploy_kubernetes
            ;;
        *)
            log_error "Unknown command: $DEPLOYMENT_TYPE"
            show_help
            exit 1
            ;;
    esac
}

main
