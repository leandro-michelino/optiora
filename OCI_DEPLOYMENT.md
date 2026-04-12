# OptiOra — OCI Deployment Guide

## Why OCI for Multi-Cloud Cost Management?

OptiOra is **deployed on OCI** and manages costs across **AWS, Azure, GCP, and OCI** simultaneously.

### Strategic Advantages

| Advantage | Benefit |
|-----------|---------|
| **50% lower compute costs** | $40–110/mo vs AWS $200–300/mo |
| **Unified Oracle ecosystem** | Easy integration with Oracle Database, Exadata, MySQL |
| **Native multi-cloud APIs** | OCI SDKs handle all cloud providers |
| **Single billing dashboard** | Manage costs + OptiOra subscription in one place |
| **No vendor lock-in** | Customers can migrate costs analysis, data stays with OCI |
| **Enterprise compliance** | SOC2, ISO, FedRAMP ready |

---

## Deployment Options

### Option 1: **OCI Functions (Serverless, Recommended for MVP)**

**Best for:** Event-driven, scheduled cost analysis, cost-conscious startups

```bash
# 1. Setup OCI CLI
oci setup config

# 2. Create OCI Function application
oci fn application create \
  --display-name optiora-app \
  --compartment-id $OCI_COMPARTMENT_ID

# 3. Deploy function
fn --config /path/to/config/fn.yaml \
   --region us-phoenix-1 \
   deploy --app optiora-app

# 4. Invoke function
oci fn function invoke \
  --function-id $OCI_FUNCTION_OCID \
  --body '{}'
```

**Pricing:**
- **$0.0000002 per invocation** (200,000 free/month)
- **$0.0000041 per GB-second** execution
- Example: 1M cost analyses/month = $0.20 + execution costs

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
