#!/bin/bash

################################################################################
# OptiOra OCI Deployment Script
# 
# Deploys OptiOra to Oracle Cloud Infrastructure
# Uses OCI CLI (no Docker required)
# 
# Usage:
#   ./deploy/deploy-oci.sh compute              # Deploy to OCI Compute (recommended)
#   ./deploy/deploy-oci.sh container            # Deploy as OCI Container Instance
#   ./deploy/deploy-oci.sh kubernetes           # Deploy to OKE cluster (experimental)
#   ./deploy/deploy-oci.sh --dry-run            # Preview changes without deploying
#   ./deploy/deploy-oci.sh status               # Check deployment status
#   ./deploy/deploy-oci.sh logs                 # View deployment logs
#   ./deploy/deploy-oci.sh destroy              # Remove deployment
################################################################################

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEPLOYMENT_TYPE=${1:-"compute"}
REGION=${OCI_REGION:-"us-phoenix-1"}
COMPARTMENT_ID=${OCI_COMPARTMENT_ID}
INSTANCE_NAME=${OCI_INSTANCE_NAME:-"optiora-mcp"}
SHAPE=${OCI_SHAPE:-"VM.Standard.E4.Flex"}
OCPU_COUNT=${OCI_OCPU_COUNT:-"2"}
MEMORY_GB=${OCI_MEMORY_GB:-"8"}
DRY_RUN=${DRY_RUN:-false}

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_step() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking Prerequisites"
    
    # Check OCI CLI
    if ! command -v oci &> /dev/null; then
        log_error "OCI CLI not found"
        echo "Install with: brew install oci-cli"
        echo "Or: https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/cliinstall.htm"
        exit 1
    fi
    log_success "OCI CLI found: $(oci --version)"
    
    # Check OCI configuration
    if [ ! -f ~/.oci/config ]; then
        log_error "OCI config not found at ~/.oci/config"
        echo "Run: oci setup config"
        exit 1
    fi
    log_success "OCI config found"
    
    # Check Python
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 not found"
        exit 1
    fi
    log_success "Python 3 found: $(python3 --version)"
    
    # Check .env file
    if [ ! -f .env.example ]; then
        log_error ".env.example not found"
        exit 1
    fi
    log_success ".env.example found"
    
    # Check CompartmentID
    if [ -z "$COMPARTMENT_ID" ]; then
        log_error "OCI_COMPARTMENT_ID not set"
        echo "Set with: export OCI_COMPARTMENT_ID=ocid1.compartment.oc1..xxxxx"
        exit 1
    fi
    log_success "Compartment ID configured"
}

# Show help
show_help() {
    cat << EOF
${BLUE}OptiOra OCI Deployment Script${NC}

${YELLOW}USAGE:${NC}
    $0 [COMMAND] [OPTIONS]

${YELLOW}COMMANDS:${NC}
    compute              Deploy to OCI Compute Instance (default)
    container            Deploy as OCI Container Instance (serverless)
    kubernetes           Deploy to OKE cluster (requires existing cluster)
    status               Check current deployment status
    logs                 View deployment logs
    destroy              Remove deployment (WARNING: irreversible)
    --help               Show this help message

${YELLOW}ENVIRONMENT VARIABLES:${NC}
    OCI_REGION           Oracle Cloud region (default: us-phoenix-1)
    OCI_COMPARTMENT_ID   Target compartment OCID (REQUIRED)
    OCI_INSTANCE_NAME    VM display name (default: optiora-mcp)
    OCI_SHAPE            VM shape (default: VM.Standard.E4.Flex)
    OCI_OCPU_COUNT       vCPU count (default: 2)
    OCI_MEMORY_GB        Memory in GB (default: 8)

${YELLOW}EXAMPLES:${NC}
    # Deploy to OCI Compute (standard VM)
    export OCI_COMPARTMENT_ID=ocid1.compartment.oc1...
    ./deploy/deploy-oci.sh compute

    # Deploy as serverless container
    ./deploy/deploy-oci.sh container

    # Check status
    ./deploy/deploy-oci.sh status

${YELLOW}DOCUMENTATION:${NC}
    See OCI_DEPLOYMENT.md for detailed setup instructions
    See SETUP.md for complete deployment guide

EOF
}

# Get deployment status
get_status() {
    log_step "Checking Deployment Status"
    
    # Look for instance with matching name
    INSTANCE=$(oci compute instance list \
        --compartment-id "$COMPARTMENT_ID" \
        --region "$REGION" \
        --query "data[?\"display-name\" == '$INSTANCE_NAME'] | [0]" \
        2>/dev/null || echo "null")
    
    if [ "$INSTANCE" == "null" ] || [ -z "$INSTANCE" ]; then
        log_warning "No deployment found with name: $INSTANCE_NAME"
        return 1
    fi
    
    INSTANCE_ID=$(echo "$INSTANCE" | grep -o '"id": "[^"]*' | cut -d'"' -f4)
    STATE=$(echo "$INSTANCE" | grep -o '"lifecycle-state": "[^"]*' | cut -d'"' -f4)
    
    log_info "Instance Name: $INSTANCE_NAME"
    log_info "Instance ID: $INSTANCE_ID"
    log_info "State: $STATE"
    
    if [ "$STATE" == "RUNNING" ]; then
        log_success "Instance is running"
        
        # Get public IP
        VNIC=$(oci compute instance list-vnics \
            --instance-id "$INSTANCE_ID" \
            --query 'data[0]' 2>/dev/null)
        
        PUBLIC_IP=$(echo "$VNIC" | grep -o '"public-ip": "[^"]*' | cut -d'"' -f4)
        if [ ! -z "$PUBLIC_IP" ]; then
            log_info "Public IP: $PUBLIC_IP"
            log_info "Access URL: https://$PUBLIC_IP:8000"
        fi
    else
        log_warning "Instance state: $STATE"
    fi
}

# Deploy to OCI Compute
deploy_compute() {
    log_step "Deploying to OCI Compute Instance"
    
    log_info "Configuration:"
    log_info "  Region: $REGION"
    log_info "  Shape: $SHAPE"
    log_info "  vCPU: $OCPU_COUNT"
    log_info "  Memory: ${MEMORY_GB}GB"
    log_info "  Instance: $INSTANCE_NAME"
    
    if [ "$DRY_RUN" == "true" ]; then
        log_warning "DRY RUN MODE - No changes will be made"
    fi
    
    # Find Ubuntu 24.04 image
    log_info "Finding latest Ubuntu 24.04 image..."
    IMAGE_ID=$(oci compute image list \
        --compartment-id "$COMPARTMENT_ID" \
        --region "$REGION" \
        --query "data[?\"display-name\" like 'Canonical-Ubuntu-24.04%'].id | [0]" \
        --raw-output 2>/dev/null)
    
    if [ -z "$IMAGE_ID" ] || [ "$IMAGE_ID" == "null" ]; then
        log_error "Could not find Ubuntu 24.04 image"
        log_info "Available images:"
        oci compute image list --compartment-id "$COMPARTMENT_ID" --region "$REGION" \
            --query 'data[?contains("display-name", "Ubuntu")].[\"display-name\"]' --output table
        exit 1
    fi
    
    log_success "Found image: $IMAGE_ID"
    
    # Get availability domain
    AD=$(oci iam availability-domain list \
        --region "$REGION" \
        --query 'data[0].name' \
        --raw-output)
    
    log_info "Using availability domain: $AD"
    
    # Create user data script
    USERDATA=$(cat <<'USERDATA_EOF'
#!/bin/bash
set -e

# Logging
exec > >(tee /var/log/optiora-setup.log)
exec 2>&1

echo "=== OptiOra Installation Starting ==="
echo "Time: $(date)"
echo "User: $(whoami)"

# Update system
echo "Updating system packages..."
apt-get update
apt-get upgrade -y

# Install Python 3.10+
echo "Installing Python 3.10..."
apt-get install -y python3.10 python3.10-venv python3-pip python3-dev

# Install PostgreSQL client and other dependencies
echo "Installing dependencies..."
apt-get install -y git curl wget postgresql-client build-essential libssl-dev libffi-dev

# Create application directory
echo "Creating application directory..."
mkdir -p /opt/optiora
cd /opt/optiora

# Clone repository
echo "Cloning OptiOra repository..."
git clone https://github.com/leandro-michelino/optiora.git . || git pull

# Create Python virtual environment
echo "Setting up Python virtual environment..."
python3.10 -m venv venv
source venv/bin/activate
export PATH="$PWD/venv/bin:$PATH"

# Install Python dependencies
echo "Installing Python packages with Poetry..."
pip install --upgrade pip setuptools wheel
pip install poetry

# Install project dependencies
poetry install --no-interaction --no-dev 2>&1 || {
    echo "Poetry install failed, trying pip..."
    pip install mcp boto3 azure-identity azure-mgmt-costmanagement google-cloud-billing oci pydantic python-dotenv httpx
}

# Configure environment
echo "Configuring environment..."
if [ ! -f /opt/optiora/.env ]; then
    cp /opt/optiora/.env.example /opt/optiora/.env
    echo "✓ Created .env file (IMPORTANT: Update with real cloud credentials)"
    echo ""
    echo "Edit /opt/optiora/.env with cloud provider credentials:"
    echo "  - AWS_ACCESS_KEY_ID"
    echo "  - AWS_SECRET_ACCESS_KEY"
    echo "  - AZURE_SUBSCRIPTION_ID"
    echo "  - AZURE_CLIENT_ID"
    echo "  - AZURE_CLIENT_SECRET"
    echo "  - GCP_PROJECT_ID"
    echo "  - OCI_CONFIG_PROFILE"
fi

# Create system service for MCP server
echo "Setting up MCP server service..."
cat > /etc/systemd/system/optiora-mcp.service << 'EOF'
[Unit]
Description=OptiOra MCP Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/optiora
Environment="PATH=/opt/optiora/venv/bin"
ExecStart=/opt/optiora/venv/bin/python -m finops_mcp.server
Restart=always
RestartSec=10
StandardOutput=append:/var/log/optiora-mcp.log
StandardError=append:/var/log/optiora-mcp.log

[Install]
WantedBy=multi-user.target
EOF

# Create system service for dashboard
echo "Setting up Dashboard service..."
cat > /etc/systemd/system/optiora-dashboard.service << 'EOF'
[Unit]
Description=OptiOra Dashboard
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/optiora/dashboard
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=10
StandardOutput=append:/var/log/optiora-dashboard.log
StandardError=append:/var/log/optiora-dashboard.log

[Install]
WantedBy=multi-user.target
EOF

# Install Node.js for dashboard
echo "Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash - 2>&1
apt-get install -y nodejs

# Install dashboard dependencies
echo "Installing dashboard dependencies..."
cd /opt/optiora/dashboard
npm install --production

# Enable services
echo "Enabling services..."
systemctl daemon-reload
systemctl enable optiora-mcp.service
systemctl enable optiora-dashboard.service

# Start services
echo "Starting OptiOra services..."
systemctl start optiora-mcp.service
systemctl start optiora-dashboard.service

# Wait for services to start
echo "Waiting for services to initialize..."
sleep 10

# Health check
echo "Performing health checks..."
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "✓ MCP Server health check passed"
else
    echo "⚠ MCP Server health check failed - check logs"
fi

if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✓ Dashboard health check passed"
else
    echo "⚠ Dashboard health check failed - check logs"
fi

echo ""
echo "=== OptiOra Installation Complete ==="
echo "Time: $(date)"
echo ""
echo "Services running:"
echo "  • MCP Server: http://localhost:8000"
echo "  • Dashboard: http://localhost:3000"
echo ""
echo "Logs:"
echo "  • MCP: tail -f /var/log/optiora-mcp.log"
echo "  • Dashboard: tail -f /var/log/optiora-dashboard.log"
echo "  • Setup: tail -f /var/log/optiora-setup.log"
echo ""
echo "IMPORTANT: Update /opt/optiora/.env with real cloud credentials!"
USERDATA_EOF
)
    
    # Encode user data
    USERDATA_ENCODED=$(echo "$USERDATA" | base64)
    
    if [ "$DRY_RUN" == "true" ]; then
        log_warning "DRY RUN: Would create instance with:"
        echo "  Display Name: $INSTANCE_NAME"
        echo "  Image: $IMAGE_ID"
        echo "  Shape: $SHAPE"
        echo "  Availability Domain: $AD"
        return 0
    fi
    
    log_info "Creating compute instance (this may take 5-10 minutes)..."
    
    RESPONSE=$(oci compute instance launch \
        --compartment-id "$COMPARTMENT_ID" \
        --availability-domain "$AD" \
        --display-name "$INSTANCE_NAME" \
        --image-id "$IMAGE_ID" \
        --shape "$SHAPE" \
        --shape-config "ocpus=$OCPU_COUNT,memory-in-gbs=$MEMORY_GB" \
        --wait-for-state RUNNING \
        --region "$REGION" \
        --max-wait-seconds 600 \
        2>&1)
    
    INSTANCE_ID=$(echo "$RESPONSE" | grep -o '"id": "[^"]*' | head -1 | cut -d'"' -f4)
    
    if [ -z "$INSTANCE_ID" ]; then
        log_error "Failed to create instance"
        exit 1
    fi
    
    log_success "Instance created: $INSTANCE_ID"
    
    # Wait for instance to be fully running
    log_info "Waiting for instance to be ready..."
    sleep 30
    
    # Get instance details
    get_status
}

# Deploy as container instance
deploy_container() {
    log_step "Deploying as OCI Container Instance"
    
    log_info "Configuration:"
    log_info "  Region: $REGION"
    log_info "  vCPU: $OCPU_COUNT"
    log_info "  Memory: ${MEMORY_GB}GB"
    
    CONTAINER_NAME="${OCI_CONTAINER_NAME:-optiora-container}"
    
    if [ "$DRY_RUN" == "true" ]; then
        log_warning "DRY RUN MODE - No changes will be made"
        log_info "Would create container instance with:"
        echo "  Name: $CONTAINER_NAME"
        echo "  vCPU: $OCPU_COUNT"
        echo "  Memory: ${MEMORY_GB}GB"
        return 0
    fi
    
    log_info "Note: Container deployment requires a pre-built Docker image"
    log_info "Step 1: Build and push Docker image to OCI Registry"
    log_info "Step 2: Use OCI Container Instances API to deploy"
    log_info ""
    log_info "For detailed instructions, see DEPLOYMENT_GUIDE.md"
    log_error "Container deployment: Feature in progress"
    log_info "Recommend using compute instance for now: ./deploy/deploy-oci.sh compute"
}

# Deploy to Kubernetes
deploy_kubernetes() {
    log_step "Deploying to OKE Kubernetes"
    
    log_error "Kubernetes deployment coming soon"
    log_info "For now, use: ./deploy/deploy-oci.sh compute"
}

# View logs
view_logs() {
    log_step "Deployment Logs"
    
    INSTANCE=$(oci compute instance list \
        --compartment-id "$COMPARTMENT_ID" \
        --region "$REGION" \
        --query "data[?\"display-name\" == '$INSTANCE_NAME'] | [0]" \
        2>/dev/null)
    
    if [ "$INSTANCE" == "null" ] || [ -z "$INSTANCE" ]; then
        log_error "No deployment found"
        return 1
    fi
    
    INSTANCE_ID=$(echo "$INSTANCE" | grep -o '"id": "[^"]*' | cut -d'"' -f4)
    PUBLIC_IP=$(oci compute instance list-vnics \
        --instance-id "$INSTANCE_ID" \
        --query 'data[0]."public-ip"' \
        --raw-output 2>/dev/null)
    
    if [ -z "$PUBLIC_IP" ]; then
        log_error "Could not get public IP"
        return 1
    fi
    
    log_info "Connecting to instance at $PUBLIC_IP..."
    log_info "To view logs, SSH to the instance:"
    echo "  ssh opc@$PUBLIC_IP"
    echo "  tail -f /var/log/optiora.log"
}

# Destroy deployment
destroy_deployment() {
    log_step "Destroy Deployment"
    
    log_warning "This will permanently delete:"
    log_warning "  - Compute instance"
    log_warning "  - Associated storage"
    log_warning "  - All data"
    
    read -p "Are you absolutely sure? Type 'yes' to confirm: " CONFIRM
    
    if [ "$CONFIRM" != "yes" ]; then
        log_info "Cancelled"
        return 0
    fi
    
    INSTANCE=$(oci compute instance list \
        --compartment-id "$COMPARTMENT_ID" \
        --region "$REGION" \
        --query "data[?\"display-name\" == '$INSTANCE_NAME'] | [0]" \
        2>/dev/null)
    
    if [ "$INSTANCE" == "null" ] || [ -z "$INSTANCE" ]; then
        log_warning "No deployment found"
        return 0
    fi
    
    INSTANCE_ID=$(echo "$INSTANCE" | grep -o '"id": "[^"]*' | cut -d'"' -f4)
    
    log_info "Terminating instance $INSTANCE_ID..."
    oci compute instance terminate \
        --instance-id "$INSTANCE_ID" \
        --force \
        --region "$REGION" \
        --wait-for-state TERMINATED \
        --max-wait-seconds 300 \
        2>&1 || true
    
    log_success "Deployment destroyed"
}

# Main script
main() {
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║          OptiOra OCI Deployment Script                     ║"
    echo "║          Deployment Mode: $DEPLOYMENT_TYPE"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    
    case "$DEPLOYMENT_TYPE" in
        --help|-h|help)
            show_help
            exit 0
            ;;
        compute)
            check_prerequisites
            deploy_compute
            log_success "Deployment complete!"
            log_info "Next steps: Update .env file on the instance with real credentials"
            ;;
        container)
            check_prerequisites
            deploy_container
            ;;
        kubernetes)
            check_prerequisites
            deploy_kubernetes
            ;;
        status)
            check_prerequisites
            get_status
            ;;
        logs)
            check_prerequisites
            view_logs
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
