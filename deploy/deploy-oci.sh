#!/bin/bash

# OptiOra OCI Deployment Script
# Deploys to OCI Compute Instance with Docker

set -e

DEPLOYMENT_TYPE=${1:-"compute"}  # compute or functions
REGION=${OCI_REGION:-"us-phoenix-1"}
COMPARTMENT_ID=${OCI_COMPARTMENT_ID}
IMAGE_ID=${OCI_IMAGE_ID:-""}  # Ubuntu 24.04 or similar
SHAPE=${OCI_SHAPE:-"VM.Standard.E4.Flex"}
OCPU_COUNT=${OCI_OCPU_COUNT:-"2"}
MEMORY_GB=${OCI_MEMORY_GB:-"8"}
INSTANCE_NAME=${OCI_INSTANCE_NAME:-"optiora-mcp"}

echo "🚀 OptiOra OCI Deployment"
echo "Region: $REGION"
echo "Deployment Type: $DEPLOYMENT_TYPE"
echo ""

# Check prerequisites
if ! command -v oci &> /dev/null; then
    echo "❌ OCI CLI not found. Install with: brew install oci-cli"
    exit 1
fi

if [ -z "$COMPARTMENT_ID" ]; then
    echo "❌ OCI_COMPARTMENT_ID not set"
    exit 1
fi

echo "✅ Prerequisites validated"
echo ""

if [ "$DEPLOYMENT_TYPE" = "compute" ]; then
    echo "📌 Deploying to OCI Compute Instance..."
    echo ""
    
    # Find latest Ubuntu image
    if [ -z "$IMAGE_ID" ]; then
        echo "🔍 Finding latest Ubuntu 24.04 image..."
        IMAGE_ID=$(oci compute image list \
            --compartment-id "$COMPARTMENT_ID" \
            --query "data[?\"display-name\" like 'Canonical-Ubuntu-24.04%'] | [0].id" \
            --raw-output)
        if [ -z "$IMAGE_ID" ] || [ "$IMAGE_ID" = "null" ]; then
            echo "❌ Could not find Ubuntu 24.04 image"
            exit 1
        fi
    fi
    
    echo "Using image: $IMAGE_ID"
    echo ""
    
    # Create userdata script
    USERDATA_FILE=$(mktemp)
    cat > "$USERDATA_FILE" << 'EOF'
#!/bin/bash
set -e

# Update system
apt-get update && apt-get upgrade -y

# Install Docker
apt-get install -y docker.io docker-compose
systemctl enable docker
systemctl start docker

# Install Python + dependencies
apt-get install -y python3 python3-pip python3-venv

# Clone OptiOra repository
cd /opt
git clone https://github.com/leandro-michelino/optiora.git
cd optiora

# Copy .env file (should be passed in)
# cp /tmp/optiora.env .env

# Build and run Docker container
docker build -t optiora:latest .
docker run -d \
  --name optiora \
  -p 8000:8000 \
  --env-file .env \
  optiora:latest

echo "✅ OptiOra deployed successfully"
EOF
    
    # Launch instance
    echo "🔧 Launching OCI Compute instance ($INSTANCE_NAME)..."
    
    INSTANCE_JSON=$(oci compute instance launch \
        --compartment-id "$COMPARTMENT_ID" \
        --availability-domain "${REGION:0:1}D-${REGION##*-}" \
        --display-name "$INSTANCE_NAME" \
        --image-id "$IMAGE_ID" \
        --shape "$SHAPE" \
        --shape-config "{\"ocpus\": $OCPU_COUNT, \"memory_in_gbs\": $MEMORY_GB}" \
        --user-data-file "$USERDATA_FILE" \
        --subnet-id "${OCI_SUBNET_ID}" \
        --assign-public-ip true \
        --wait-for-state RUNNING \
        --max-wait-seconds 600)
    
    INSTANCE_ID=$(echo "$INSTANCE_JSON" | jq -r '.data.id')
    INSTANCE_IP=$(echo "$INSTANCE_JSON" | jq -r '.data."primary-public-ip-address"')
    
    echo ""
    echo "✅ Instance launched successfully!"
    echo ""
    echo "📊 Instance Details:"
    echo "  ID: $INSTANCE_ID"
    echo "  Name: $INSTANCE_NAME"
    echo "  IP Address: $INSTANCE_IP"
    echo "  Region: $REGION"
    echo ""
    echo "🌍 Access OptiOra MCP at: http://$INSTANCE_IP:8000"
    echo ""
    echo "📝 Next steps:"
    echo "  1. Wait 2-3 minutes for Docker startup"
    echo "  2. SSH: ssh -i ~/.oci/id_rsa ubuntu@$INSTANCE_IP"
    echo "  3. Check logs: docker logs -f optiora"
    
    rm "$USERDATA_FILE"

elif [ "$DEPLOYMENT_TYPE" = "functions" ]; then
    echo "📌 Deploying to OCI Functions (Serverless)..."
    echo ""
    echo "⚠️  Function deployment not yet implemented"
    echo "Use 'compute' deployment type for now"
    
else
    echo "❌ Unknown deployment type: $DEPLOYMENT_TYPE"
    echo "Use: compute or functions"
    exit 1
fi

echo ""
echo "🎉 Deployment complete!"
