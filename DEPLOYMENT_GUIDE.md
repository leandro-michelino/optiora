# OptiOra Deployment Guide

## Overview

This guide walks you through deploying OptiOra to Oracle Cloud Infrastructure (OCI) from your local machine. The deployment uses OCI CLI and is fully manual to give you complete control.

**Important:** All deployment must be done from your laptop using the deploy script. There is **NO automatic deployment** from GitHub.

---

## Prerequisites

Before deploying, ensure you have:

### 1. **OCI Account & CLI Setup**
```bash
# Verify OCI CLI is installed
oci --version

# Verify OCI config exists
ls -la ~/.oci/config

# Test OCI connectivity
oci os ns get
```

### 2. **Local Environment**
```bash
# Python 3.10+
python3 --version

# Node.js 18+
node --version

# Dependencies installed
cd /path/to/newproject
source .venv/bin/activate
poetry install

cd dashboard
npm install --legacy-peer-deps
```

### 3. **Environment Configuration**
Copy `.env.example` to `.env` in both locations:
```bash
# Backend environment
cp .env.example .env

# Frontend environment  
cp dashboard/.env.example dashboard/.env
```

**Required variables in `.env`:**
- OCI credentials (OCI_TENANCY, OCI_USER, OCI_KEY_PATH, OCI_KEY_FINGERPRINT)
- Cloud provider credentials (AWS_*, AZURE_*, GCP_*)
- OpenAI API Key for Claude integration
- Database connection string
- Server port (default 8000)

---

## Deployment Methods

### **Option 1: Deploy to OCI Compute Instance (Recommended)**

This method deploys the backend and frontend to a Linux VM in OCI.

#### Step 1: Prepare Deployment Script
```bash
cd /path/to/newproject

# Make script executable
chmod +x deploy/deploy-oci.sh

# View available commands
./deploy/deploy-oci.sh --help
```

#### Step 2: Deploy Backend & Frontend
```bash
# Deploy everything to OCI Compute
./deploy/deploy-oci.sh compute

# Expected output:
# ✅ Prerequisites validated
# ✅ Environment checked
# ✅ Python installed on instance
# ✅ Backend deployed and running
# ✅ Frontend built and deployed
# ✅ Deployment complete!
```

#### Step 3: Access Application
Once deployment completes:
- **Backend API:** `http://<INSTANCE_IP>:8000`
- **Frontend Dashboard:** `http://<INSTANCE_IP>:3000`
- **API Docs:** `http://<INSTANCE_IP>:8000/docs`

#### Step 4: Monitor Status
```bash
# Check deployment status
./deploy/deploy-oci.sh status

# View deployment logs
./deploy/deploy-oci.sh logs

# Expected logs show:
# - Backend MCP server running
# - Frontend Next.js server running
# - Port bindings (8000, 3000)
```

---

### **Option 2: Deploy to OCI Container Instance**

This method containerizes and deploys to OCI Container Instance registry.

#### Prerequisites
```bash
# Build container image locally (if needed)
docker build -t optiora-backend:latest -f Dockerfile .

# Push to OCI registry (replace with your registry)
docker tag optiora-backend:latest <REGION>.ocir.io/<TENANCY>/<REPO>/optiora:latest
docker push <REGION>.ocir.io/<TENANCY>/<REPO>/optiora:latest
```

#### Deploy Container
```bash
# Deploy to OCI Container Instance
./deploy/deploy-oci.sh container

# Expected output shows container instance details
```

---

### **Option 3: Deploy to Kubernetes (Advanced)**

For multi-region or highly available deployments.

```bash
# Deploy to OCI Container Runtime (Kubernetes)
./deploy/deploy-oci.sh kubernetes

# This will:
# - Create OCI Container Runtime cluster (if needed)
# - Deploy backend pods
# - Deploy frontend service
# - Configure ingress/load balancer
```

---

## Deployment Configuration

### Database Setup

OptiOra requires PostgreSQL 15+. Deploy to OCI:

```bash
# Option A: Use OCI Database Cloud Service (recommended)
1. Create PostgreSQL instance via OCI Console
2. Note the connection string
3. Add to `.env`: DATABASE_URL=postgres://user:pass@host:5432/optiora

# Option B: Deploy PostgreSQL on Compute VM
./deploy/deploy-oci.sh setup-database
```

### SSL/TLS Configuration

For production, enable HTTPS:

```bash
# Update deploy script with your domain
# Edit: deploy/deploy-oci.sh line ~50

DOMAIN="yourdomain.com"
CERTBOT_EMAIL="admin@yourdomain.com"

# Script will automatically:
# - Obtain Let's Encrypt certificate
# - Configure nginx reverse proxy
# - Enable auto-renewal
```

---

## Post-Deployment Tasks

### 1. Verify Services Running
```bash
# Check backend health
curl http://<INSTANCE_IP>:8000/health

# Expected response:
# {"status": "healthy", "version": "1.0.0"}

# Check frontend
curl -s http://<INSTANCE_IP>:3000 | head -20
```

### 2. Configure Cloud Credentials

In the OptiOra Dashboard:

1. Go to **Cloud Settings** → **Add Cloud Provider**
2. Select cloud provider (AWS, Azure, GCP, OCI)
3. Enter credentials securely
4. Click **Validate** - OptiOra will test access
5. Approve scanning when prompted

### 3. Start Cost Analysis

Once credentials are validated:
- Dashboard automatically begins analyzing costs
- Check **Costs** page for data
- View **Anomalies** for alerts
- Review **Recommendations** for optimization opportunities

### 4. Set Up Monitoring

```bash
# View real-time logs
./deploy/deploy-oci.sh logs

# Monitor specific service
./deploy/deploy-oci.sh logs --service backend

# Stream logs continuously  
./deploy/deploy-oci.sh logs --follow
```

---

## Updating Deployment

To redeploy after code changes:

### Before Deployment
1. Test locally:
   ```bash
   source .venv/bin/activate
   python -m finops_mcp.server  # Backend
   ```

   ```bash
   cd dashboard
   npm run build  # Frontend
   npm run start
   ```

2. Commit and push to Git:
   ```bash
   git add .
   git commit -m "Feature: Add cost anomaly alerts"
   git push origin main
   ```

### Redeploy to OCI
```bash
# Pull latest code from Git
./deploy/deploy-oci.sh pull-latest

# Redeploy with fresh code
./deploy/deploy-oci.sh compute --update

# Or full reinstall
./deploy/deploy-oci.sh compute --force
```

---

## Troubleshooting

### Backend Not Starting
```bash
# Check backend logs
./deploy/deploy-oci.sh logs --service backend

# Common issues:
# - Missing .env file → Copy .env.example to .env
# - Database connection failed → Check DATABASE_URL
# - Port already in use → Change PORT in .env
```

### Frontend Not Building
```bash
# Check frontend logs
./deploy/deploy-oci.sh logs --service frontend

# Common issues:
# - TypeScript errors → Run npm run build locally first
# - Missing env vars → Check frontend/.env
# - Node version mismatch → Verify Node 18+ on instance
```

### OCI CLI Not Found
```bash
# Install OCI CLI
brew install oci-cli  # macOS
sudo apt-get install python3-oci-cli  # Ubuntu
```

### Slow Deployment
```bash
# Check instance specs - upgrade if needed
# Backend needs: 2+ CPU, 4+ GB RAM
# Frontend needs: 2+ CPU, 2+ GB RAM

# View instance details
./deploy/deploy-oci.sh status --verbose
```

---

## Destroying Deployment

To remove all deployed resources:

```bash
# List all deployed resources
./deploy/deploy-oci.sh status --all

# Destroy deployment (frees resources, saves costs)
./deploy/deploy-oci.sh destroy

# Confirm when prompted:
# ⚠️  This will delete all deployed resources
# Type 'yes' to confirm: yes
```

**Warning:** This permanently removes:
- OCI Compute instances
- Container instances
- Load balancers
- Data will be lost if not backed up

---

## Cost Optimization

### Estimated Monthly Costs (US East Region)

| Component | Size | Cost/Month |
|-----------|------|-----------|
| Backend VM | 2 OCPU, 4GB RAM | $15-25 |
| Frontend VM | 1 OCPU, 2GB RAM | $8-12 |
| Database (DBaaS) | 2 OCPU, 20GB | $30-50 |
| **Total** | | **$53-87** |

### Cost-Saving Tips

1. **Use Always-Free Tier** - 2 Compute instances (1 OCPU, 1GB each)
2. **Right-size instances** - Start small, scale up as needed
3. **Use spot instances** - 50% discount for non-critical workloads
4. **Pause during off-hours** - Use stop/start instead of destroy
5. **Enable auto-scaling** - Scale down when traffic is low

---

## Security Best Practices

### 1. Network Security
```bash
# Restrict access to backend API (not exposed to internet)
# Only frontend can call backend

# Configure security groups in OCI UI:
# Backend: Allow port 8000 from frontend only
# Frontend: Allow ports 80, 443 from anywhere
```

### 2. Credential Management
```bash
# Never commit credentials to Git
# Use OCI Vault for secrets:

./deploy/deploy-oci.sh setup-vault

# Rotate credentials regularly
credentials-manager rotate --all
```

### 3. Backup Strategy
```bash
# Enable database backups
./deploy/deploy-oci.sh setup-backups

# Verify backup schedule
./deploy/deploy-oci.sh backups --list
```

### 4. SSL/TLS
```bash
# Always use HTTPS in production
# Deploy script handles Let's Encrypt setup

# Verify certificate
openssl s_client -connect yourdomain.com:443
```

---

## Advanced Configuration

### Multi-Region Deployment

Deploy OptiOra to multiple OCI regions for redundancy:

```bash
# Deploy to US East
./deploy/deploy-oci.sh compute --region us-phoenix-1

# Deploy to UK
./deploy/deploy-oci.sh compute --region uk-london-1

# Configure load balancer to route between regions
./deploy/deploy-oci.sh setup-load-balancer --regions us-phoenix-1,uk-london-1
```

### Custom Domain

```bash
# Configure custom domain
./deploy/deploy-oci.sh setup-domain --domain yourdomain.com

# Creates:
# - DNS A record pointing to load balancer
# - SSL certificate from Let's Encrypt
# - Auto-renewal setup
```

### Performance Tuning

```bash
# Enable caching
./deploy/deploy-oci.sh config --cache redis

# Enable CDN for frontend
./deploy/deploy-oci.sh config --cdn enable

# Optimize database
./deploy/deploy-oci.sh optimize-database
```

---

## Support & Documentation

- **API Documentation:** `/docs` endpoint on backend
- **Project Status:** See `PROJECT_STATUS.md` for roadmap
- **Architecture:** See `ARCHITECTURE_COMPLETE.md` for system design
- **Setup Guide:** See `SETUP.md` for local development

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-04-12 | Initial deployment guide |
| 1.1 | TBD | Add multi-region support |
| 1.2 | TBD | Add disaster recovery guide |

---

**Last Updated:** April 12, 2025  
**Maintained By:** OptiOra Dev Team
