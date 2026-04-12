# OptiOra: OCI Deployment Guide

🚀 **OCI-Exclusive Deployment**

OptiOra is deployed **exclusively on Oracle Cloud Infrastructure**. All infrastructure, including database, compute, and networking, runs on OCI.

---

## Prerequisites

### 1. OCI Account & Credentials

- Active OCI account with subscription
- OCI CLI installed: [Download](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/gettingstarted.htm)
- OCI credentials configured: `oci setup config`
- Appropriate IAM permissions for resource creation

### 2. GitHub Repository Access

- Clone/pull repository: `https://github.com/leandro-michelino/optiora.git`
- Local deployment script: `deploy/deploy-oci.sh`
- Working directory: Project root

### 3. Environment Setup

Create `.env` file from template:

```bash
cp .env.example .env
```

Required variables:

```env
# OCI Configuration
OCI_REGION=us-phoenix-1
OCI_COMPARTMENT_ID=ocid1.compartment.oc1..xxxxx
OCI_PROFILE=DEFAULT

# Cloud Provider Credentials (for cost analysis)
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AZURE_SUBSCRIPTION_ID=your_azure_subscription
GCP_PROJECT_ID=your_gcp_project

# GenAI Integration
ANTHROPIC_API_KEY=your_anthropic_key

# Optional: Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

---

## Deployment

### One-Command Deployment

```bash
# Make script executable
chmod +x deploy/deploy-oci.sh

# Deploy to OCI (interactive configuration)
./deploy/deploy-oci.sh
```

The script will:
1. ✅ Validate OCI credentials
2. ✅ Create VCN and subnets (if needed)
3. ✅ Provision PostgreSQL database
4. ✅ Create compute instance
5. ✅ Install dependencies
6. ✅ Start MCP backend server
7. ✅ Deploy React frontend
8. ✅ Configure API Gateway
9. ✅ Set up SSL/TLS certificates

**Estimated time:** 15-20 minutes first run, 5 minutes for updates.

### Deployment Options

**Option 1: Compute Instance (Recommended)**

```bash
./deploy/deploy-oci.sh compute
```

- Single or multi-instance deployment
- Manual scaling via OCI Console
- Public IP or private IP (via Load Balancer)
- Cost: $520-975/month

**Option 2: Container Instances (Serverless)**

```bash
./deploy/deploy-oci.sh container
```

- Fully managed container orchestration
- Auto-scaling based on load
- Pay only for compute used
- Cost: $50-300/month

**Option 3: Kubernetes (Enterprise)**

```bash
./deploy/deploy-oci.sh kubernetes
```

- Requires existing OKE cluster
- Advanced orchestration and multi-tenancy
- Enterprise SLA support
- Cost: varies by cluster size

### Script Options

```bash
# Show available options
./deploy/deploy-oci.sh --help

# Deploy with custom configuration
./deploy/deploy-oci.sh --region us-asian-phoenix-1 --shape VM.Standard.E4.Flex --memory 16

# Dry-run (preview changes without applying)
./deploy/deploy-oci.sh --dry-run

# Enable high availability
./deploy/deploy-oci.sh --ha

# Scale existing deployment
./deploy/deploy-oci.sh --scale-up
```

---

## Post-Deployment

### Access Your Instance

After deployment completes, you'll receive:

```
Dashboard URL:
https://optiora-XXXXXXX.apigateway.us-phoenix-1.oci.customer-oci.com

MCP API:
https://optiora-api-XXXXXXX.apigateway.us-phoenix-1.oci.customer-oci.com

Compute Instance IP:
api-optiora-east-XXX.us-phoenix-1.containers.oci.customer-oci.com
```

### Verify Deployment

```bash
# Check MCP server status
curl -s https://optiora-api-XXXXXXX.apigateway.us-phoenix-1.oci.customer-oci.com/health
# Response: {"status":"healthy"}

# View logs
./deploy/deploy-oci.sh logs

# Monitor performance
./deploy/deploy-oci.sh metrics
```

---

## Maintenance

### Database Backups

Automated daily backups configured during deployment. To restore:

```bash
./deploy/deploy-oci.sh restore-database --backup-date 2026-04-10
```

### Update Deployment

```bash
# Pull latest code
git pull origin main

# Deploy updates (zero-downtime)
./deploy/deploy-oci.sh update
```

### Scaling

```bash
# Scale up compute
./deploy/deploy-oci.sh scale --ocpu 4 --memory 16

# Replicate across multiple regions
./deploy/deploy-oci.sh replicate --regions us-phoenix-1,uk-london-1
```

### Monitoring

Monitor via OCI Console or CLI:

```bash
# View compute instance metrics
oci monitoring metric-data summarize-metrics-data \
  --namespace oci_compute \
  --query-text "ResourceId = \"$INSTANCE_OCID\""

# View database performance
oci mysql db-system get --db-system-id $DB_SYSTEM_OCID

# View API Gateway metrics
oci api-gateway api get --api-id $API_ID
```

---

## Troubleshooting

### Deployment Failed

**Error: "OCI credentials not configured"**

```bash
# Reconfigure credentials
oci setup config

# Or verify existing config
oci identity tenancy get --query 'data.{name:name,id:id}'
```

**Error: "Insufficient quota for resource"**

```bash
# Check current usage
oci limits quotas list --compartment-id $COMPARTMENT_ID

# Contact OCI support for quota increase
```

### Cannot Connect to Dashboard

**"Connection refused" or "Gateway timeout"**

```bash
# Verify API Gateway is running
./deploy/deploy-oci.sh status

# Check network rules
./deploy/deploy-oci.sh verify-security-rules

# Restart services
./deploy/deploy-oci.sh restart
```

### Database Connection Error

**"PostgreSQL connection refused"**

```bash
# Verify database is running
oci mysql db-system list --compartment-id $COMPARTMENT_ID

# Check security list rules
./deploy/deploy-oci.sh verify-database-access

# Reset database password
./deploy/deploy-oci.sh reset-database-password
```

---

## Cost Estimation

### Monthly Costs

| Component | MVP | Professional | Enterprise |
|-----------|-----|--------------|------------|
| Compute | $160 | $320 | $640 |
| Database | $73 | $150 | $300 |
| Load Balancer | $0 | $10 | $40 |
| API Gateway | $0 | $20 | $50 |
| Storage/Backup | $30 | $100 | $200 |
| **Total** | **$263** | **$600** | **$1,230** |

View detailed breakdown:

```bash
./deploy/deploy-oci.sh costs
```

---

## Undeployment

### Remove Deployment

**Warning: This cannot be undone**

```bash
# Interactive removal with confirmation
./deploy/deploy-oci.sh destroy

# Force immediate removal
./deploy/deploy-oci.sh destroy --force
```

This will:
- Delete compute instances
- Drop database
- Remove VCN and subnets
- Clean up security groups
- Terminate API Gateway

---

## Support

- 📚 [Documentation Index](./DOCUMENTATION.md)
- 🏗️ [Architecture](./ARCHITECTURE_COMPLETE.md)
- 📖 [Setup Guide](./SETUP.md)
- 💼 [Enterprise Support](https://optiora.ai/enterprise)

**Questions?** Contact: support@optiora.ai
