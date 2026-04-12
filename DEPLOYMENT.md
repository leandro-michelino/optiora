# OptiOra — OCI Deployment Guide

🚀 **OptiOra is an OCI-only deployment platform.** No local development, Docker, or on-premises support.

---

## Quick Start (5 minutes)

```bash
# 1. Clone repository
git clone https://github.com/leandro-michelino/optiora.git
cd optiora

# 2. Configure OCI CLI
oci setup config

# 3. Deploy
export OCI_COMPARTMENT_ID=ocid1.compartment.oc1...
./deploy/deploy-oci.sh compute

# Deployment complete! Check status:
./deploy/deploy-oci.sh status
```

---

## Prerequisites

### OCI Account & CLI

```bash
# Verify OCI CLI is installed (v3.0+)
oci --version

# Verify OCI config exists
ls -la ~/.oci/config

# Test OCI connectivity
oci os ns get
```

**If OCI CLI is not installed:**
- macOS: `brew install oci-cli`
- Linux: Follow [OCI CLI installation guide](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/gettingstarted.htm)
- Windows: Download from OCI site or use WSL2

### OCI Credentials

You need:
1. **OCI Account** with active subscription (always-free tier eligible)
2. **Compartment ID** - Found in OCI Console → Identity → Compartments
3. **Private Key & Certificate** - Generated during `oci setup config`

### GitHub Access

- Repository cloned locally
- (Optional) GitHub credentials for updates

---

## Deployment Options

### Option 1: OCI Compute (Recommended ✅)

**Best for:** Most users, production workloads, cost-effective

```bash
# Single command deployment
./deploy/deploy-oci.sh compute

# What gets created:
# • Ubuntu 24.04 LTS VM (VM.Standard.E4.Flex)
# • Automatic service startup (systemd)
# • MCP server (port 8000)
# • Next.js dashboard (port 3000)
# • Health checks & monitoring

# Estimated cost: $50-100/month (always-free eligible)
# Setup time: 10-15 minutes
```

**Sizing options:**

```bash
# Default: 2 OCPUs, 8GB RAM
./deploy/deploy-oci.sh compute

# High performance: 4 OCPUs, 16GB RAM
export OCI_OCPU_COUNT=4
export OCI_MEMORY_GB=16
./deploy/deploy-oci.sh compute

# Minimal: 1 OCPU, 4GB RAM (testing)
export OCI_OCPU_COUNT=1
export OCI_MEMORY_GB=4
./deploy/deploy-oci.sh compute
```

### Option 2: OCI Container Instances (Experimental)

```bash
# Deploy as managed container
./deploy/deploy-oci.sh container

# Status: Under development (placeholder only)
```

### Option 3: OCI Kubernetes (Enterprise - Experimental)

```bash
# Deploy to OKE cluster
./deploy/deploy-oci.sh kubernetes

# Status: Under development (placeholder only)
# Requires: Existing OKE cluster + kubectl configured
```

---

## Environment Configuration

### 1. OCI Settings

Create or edit `.env.example` in project root:

```env
# OCI Configuration
OCI_REGION=us-phoenix-1                    # Region for deployment
OCI_COMPARTMENT_ID=ocid1.compartment...    # Target compartment
OCI_PROFILE=DEFAULT                        # Named profile in ~/.oci/config

# VM Configuration (optional)
OCI_INSTANCE_NAME=optiora-mcp              # Instance display name
OCI_SHAPE=VM.Standard.E4.Flex              # Instance type
OCI_OCPU_COUNT=2                           # CPU cores
OCI_MEMORY_GB=8                            # RAM in GB
```

### 2. Cloud Provider Credentials

Add to `.env` for cost analysis:

```env
# AWS (optional - for cross-cloud analysis)
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret

# Azure (optional)
AZURE_SUBSCRIPTION_ID=your_subscription
AZURE_TENANT_ID=your_tenant
AZURE_CLIENT_ID=your_client
AZURE_CLIENT_SECRET=your_secret

# Google Cloud (optional)
GCP_PROJECT_ID=your_project
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# OCI (required)
OCI_CONFIG_PROFILE=DEFAULT
```

### 3. GenAI (Optional)

For AI-powered cost recommendations:

```env
# Claude AI (Anthropic)
ANTHROPIC_API_KEY=your_anthropic_key

# OpenAI (alternative)
OPENAI_API_KEY=your_openai_key
```

---

## Deployment Commands

### Deploy

```bash
# Dry-run (preview without creating resources)
DRY_RUN=true ./deploy/deploy-oci.sh compute

# Standard deployment
./deploy/deploy-oci.sh compute

# Custom region
OCI_REGION=eu-frankfurt-1 ./deploy/deploy-oci.sh compute
```

### Status & Logs

```bash
# Check deployment status
./deploy/deploy-oci.sh status

# Output shows:
# Instance ID: ocid1.instance.oc1...
# Public IP: 130.61.xxx.xxx
# Services: Running / Stopped

# View deployment logs
./deploy/deploy-oci.sh logs

# SSH into instance (requires public IP)
ssh opc@130.61.xxx.xxx
```

### Maintenance

```bash
# Stop instance (keeps disks/data)
./deploy/deploy-oci.sh stop

# Start instance
./deploy/deploy-oci.sh start

# Restart instance
./deploy/deploy-oci.sh restart

# Destroy deployment (removes everything)
./deploy/deploy-oci.sh destroy
```

---

## Post-Deployment

### 1. Access the Dashboard

After deployment, you'll receive a public IP:

```
Instance IP: 130.61.xxx.xxx

Dashboard:     http://130.61.xxx.xxx:3000
MCP API:       http://130.61.xxx.xxx:8000
Health Check:  http://130.61.xxx.xxx:8000/health
```

### 2. Configure Credentials

1. Open dashboard: `http://<instance-ip>:3000`
2. Go to Settings → Cloud Credentials
3. Add your cloud provider credentials:
   - AWS access keys
   - Azure service principal
   - GCP service account
   - OCI user credentials
4. Click "Validate" to test

### 3. Approve Scanning

1. Go to Settings → Approval
2. Review and approve the scanning workflow:
   - Scan frequency (hourly, daily, weekly)
   - Auto-remediate settings
   - Notification email
3. Click "Approve & Start Scanning"

### 4. Setup Monitoring

```bash
# SSH into instance
ssh opc@130.61.xxx.xxx

# Check service status
sudo systemctl status optiora-mcp
sudo systemctl status optiora-dashboard

# View logs
sudo tail -f /var/log/optiora-mcp.log
sudo tail -f /var/log/optiora-dashboard.log
```

---

## Troubleshooting

### Deployment Failed

**Error:** `Deploy script exits with error`

```bash
# Check prerequisites
oci --version          # Should be 3.0+
oci setup config       # Re-run if missing

# Check compartment ID
echo $OCI_COMPARTMENT_ID   # Must be set

# Run with debug output
DRY_RUN=true ./deploy/deploy-oci.sh compute
```

### Instance Created but Services Won't Start

**SSH into instance and check:**

```bash
ssh opc@130.61.xxx.xxx

# Check if services exist
sudo systemctl list-unit-files | grep optiora

# Check service logs
sudo journalctl -u optiora-mcp -n 50
sudo journalctl -u optiora-dashboard -n 50

# Restart services
sudo systemctl restart optiora-mcp
sudo systemctl restart optiora-dashboard
```

### Dashboard Returns 404

**Check MCP server is running:**

```bash
curl http://<instance-ip>:8000/health

# If not responding:
ssh opc@130.61.xxx.xxx
sudo systemctl restart optiora-mcp
```

### Credentials Won't Validate

**Problem:** Cannot connect to AWS/Azure/GCP

1. Verify credentials are correct in dashboard UI
2. Check cloud provider IAM permissions (need read-only access to costs)
3. Check firewall/security group allows outbound connections
4. On instance: `curl https://api.aws.amazon.com` (test connectivity)

### Can't SSH into Instance

**Check security group:**

```bash
# On your laptop
oci compute instance list --compartment-id $OCI_COMPARTMENT_ID

# Note the instance ID, then check security group:
oci network security-group list --compartment-id $OCI_COMPARTMENT_ID
```

**Open SSH port (port 22):**

```bash
oci network security-group-rules create \
  --security-group-id <sg-id> \
  --protocol 6 \
  --source 0.0.0.0/0 \
  --source-port-range 22 \
  --destination-port-range 22 \
  --is-stateless false
```

---

## Cost Optimization

### Always-Free Tier Eligibility

OptiOra fits within OCI's always-free tier:

- **Compute:** 2 Ampere A1 cores (2 OCPUs), 12 GB RAM ✅
- **Database:** 20 GB Autonomous Database (Lite) ✅
- **Storage:** 10 GB Object Storage ✅

**Monthly cost:** Free (if using always-free eligible configuration)

### Performance Tier

For production workloads:

- **Instance:** VM.Standard.E4.Flex @ $0.05/OCPU-hr
  - 2 OCPUs @$0.05/hr = $36/month
  - 8GB RAM included
- **Database:** OCI MySQL (always-free) = Free
- **Storage:** Pay per GB ($0.0255/GB/month)

**Estimated:** $50-100/month

### Cost Monitoring

On the deployed instance:

```bash
# Set up cost alerts
# Dashboard → Settings → Cost Alerts → Enable

# Or via CLI
oci budgets budget create \
  --compartment-id $OCI_COMPARTMENT_ID \
  --target-compartment-id $OCI_COMPARTMENT_ID \
  --display-name "OptiOra Budget" \
  --amount 100 \
  --reset-period MONTHLY
```

---

## Security & Compliance

### Network Isolation

- Instance in private subnet (optional)
- Security group restricts inbound traffic
- API Gateway provides SSL termination

### Data Protection

- Credentials encrypted in database
- No credentials in logs
- HTTPS enforced for all connections

### Audit Trail

- All actions logged in `/var/log/optiora-*.log`
- OCI CloudTrail captures all API calls
- Adjust retention: `sudo logrotate -f /etc/logrotate.d/optiora`

### Backup & Disaster Recovery

```bash
# Backup instance
oci bv boot-volume backup create \
  --boot-volume-id <volume-id> \
  --display-name "optiora-backup-$(date +%Y%m%d)"

# Restore from backup
oci bv boot-volume create \
  --boot-volume-backup-id <backup-id> \
  --availability-domain <ad> \
  --display-name "optiora-restored"
```

---

## Next Steps

1. **Deploy** - Run the deployment command above
2. **Configure** - Add cloud credentials in dashboard
3. **Approve** - Enable scanning workflow
4. **Monitor** - Check dashboard for cost insights
5. **Optimize** - Follow recommendations to reduce spend

For detailed architecture and design, see [ARCHITECTURE_COMPLETE.md](./ARCHITECTURE_COMPLETE.md)

For testing procedures, see [TESTING.md](./TESTING.md)

---

**Questions?** Check [README.md](./README.md) for overview or file an issue on GitHub.
