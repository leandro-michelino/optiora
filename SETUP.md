# Setup & Installation Guide for OptiOra

Complete step-by-step guide to set up OptiOra locally or in production.

---

## Table of Contents

1. [Local Development](#local-development)
2. [Production Deployment (OCI)](#production-deployment)
3. [Docker Deployment](#docker-deployment)
4. [Environment Configuration](#environment-configuration)
5. [Troubleshooting](#troubleshooting)

---

## Local Development

### Prerequisites

- **Python**: 3.10+ ([download](https://www.python.org))
- **Node.js**: 18+ ([download](https://nodejs.org))
- **Git**: Latest version ([download](https://git-scm.com))
- **(Optional) Docker**: For containerized development

### Backend Setup (Python MCP Server)

#### 1. Clone Repository

```bash
git clone https://github.com/leandro-michelino/optiora.git
cd optiora
```

#### 2. Create Virtual Environment

```bash
# macOS/Linux
python3 -m venv .venv
source .venv/bin/activate

# Windows
python -m venv .venv
.venv\Scripts\activate
```

#### 3. Install Dependencies

```bash
# Using requirements.txt (recommended)
pip install --upgrade pip
pip install -r requirements.txt

# Or using poetry (if installed)
poetry install
```

#### 4. Configure Environment Variables

```bash
# Copy example to actual .env file
cp .env.example .env

# Edit with your cloud credentials
nano .env
```

**Minimal Configuration (AWS only):**

```env
# AWS
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1

# MCP Server
MCP_PORT=8000
MCP_LOG_LEVEL=INFO
```

**Full Multi-Cloud Configuration:**

```env
# AWS
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1

# Azure
AZURE_SUBSCRIPTION_ID=your_subscription
AZURE_TENANT_ID=your_tenant
AZURE_CLIENT_ID=your_client_id
AZURE_CLIENT_SECRET=your_secret

# GCP
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GCP_PROJECT_ID=your_project

# OCI (for cost analysis, not required for local dev)
OCI_CONFIG_FILE=~/.oci/config
OCI_PROFILE=DEFAULT
OCI_REGION=us-phoenix-1

# MCP Server
MCP_PORT=8000
MCP_LOG_LEVEL=DEBUG
```

#### 5. Run Server

```bash
# Method 1: Direct Python
python -m finops_mcp.server

# Method 2: Using Poetry (if installed)
poetry run optiora

# Expected output:
# INFO:finops_mcp.server:Starting OptiOra MCP server...
# INFO:finops_mcp.server:MCP Server listening on port 8000
```

#### 6. Verify It's Running

```bash
# In another terminal
curl -X GET http://localhost:8000/health
# Returns: {"status": "healthy"}
```

### Frontend Setup (React Dashboard)

#### 1. Navigate to Dashboard

```bash
cd dashboard
```

#### 2. Install Dependencies

```bash
npm install
```

#### 3. Configure Environment

```bash
# Copy example
cp .env.local.example .env.local

# Edit if needed (usually works as-is for local dev)
nano .env.local
```

**Default Configuration:**

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

#### 4. Start Development Server

```bash
npm run dev

# Open browser: http://localhost:3000
```

#### 5. Build for Production

```bash
npm run build
npm start
```

### Running Tests

```bash
# From project root
pytest tests/ -v

# Expected: 33 tests pass
# ====== 33 passed in 0.XX s ======
```

---

## Production Deployment

### Prerequisites for OCI Deployment

- OCI account with tenancy OCID
- OCI CLI installed and configured
- Docker installed (for image building)
- GitHub account with repository access

### Step 1: Set Up OCI Resources

#### 1a. Create OCI Compartment

```bash
# Create a compartment for OptiOra
oci iam compartment create \
  --name optiora \
  --description "OptiOra MCP server and resources"
```

Note the returned `id` (COMPARTMENT_ID).

#### 1b. Create PostgreSQL Database

```bash
# Launch PostgreSQL Database System (via OCI Console)
# Service: Database > MySQL Database Service > PostgreSQL
# 
# Configuration:
# - Name: optiora-db
# - Shape: MySQL.VM.Standard.E3.1.2GB
# - Public IP: No (private VCN)
# - High Availability: Disabled (for MVP)
# 
# Save credentials for later
```

#### 1c. Create Compute Instance

```bash
# Use deploy script (see below)
# Or manually via OCI Console:
# - Service: Compute > Instances
# - Image: Ubuntu 24.04 LTS
# - Shape: VM.Standard.E4.Flex (2 OCPU, 8 GB RAM)
# - VCN: Default or custom VCN
```

### Step 2: Set Environment Variables

```bash
export OCI_REGION=us-phoenix-1
export OCI_COMPARTMENT_ID=ocid1.compartment.oc1..xxx
export OCI_IMAGE_ID=ocid1.image.oc1...ubuntu...
export OCI_INSTANCE_NAME=optiora-mcp
```

### Step 3: Deploy Using Script

```bash
# Make script executable
chmod +x deploy/deploy-oci.sh

# Run deployment
./deploy/deploy-oci.sh compute

# Script will:
# 1. Validate prerequisites
# 2. Create compute instance
# 3. Install Docker
# 4. Pull OptiOra image
# 5. Configure environment
# 6. Start MCP server
```

### Step 4: Configure API Gateway (Optional)

```bash
# Via OCI Console:
# - Service: Developer Services > API Gateway
# - Create new API Gateway
# - Add routes to Compute instance
# - Enable SSL/TLS
# - Set rate limiting

# Update .env:
export OCI_API_GATEWAY_URL=https://your-gateway.apigateway.us-phoenix-1.oci.customer-oci.com
```

### Step 5: Deploy Frontend

#### Option A: Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# From dashboard directory
cd dashboard
vercel

# Follow prompts:
# - Link to GitHub repository
# - Set environment variables:
#   NEXT_PUBLIC_API_URL=your_oci_api_gateway_url
# - Deploy

# Dashboard will be live at: optiora.vercel.app
```

#### Option B: CloudFlare Pages

```bash
# Install Wrangler
npm install -g wrangler

# Deploy
wrangler pages deploy dashboard/out

# Follow prompts to connect GitHub
```

#### Option C: Self-Hosted

```bash
# Build dashboard
cd dashboard
npm run build

# Deploy to any static host (S3, GCS, etc.)
# Or use Next.js server deployment
npm start  # Runs on :3000
```

---

## Docker Deployment

### Build Docker Image

```bash
# From project root
docker build -t optiora:latest .

# Verify image
docker images | grep optiora
```

### Run Locally with Docker

```bash
# Create .env file first
cp .env.example .env

# Run container
docker run -d \
  --name optiora-mcp \
  -p 8000:8000 \
  --env-file .env \
  optiora:latest

# Check logs
docker logs -f optiora-mcp

# Stop container
docker stop optiora-mcp
docker rm optiora-mcp
```

### Run with Docker Compose

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all
docker-compose down
```

### Push to Registry

```bash
# Tag image
docker tag optiora:latest ghcr.io/leandro-michelino/optiora:latest

# Login to registry
docker login ghcr.io

# Push
docker push ghcr.io/leandro-michelino/optiora:latest
```

---

## Environment Configuration

### Complete Environment Reference

#### Server Configuration

```env
# MCP Server Settings
MCP_PORT=8000                    # Server port
MCP_LOG_LEVEL=INFO               # DEBUG, INFO, WARNING, ERROR
DEPLOYMENT_TYPE=oci-compute      # oci-compute, oci-functions, docker
```

#### AWS Configuration

```env
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1
```

#### Azure Configuration

```env
AZURE_SUBSCRIPTION_ID=12345678-1234-1234-1234-123456789012
AZURE_TENANT_ID=87654321-4321-4321-4321-210987654321
AZURE_CLIENT_ID=11111111-2222-3333-4444-555555555555
AZURE_CLIENT_SECRET=your_client_secret_xyz123
```

#### GCP Configuration

```env
# Path to service account JSON file
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GCP_PROJECT_ID=my-gcp-project
```

#### OCI Configuration

```env
OCI_CONFIG_FILE=~/.oci/config           # Path to OCI config
OCI_PROFILE=DEFAULT                     # OCI profile name
OCI_REGION=us-phoenix-1                 # OCI region
OCI_COMPARTMENT_ID=ocid1.compartment... # Compartment ID (if not in config)
```

#### OCI Database Configuration

```env
OCI_DB_HOST=optiora-db.subnet.vcn.oraclevcn.com
OCI_DB_PORT=5432
OCI_DB_USER=optiora_user
OCI_DB_PASSWORD=your_secure_password
OCI_DB_NAME=optiora
```

#### OCI Deployment Options

```env
# If using OCI Functions (serverless)
DEPLOYMENT_TYPE=oci-functions
OCI_FUNCTION_OCID=ocid1.fnfunc.oc1...

# If using API Gateway
OCI_API_GATEWAY_URL=https://your-api-gateway.apigateway.region.oci.customer-oci.com
```

---

## Troubleshooting

### Backend Issues

#### "Module not found" Error

```bash
# Solution: Activate virtual environment
source .venv/bin/activate

# Verify installation
pip list | grep mcp
```

#### "Connection refused" Error

```bash
# Solution: Check if server is running
curl http://localhost:8000/health

# If not running, start it:
python -m finops_mcp.server
```

#### "AWS credentials not found"

```bash
# Solution: Set credentials
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret

# Or use AWS credentials file
~/.aws/credentials

# Test connection
python -c "import boto3; print('OK')"
```

#### "Permission denied" (OCI)

```bash
# Fix OCI config permissions
chmod 600 ~/.oci/config
chmod 600 ~/.oci/oci_api_key.pem

# Verify config
oci compute instance list --compartment-id $OCI_COMPARTMENT_ID
```

### Frontend Issues

#### "Cannot find module" Error

```bash
# Solution: Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

#### Port 3000 Already in Use

```bash
# Solution: Use different port
npm run dev -- -p 3001

# Or find and kill process
lsof -i :3000
kill -9 <PID>
```

#### API Connection Failed

```bash
# Solution: Check NEXT_PUBLIC_API_URL
cat dashboard/.env.local

# Verify backend is running
curl http://localhost:8000/health

# Update .env.local if needed
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > dashboard/.env.local
```

### Docker Issues

#### "Cannot connect to Docker daemon"

```bash
# Solution: Start Docker
sudo systemctl start docker

# Or use Docker Desktop (on macOS/Windows)
```

#### Image Build Failed

```bash
# Solution: Clean and rebuild
docker system prune -a
docker build --no-cache -t optiora:latest .
```

### Database Issues

#### "Connection refused" (PostgreSQL)

```bash
# Solution: Check if database is running
docker-compose ps

# Start if stopped
docker-compose up -d

# Verify connection
psql -h localhost -U optiora_user -d optiora
```

#### Database Schema Not Found

```bash
# Solution: Run migrations
python -m finops_mcp.database  # Runs schema creation

# Verify tables
psql -h localhost -d optiora -c "\dt"
```

---

## Next Steps

1. **Run Tests**: `pytest tests/ -v`
2. **Explore Code**: Check `ARCHITECTURE_COMPLETE.md`
3. **Read Contributing Guide**: See `CONTRIBUTING.md`
4. **Deploy**: Follow production deployment steps above

---

## Support

- 📚 [Documentation](./README.md)
- 🏗️ [Architecture](./ARCHITECTURE_COMPLETE.md)
- 🧪 [Testing Guide](./TESTING.md)
- 🤝 [Contributing Guide](./CONTRIBUTING.md)
- 🚀 [Deployment Guide](./OCI_DEPLOYMENT.md)

**Questions?** Open an issue or contact the maintainers.
