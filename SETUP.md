# OptiOra Deployment Guide

🚀 **OCI-ONLY DEPLOYMENT**

OptiOra is deployed **exclusively on Oracle Cloud Infrastructure (OCI)**.

- ❌ NOT available for local/laptop development
- ❌ NOT available for on-premises deployment
- ❌ NOT available for self-hosted private infrastructure
- ✅ **ONLY available as managed service on OCI**

---

## Quick Start

OptiOra is a managed service. Access and deployment are handled through OCI.

### Prerequisites

- OCI account with active subscription
- OCI CLI installed: [Download](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/gettingstarted.htm)
- GitHub account (for source repository)

### One-Click Deployment

```bash
# 1. Clone repository
git clone https://github.com/leandro-michelino/optiora.git
cd optiora

# 2. Set OCI credentials (one time)
oci setup config

# 3. Run deployment script
chmod +x deploy/deploy-oci.sh
./deploy/deploy-oci.sh

# Deployment complete! Access dashboard via OCI API Gateway URL
```

---

## Deployment Options

### Option 1: OCI Compute (Recommended for Most Users)

**Best for:** Production deployments, predictable workloads, cost control

```bash
# Deploy to OCI Compute Instance
./deploy/deploy-oci.sh compute

# Returns: Dashboard URL
# Example: https://optiora.apigateway.us-phoenix-1.oci.customer-oci.com
```

**What gets created:**
- Ubuntu 24.04 LTS Compute Instance (VM.Standard.E4.Flex)
- PostgreSQL Database (OCI DBaaS)
- API Gateway with DNS
- SSL/TLS certificates

**Estimated cost:** $520/month (optimized) to $975/month (HA)

### Option 2: OCI Functions (Serverless - Preview)

**Best for:** Low-traffic, variable workloads, no server management

```bash
# Deploy serverless functions
./deploy/deploy-oci.sh functions

# Auto-scales to zero when idle
# Pay per invocation only
```

**Estimated cost:** $50-200/month depending on usage

### Option 3: OCI Container Engine (Kubernetes - Enterprise)

**Best for:** Multi-tenant deployments, advanced orchestration

```bash
# Deploy to OKE cluster
./deploy/deploy-oci.sh kubernetes

# Requires: Existing OKE cluster
```

---

## Configuration

### Environment Setup

Create your `.env` file in the project root:

```bash
cp .env.example .env
```

### Required Variables

```env
# OCI Configuration
OCI_REGION=us-phoenix-1
OCI_COMPARTMENT_ID=ocid1.compartment.oc1..xxxxx
OCI_PROFILE=DEFAULT

# Database
OCI_DB_HOST=your-db-instance.subnet.vcn.oraclevcn.com
OCI_DB_USER=optiora_user
OCI_DB_PASSWORD=your_secure_password

# Cloud Provider Credentials (for cost analysis)
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AZURE_SUBSCRIPTION_ID=your_subscription
GCP_PROJECT_ID=your_project

# GenAI (Claude AI)
ANTHROPIC_API_KEY=your_anthropic_key
```

### Deploy the Service

```bash
# Validate configuration
./deploy/deploy-oci.sh validate

# Deploy to OCI
./deploy/deploy-oci.sh

# Monitor deployment
./deploy/deploy-oci.sh status
```

---

## Accessing Your Deployment

### Via OCI API Gateway

After deployment completes, you'll receive:

```
Dashboard URL:
https://optiora-XXXXX.apigateway.us-phoenix-1.oci.customer-oci.com

MCP API:
https://optiora-api-XXXXX.apigateway.us-phoenix-1.oci.customer-oci.com

Documentation:
https://optiora-docs-XXXXX.apigateway.us-phoenix-1.oci.customer-oci.com
```

### Via OCI Console

1. Sign in: [OCI Console](https://www.oracle.com/cloud/sign-in/)
2. Navigate: **Developer Services** → **API Gateway**
3. Select deployed API
4. View endpoint URLs and metrics

---

## Scaling & Monitoring

### View Deployment Status

```bash
# Check all resources
./deploy/deploy-oci.sh status

# View logs
./deploy/deploy-oci.sh logs

# Get metrics
./deploy/deploy-oci.sh metrics
```

### Scale Compute Instance

```bash
# Increase OCPU allocation
./deploy/deploy-oci.sh scale --ocpu 4 --memory 16

# Current: 2 OCPU, 8 GB RAM
# After: 4 OCPU, 16 GB RAM
```

### Enable High Availability

```bash
# Deploy with HA (Multi-AZ, Load Balancer)
./deploy/deploy-oci.sh ha enable

# Estimated additional cost: $455/month
```

---

## Maintenance & Updates

### Update OptiOra

```bash
# Pull latest code
git pull origin main

# Deploy update
./deploy/deploy-oci.sh update

# Zero-downtime deployment (via load balancer)
```

### Database Backups

Automated daily via OCI DBaaS. No action required.

### Monitor Costs

```bash
# View cost breakdown
./deploy/deploy-oci.sh costs

# Analyze spending
oci ce object-storage list --compartment-id $OCI_COMPARTMENT_ID
```

---

## Upgrading Plan

### From MVP to Professional

```bash
# Add HA and additional compute
./deploy/deploy-oci.sh upgrade professional

# Adds:
# - Multi-AZ deployment
# - Load balancer
# - Automatic backups
# - SLA support

# Cost increase: $455/month
```

### From Professional to Enterprise

Contact: sales@optiora.ai

---

## Troubleshooting

### Deployment Failed

```bash
# Check prerequisites
./deploy/deploy-oci.sh validate

# View detailed logs
./deploy/deploy-oci.sh logs --level DEBUG

# Common issue: OCI credentials not configured
oci setup config
```

### Cannot Connect to Dashboard

```bash
# Verify deployment status
./deploy/deploy-oci.sh status

# Check API Gateway rules
oci api-gateway api list --compartment-id $OCI_COMPARTMENT_ID

# Verify VCN security lists
oci network security-list list --vcn-id $VCN_ID
```

### Database Connection Error

```bash
# Check database is running
oci mysql-db system list --compartment-id $OCI_COMPARTMENT_ID

# Verify credentials in .env
grep OCI_DB .env

# Test connection
psql -h $OCI_DB_HOST -U $OCI_DB_USER -d optiora
```

---

## Support

- 📚 [Documentation](./DOCUMENTATION.md)
- 🏗️ [Architecture](./ARCHITECTURE_COMPLETE.md)
- 🚀 [Deployment FAQ](./OCI_DEPLOYMENT.md)
- 💼 [Enterprise Support](https://optiora.ai/enterprise)

**Need help?** Contact: support@optiora.ai
