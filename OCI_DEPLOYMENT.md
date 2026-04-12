# OptiOra OCI Self-Hosted Deployment Guide

## Overview

Complete guide to deploy OptiOra **entirely on Oracle Cloud Infrastructure** with:
- ✅ Frontend (React/Next.js) self-hosted on OCI App Services
- ✅ Backend (Python MCP) on OCI Compute or Container Services
- ✅ Database (PostgreSQL) on OCI DBaaS
- ✅ Credential management with encrypted storage
- ✅ Multi-cloud cost analysis (AWS, Azure, GCP, OCI)
- ✅ High availability and disaster recovery

**No external services required** — Vercel, CloudFlare, or other cloud platforms.

---

## Architecture Diagram

```
Internet Traffic (HTTPS)
        │
        ▼
   ┌─────────────────────────────┐
   │ OCI Load Balancer           │ (Terminates SSL/TLS)
   │ + OCI WAF                   │
   └──────────┬────────────────────┘
              │
       ┌──────┴──────┐
       │             │
   Port 443      Port 8443
       │             │
       ▼             ▼
   ┌─────────┐  ┌────────────┐
   │Frontend │  │  Backend   │ (Python MCP)
   │ (React) │  │ (FastAPI)  │
   │Next.js  │  │ Credential │
   │ App Svc │  │ Management │
   │ (2+)    │  │ Container  │
   └────┬────┘  │ (2+)       │
        │       └──────┬─────┘
        └──────────────┼───────────────────┐
                       │                   │
                       ▼                   ▼
                  ┌─────────────────────────────┐
                  │  OCI PostgreSQL DBaaS       │
                  │  - Credentials (encrypted)  │
                  │  - Scanning permissions     │
                  │  - Cost snapshot history    │
                  │  - Audit logs               │
                  └─────────────────────────────┘
```

---

## Prerequisites

- OCI Tenancy with sufficient quotas
- OCI CLI installed and configured
- Docker installed (for local builds)
- Terraform (optional, for IaC)
- DNS domain configured

---

## Step 1: Pre-Deployment Setup

### A. OCI Account Configuration

```bash
# 1. Create OCI CLI config
mkdir -p ~/.oci
oci setup config  # Interactive setup

# 2. Verify configuration
oci os namespace get

# 3. Create compartment for OptiOra
oci iam compartment create \
  --name "OptiOra-Prod" \
  --description "OptiOra production environment"

export COMPARTMENT_ID="ocid1.compartment.oc1..xxxxx"
```

### B. Network Setup

```bash
# Create VCN
VCN_ID=$(oci network vcn create \
  --cidr-block "10.0.0.0/16" \
  --display-name "optora-vcn" \
  --compartment-id $COMPARTMENT_ID \
  --query 'data.id' --raw-output)

echo "VCN_ID=$VCN_ID"

# Create Internet Gateway
IGW_ID=$(oci network internet-gateway create \
  --vcn-id $VCN_ID \
  --display-name "optora-igw" \
  --is-enabled true \
  --compartment-id $COMPARTMENT_ID \
  --query 'data.id' --raw-output)

# Create public subnet (for load balancer)
PUBLIC_SUBNET_ID=$(oci network subnet create \
  --vcn-id $VCN_ID \
  --cidr-block "10.0.1.0/24" \
  --display-name "optora-public" \
  --compartment-id $COMPARTMENT_ID \
  --query 'data.id' --raw-output)

# Create private subnet (for backend)
PRIVATE_SUBNET_ID=$(oci network subnet create \
  --vcn-id $VCN_ID \
  --cidr-block "10.0.2.0/24" \
  --display-name "optora-backend" \
  --compartment-id $COMPARTMENT_ID \
  --prohibit-internet-ingress true \
  --query 'data.id' --raw-output)

# Create database subnet
DB_SUBNET_ID=$(oci network subnet create \
  --vcn-id $VCN_ID \
  --cidr-block "10.0.3.0/24" \
  --display-name "optora-database" \
  --compartment-id $COMPARTMENT_ID \
  --prohibit-internet-ingress true \
  --prohibit-public-ip-on-init true \
  --query 'data.id' --raw-output)

echo "PUBLIC_SUBNET_ID=$PUBLIC_SUBNET_ID"
echo "PRIVATE_SUBNET_ID=$PRIVATE_SUBNET_ID"
echo "DB_SUBNET_ID=$DB_SUBNET_ID"
```

### C. Security Groups

```bash
# Create network security group for frontend
oci network nsg create \
  --vcn-id $VCN_ID \
  --display-name "optora-frontend-nsg" \
  --compartment-id $COMPARTMENT_ID

# Create security rules for frontend NSG
# - Allow HTTPS/HTTP from internet
# - Allow backend communication

# Create network security group for backend
oci network nsg create \
  --vcn-id $VCN_ID \
  --display-name "optora-backend-nsg" \
  --compartment-id $COMPARTMENT_ID

# Create security rules for backend NSG
# - Allow from frontend subnet
# - Allow to database
```

---

## Step 2: Database Setup

### Create PostgreSQL Database

```bash
# Create OCI PostgreSQL Flexible Database
DB_ID=$(oci mysql db-system create \
  --display-name "optora-postgres" \
  --db-engine-version "15" \
  --availability-domain "AD-1" \
  --shape "MySQL.VM.Standard.E4.1.8GB" \
  --subnet-id $DB_SUBNET_ID \
  --admin-username "postgres" \
  --admin-password "<SECURE_PASSWORD>" \
  --data-storage-size-gb 100 \
  --backup-policy '{"days_of_month":[7,15,23], "days_of_week":["MONDAY","FRIDAY"]}' \
  --compartment-id $COMPARTMENT_ID \
  --query 'data.id' --raw-output)

# Wait for database to be ready
oci mysql db-system get --db-system-id $DB_ID

# Get database endpoint
DB_HOST=$(oci mysql db-system get \
  --db-system-id $DB_ID \
  --query 'data.endpoints[0].ip_address' --raw-output)

echo "DB_HOST=$DB_HOST"
```

### Initialize Database Schema

```bash
# Connect to database and initialize schema
psql -h $DB_HOST -U postgres << 'EOF'

-- Create OptiOra database
CREATEDB optora;

-- Connect to database
\c optora

-- Import schema from finops_mcp/database.py
-- Example SQL commands:
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cloud_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    cloud_provider VARCHAR(20) NOT NULL,
    encrypted_credentials BYTEA NOT NULL,
    validation_status VARCHAR(20) DEFAULT 'pending',
    last_validated_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(customer_id, cloud_provider)
);

CREATE TABLE IF NOT EXISTS scanning_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    state VARCHAR(50) DEFAULT 'pending_approval',
    providers TEXT[] NOT NULL,
    scan_frequency VARCHAR(20) DEFAULT 'daily',
    auto_remediate BOOLEAN DEFAULT FALSE,
    notification_email VARCHAR(255),
    approved_at TIMESTAMP,
    last_scan_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert demo customer
INSERT INTO customers (id, name, email, status) VALUES 
  (gen_random_uuid(), 'Demo Customer', 'demo@optora.com', 'active');

EOF

echo "Database initialized successfully"
```

---

## Step 3: Backend Deployment

### Build Backend Container

```bash
# Create Dockerfile for backend
cat > Dockerfile.backend << 'EOF'
FROM python:3.14-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY finops_mcp/ ./finops_mcp/

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/api/v1/health')" || exit 1

EXPOSE 8000

CMD ["python", "-m", "finops_mcp.api"]
EOF

# Build image
docker build -f Dockerfile.backend -t optora:backend-latest .
docker tag optora:backend-latest localhost/optora:backend-latest
```

### Create Container Registry in OCI

```bash
# Create container repository
REPO_ID=$(oci artifacts container repository create \
  --repository-name "optora/backend" \
  --compartment-id $COMPARTMENT_ID \
  --query 'data.id' --raw-output)

# Get registry URL
REGISTRY_URL=$(oci artifacts container repository get \
  --repository-id $REPO_ID \
  --query 'data.image_url' --raw-output)

echo "REGISTRY_URL=$REGISTRY_URL"

# Authenticate Docker
docker login -u <USERNAME> $REGISTRY_URL

# Push image
docker push $REGISTRY_URL:latest
```

### Deploy to OCI Container Instances

```bash
# Create backend container instances
for i in {1..2}; do
  INSTANCE_OCID=$(oci compute-container-instance create \
    --display-name "optora-backend-$i" \
    --compartment-id $COMPARTMENT_ID \
    --shape "CI.Standard.A1.Flex" \
    --availability-domain "AD-1" \
    --containers "[{
      \"imageUrl\": \"$REGISTRY_URL:latest\",
      \"displayName\": \"optora-backend\",
      \"environmentVariables\": {
        \"DATABASE_URL\": \"postgresql://postgres:PASSWORD@$DB_HOST:5432/optora\",
        \"JWT_SECRET\": \"$(openssl rand -base64 32)\",
        \"LOG_LEVEL\": \"INFO\"
      },
      \"ports\": [8000]
    }]" \
    --subnet-id $PRIVATE_SUBNET_ID \
    --query 'data.id' --raw-output)
    
  echo "Created backend instance: $INSTANCE_OCID"
  sleep 30
done
```

---

## Step 4: Frontend Deployment

### Build Frontend Container

```bash
cd dashboard

# Install dependencies
npm install

# Build Next.js app
npm run build

# Create Dockerfile for frontend
cat > Dockerfile.frontend << 'EOF'
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["npm", "start"]
EOF

# Build image
docker build -f Dockerfile.frontend -t optora:frontend-latest .
docker tag optora:frontend-latest $REGISTRY_URL/frontend:latest

# Push to OCI
docker push $REGISTRY_URL/frontend:latest
```

### Deploy Frontend to OCI

```bash
# Create frontend container instances
for i in {1..2}; do
  oci compute-container-instance create \
    --display-name "optora-frontend-$i" \
    --compartment-id $COMPARTMENT_ID \
    --shape "CI.Standard.A1.Flex" \
    --availability-domain "AD-1" \
    --containers "[{
      \"imageUrl\": \"$REGISTRY_URL/frontend:latest\",
      \"displayName\": \"optora-frontend\",
      \"environmentVariables\": {
        \"NEXT_PUBLIC_API_URL\": \"https://api.optora.example.com\",
        \"NODE_ENV\": \"production\"
      },
      \"ports\": [3000]
    }]" \
    --subnet-id $PRIVATE_SUBNET_ID
    
  sleep 30
done
```

---

## Step 5: Load Balancing & SSL

### Create Network Load Balancer

```bash
# Create load balancer
LB_OCID=$(oci nlb load-balancer create \
  --display-name "optora-nlb" \
  --compartment-id $COMPARTMENT_ID \
  --subnets "[$PUBLIC_SUBNET_ID]" \
  --scheme "INTERNET_FACING" \
  --type "NETWORK_LOAD_BALANCER" \
  --query 'data.id' --raw-output)

echo "LB_OCID=$LB_OCID"

# Get load balancer IP
LB_IP=$(oci nlb load-balancer get \
  --load-balancer-id $LB_OCID \
  --query 'data.ip_address' --raw-output)

echo "LB_IP=$LB_IP"
```

### Configure Backend Listener

```bash
# Create backend target group
oci nlb backend-set create \
  --load-balancer-id $LB_OCID \
  --name "backend-targets" \
  --health-checker '{"protocol": "HTTP", "port": 8000, "urlPath": "/api/v1/health"}' \
  --backends "[
    {\"ipAddress\": \"10.0.2.10\", \"port\": 8000, \"weight\": 1},
    {\"ipAddress\": \"10.0.2.11\", \"port\": 8000, \"weight\": 1}
  ]"

# Create backend listener
oci nlb listener create \
  --load-balancer-id $LB_OCID \
  --name "backend-listener" \
  --protocol "TCP" \
  --port 8443 \
  --default-backend-set-name "backend-targets"
```

### Configure Frontend Listener

```bash
# Create frontend target group
oci nlb backend-set create \
  --load-balancer-id $LB_OCID \
  --name "frontend-targets" \
  --health-checker '{"protocol": "HTTP", "port": 3000, "urlPath": "/"}' \
  --backends "[
    {\"ipAddress\": \"10.0.2.20\", \"port\": 3000, \"weight\": 1},
    {\"ipAddress\": \"10.0.2.21\", \"port\": 3000, \"weight\": 1}
  ]"

# Create frontend listener (HTTPS)
oci nlb listener create \
  --load-balancer-id $LB_OCID \
  --name "frontend-listener" \
  --protocol "TCP" \
  --port 443 \
  --default-backend-set-name "frontend-targets"
```

### Configure SSL/TLS

```bash
# Create self-signed certificate (or use existing)
openssl req -x509 -newkey rsa:4096 -keyout private.key -out public.crt -days 365 -nodes

# Import certificate to OCI Certificate Service
CERT_OCID=$(oci certificates-management certificate-authority certificate create-by-importing \
  --certificate-pem "$(cat public.crt)" \
  --private-key-pem "$(cat private.key)" \
  --compartment-id $COMPARTMENT_ID \
  --query 'data.id' --raw-output)

# Update listener with SSL
oci nlb listener update \
  --load-balancer-id $LB_OCID \
  --listener-name "frontend-listener" \
  --ssl-configuration '{"certificateIds": ["'$CERT_OCID'"]}' \
  --force
```

### Configure DNS

```bash
# Point domain to load balancer IP
# Update DNS records:
# - A record: optora.example.com -> $LB_IP
# - A record: api.optora.example.com -> $LB_IP

# If using OCI DNS:
Zone_ID="ocid1.dns.oc1..xxxxx"

oci dns record patch \
  --zone-name-or-id $Zone_ID \
  --domain "optora.example.com" \
  --rdata "$LB_IP" \
  --rtype "A" \
  --ttl 300
```

---

## Step 6: Production Configuration

### Environment Variables

```bash
# Create environment file for backend
cat > backend-env.sh << 'EOF'
export DATABASE_URL="postgresql://postgres:PASSWORD@$DB_HOST:5432/optora"
export JWT_SECRET="$(openssl rand -base64 32)"
export ENCRYPTION_KEY="$(openssl rand -base64 32)"
export LOG_LEVEL="INFO"
export ENVIRONMENT="production"
export API_PORT="8000"
export MAX_CONNECTIONS="100"
export SCAN_TIMEOUT="3600"
export CREDENTIAL_ENCRYPTION_ALGORITHM="AES-256-GCM"
EOF

# Apply to container instances
for INSTANCE_OCID in $(oci compute-container-instance list \
  --compartment-id $COMPARTMENT_ID \
  --query 'data[?display_name | contains(`backend`)].id' --raw-output); do
  # Update environment
done
```

---

## Monitoring & Logging

**When to use:**
- ✅ Customer starts trial
- ✅ Scheduled daily cost scans
- ✅ Event-driven anomaly triggers
- ❌ Real-time WebSocket support needed

---

### Option 2: **OCI Compute (Always-On VM, Recommended for Production)**

**Best for:** Production SaaS, real-time WebSocket support, high-throughput

```bash
# 1. Launch OCI Compute Instance
oci compute instance launch \
  --availability-domain $AD \
  --display-name optiora-prod \
  --image-id $UBUNTU_IMAGE_ID \
  --shape VM.Standard.E4.Flex \
  --subnet-id $SUBNET_ID \
  --ssh-authorized-keys-file ~/.ssh/id_rsa.pub

# 2. SSH into instance
ssh -i ~/.ssh/id_rsa ubuntu@<instance_ip>

# 3. Deploy Docker container
docker run -d \
  --name optiora \
  -p 8000:8000 \
  --env-file .env \
  -v optiora_data:/data \
  optiora-mcp:latest

# 4. Setup OCI Load Balancer (optional)
oci nlb network-load-balancer create \
  --display-name optiora-lb \
  --is-private false
```

**Pricing:**
- **VM.Standard.E4.Flex (1 OCPU):** $0.055/hour = **$40/month**
- **OCI PostgreSQL (1 OCPU):** $0.15/hour = **$110/month**
- **OCI Object Storage (10GB):** ~$10/month
- **Total:** ~**$160/month** (all-inclusive)

**When to use:**
- ✅ Production SaaS platform
- ✅ 24/7 always-on requirements
- ✅ WebSocket support for real-time dashboards
- ✅ Multi-tenant isolation needed

---

### Option 3: **OCI Kubernetes Engine (OKE)**

**Best for:** Large-scale multi-tenant, complex orchestration

```bash
# 1. Create OKE cluster
oci ce cluster create \
  --display-name optiora-cluster \
  --vcn-id $VCN_ID \
  --kubernetes-version v1.28

# 2. Create node pool
oci ce node-pool create \
  --cluster-id $CLUSTER_ID \
  --node-shape VM.Standard.E4.Flex

# 3. Deploy OptiOra Helm chart
helm install optiora ./helm/optiora-chart \
  --namespace optiora \
  --values values-prod.yaml

# 4. Scale to handle multiple customers
kubectl autoscale deployment optiora --min=2 --max=10
```

**Pricing:**
- **OKE Cluster (free):** $0
- **Node pool (3 workers, E4.Flex):** $120/month
- **OCI PostgreSQL:** $110/month
- **Total:** ~**$230/month**

**When to use:**
- ✅ 100+ paying customers
- ✅ Complex multi-tenant requirements
- ✅ Auto-scaling needed

---

## Production Reference Architecture (OCI)

```
┌──────────────────────────────────────────────────────────────┐
│             OCI API Gateway (API Management)                 │
│  • Customer authentication (OAuth 2.0 / mTLS)               │
│  • Rate limiting (100 req/sec per customer)                 │
│  • Request/Response transformation                           │
└────────────────┬─────────────────────────────────────────────┘
                 │
        ┌────────▼────────┐
        │  OCI Load       │
        │  Balancer       │
        │  (Health check) │
        └────────┬────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
┌────────┐  ┌────────┐  ┌────────┐
│ Compute│  │Compute │  │Compute │  <- Auto-scaling group (2–10)
│Instance│  │Instance│  │Instance│     VM.Standard.E4.Flex
│ Port   │  │ Port   │  │ Port   │
│ 8000   │  │ 8000   │  │ 8000   │
└────┬───┘  └────┬───┘  └────┬───┘
     │           │           │
     ▼           ▼           ▼
  ┌─────────────────────────────────┐
  │                                 │
  │  Shared OCI PostgreSQL          │
  │  • Multi-schema isolation       │
  │  • Automatic backups (7 days)   │
  │  • High availability (2 zones)  │
  │                                 │
  └─────────────────────────────────┘
          │           │
          ▼           ▼
    ┌──────────────────────────┐
    │ OCI Object Storage       │
    │ • Historical cost data   │
    │ • Audit logs (365 days)  │
    │ • Customer reports       │
    └──────────────────────────┘
            │
            ▼
  ┌──────────────────────────┐
  │ OCI Monitoring           │
  │ • Metrics (CPU, memory)  │
  │ • Logs (CloudWatch alt)  │
  │ • Alarms & escalations   │
  └──────────────────────────┘
```

---

## Step-by-Step: Deploy to OCI Compute (Fastest Path)

### Prerequisites
- OCI account with $300 free credits
- OCI CLI installed (`brew install oci-cli`)
- Docker installed locally

### 1. Create OCI Compute Instance (3 min)

```bash
# Set variables
COMPARTMENT_ID="ocid1.compartment.oc1..your_compartment"
AD="EhKB:US-PHOENIX-1-AD-1"  # Adjust to your region
IMAGE_ID="ocid1.image.oc1.phx.aaaaaaaxxxxxx"  # Ubuntu 22.04 LTS

# Launch instance
oci compute instance launch \
  --availability-domain $AD \
  --compartment-id $COMPARTMENT_ID \
  --display-name optiora-prod \
  --image-id $IMAGE_ID \
  --shape VM.Standard.E4.Flex \
  --shape-config '{"memoryInGBs": 4, "ocpus": 1}' \
  --ssh-authorized-keys-file ~/.ssh/id_rsa.pub \
  --wait-for-state RUNNING

# Get instance details
oci compute instance list \
  --compartment-id $COMPARTMENT_ID \
  --display-name optiora-prod
```

### 2. Setup Network (Security Lists)

```bash
# Get VCN
VCN_ID=$(oci network vcn list --compartment-id $COMPARTMENT_ID --output table \
  | grep -i optiora | awk '{print $2}' || echo "default")

# Allow inbound HTTP/HTTPS
oci network security-list update \
  --security-list-id $SECURITY_LIST_ID \
  --display-name optiora-rules \
  --ingress-security-rules '[
    {
      "protocol": "6",
      "source": "0.0.0.0/0",
      "tcpOptions": {"destinationPortRange": {"min": 8000, "max": 8000}}
    }
  ]'
```

### 3. SSH & Deploy OptiOra (5 min)

```bash
# SSH into instance
ssh -i ~/.ssh/id_rsa ubuntu@<instance_public_ip>

# Clone OptiOra repo
git clone https://github.com/yourusername/optiora.git
cd optiora

# Build Docker image
docker build -t optiora-mcp:latest .

# Create .env from template
cp .env.example .env
# Edit .env with your cloud credentials

# Run container
docker run -d \
  --name optiora \
  -p 8000:8000 \
  --env-file .env \
  --restart unless-stopped \
  optiora-mcp:latest

# Verify it's running
curl http://localhost:8000/health
```

### 4. Setup Monitoring & Alerts

```bash
# Create OCI monitoring alarm (if CPU > 80%)
oci monitoring alarm create \
  --display-name optiora-high-cpu \
  --metric-display-name CPUUtilization \
  --namespace oci_compute \
  --statistic MEAN \
  --threshold 80.0 \
  --trigger-rule-type THRESHOLD
```

### 5. Point Domain to Instance

```bash
# Get instance public IP
INSTANCE_IP=$(oci compute instance list-vnics \
  --instance-id $INSTANCE_ID \
  --query 'data[0]."public-ip"' --output text)

# Update DNS (example: Namecheap, Route53, OCI DNS)
# A record: optiora.yourcompany.com -> $INSTANCE_IP
```

### 6. Setup Let's Encrypt SSL (1 min)

```bash
# SSH into instance
ssh ubuntu@optiora.yourcompany.com

# Install Certbot
sudo apt install certbot

# Get certificate
sudo certbot certonly --standalone -d optiora.yourcompany.com

# Update Docker container to use SSL
docker run -d \
  -p 443:443 \
  -v /etc/letsencrypt:/etc/letsencrypt \
  --env-file .env \
  optiora-mcp:latest
```

---

## Cost Breakdown (Monthly)

| Component | Cost | Notes |
|-----------|------|-------|
| **OCI Compute** (VM.Standard.E4.Flex, 1 OCPU) | $40 | Always-on instance |
| **OCI PostgreSQL** (1 OCPU) | $110 | For audit logs + customer data |
| **OCI Object Storage** (50GB) | $1.30 | Historical data, exports |
| **OCI Load Balancer** | $10 | (Optional, if scaling to 2+ VMs) |
| **OCI API Gateway** | $5 | ~50K requests/month @ $0.000075/req |
| **OCI Monitoring/Logging** | Free | Included |
| **Data transfer (egress)** | $0 | Free within OCI |
| **DNS** (OCI or Namecheap) | $1–5 | Domain only |
| **Total (MVP)** | **~$165/month** | Everything included |

**Comparison:**
- AWS equivalent: $300–400/month
- Azure equivalent: $280–350/month
- **OCI is 50% cheaper** ✅

---

## Auto-Scaling (When You Get Busy)

### Scale Horizontally (Add VMs)

```bash
# Create instance configuration template
oci compute instance-configuration create \
  --display-name optiora-config \
  --instance-details '{
    "instance_type": "compute",
    "launch_details": {
      "shape": "VM.Standard.E4.Flex",
      "image_id": "'$IMAGE_ID'"
    }
  }'

# Create instance pool (auto-scaling group)
oci compute instance-pool create \
  --compartment-id $COMPARTMENT_ID \
  --instance-configuration-id $CONFIG_ID \
  --size 2 \
  --placement-configurations '[
    {"availability-domain": "EhKB:US-PHOENIX-1-AD-1", "primary-subnet-id": "'$SUBNET_ID'"}
  ]'

# Add autoscaling rules
oci autoscaling auto-scaling-configuration create \
  --auto-scaling-group-id $POOL_ID \
  --scale-up-rules '[{"metric_name": "CPUUtilization", "threshold": 70}]' \
  --scale-down-rules '[{"metric_name": "CPUUtilization", "threshold": 30}]'
```

---

## Disaster Recovery & Backups

### Daily Backups (OCI)

```bash
# Backup PostgreSQL (automated daily @ 3 AM UTC)
oci db-management sql-plan-baselines download \
  --protected-database-id $DB_ID

# Backup Object Storage data (lifecycle policy)
oci os object lifecycle-policy create \
  --bucket-name optiora-backups \
  --items '[{
    "action": "ARCHIVE",
    "isEnabled": true,
    "timeAmount": 30,
    "timeUnit": "DAYS"
  }]'
```

### Disaster Recovery Plan

| Scenario | RTO | RPO | Solution |
|----------|-----|-----|----------|
| **VM crashes** | 5 min | 1 min | OCI Auto-scaling (replace instance) |
| **Database failure** | 2 min | ~10 sec | OCI PostgreSQL High Availability |
| **Object Storage outage** | 1 hour | 1 day | Cross-region replication (async) |
| **Region outage** | 4 hours | 1 hour | Manual failover to backup region |

---

## Git Workflow for Deployments

```bash
# 1. Code changes
git commit -am "Add OCI anomaly detection"

# 2. Build Docker image
docker build -t optiora-mcp:v1.0 .

# 3. Tag and push to OCI Registry
oci artifacts container image build -t $OCI_REGION.ocir.io/$NAMESPACE/optiora-mcp:v1.0

# 4. SSH and redeploy
ssh ubuntu@optiora.yourcompany.com

# 5. Pull new image and restart
docker pull $OCI_REGION.ocir.io/$NAMESPACE/optiora-mcp:v1.0
docker stop optiora && docker rm optiora
docker run -d --name optiora ... (as above)
```

---

## Troubleshooting

### Instance won't start
```bash
# Check OCI console for errors
oci compute instance get --instance-id $INSTANCE_ID

# Check compute logs
ssh ubuntu@instance_ip
tail -f /var/log/cloud-init-output.log
```

### Database connection fails
```bash
# Verify network access
oci network security-list get --security-list-id $SEC_LIST_ID

# Test connection
psql -h $DB_HOST -U optiora_user -d optiora
```

### Docker container crashes
```bash
# Check logs
docker logs optiora

# Verify environment variables
docker inspect optiora | grep Env
```

---

## Next Steps

1. ✅ Launch OCI Compute instance ($40/mo)
2. ✅ Deploy OptiOra Docker container (15 min)
3. ✅ Test all 6 MCP tools (anomaly detection, recommendations, etc.)
4. ✅ Setup SSL certificate (Let's Encrypt)
5. ✅ Point custom domain to instance
6. ✅ Configure Slack webhooks for alerts
7. ✅ Launch Product Hunt & cold email campaign

**You're now hosting multi-cloud cost management on OCI, 50% cheaper than AWS. 🚀**
