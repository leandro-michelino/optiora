# **OptiOra** — Multi-Cloud Cost Automation MCP

A monetized **Model Context Protocol (MCP) server** for cloud cost optimization, anomaly detection, and automated cost-saving actions across **AWS, Azure, GCP, and OCI**.

**Deployed on OCI** infrastructure for cost-effective, enterprise-grade self-hosting.

⚠️ **Key clarification:** OptiOra provides **unified FinOps analytics for AWS, Azure, GCP, and OCI** via a single MCP interface and React dashboard. OCI also serves as the hosting infrastructure.

## 🎯 Business Model

**Pricing tiers:**
- **Starter:** $499/mo (single cloud, basic reporting)
- **Professional:** $1,499/mo (multi-cloud, cost recommendations)
- **Enterprise:** $5,000+/mo (automation, custom policies, dedicated support)

**Revenue multiplier:** 15% of annual savings (after optimization recommendations implemented)

## 📊 Key Features

### Cost Monitoring
- Real-time cost tracking across **AWS, Azure, GCP, and OCI**
- Anomaly detection (sudden cost spikes, usage patterns)
- Trend analysis and forecasting

### Optimization Engine
- Identify idle/underutilized resources
- Reserved instance recommendations
- Spot instance optimization
- Storage tier optimization
- Network cost reduction

### Automated Actions
- Create cost optimization tickets
- Post findings to Slack/Teams
- Execute pre-approved savings (auto-tagging, scheduling)
- Generate compliance reports

## 🏗️ Architecture

**OptiOra is deployed on OCI infrastructure** but provides unified cost analytics for all clouds.

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Dashboard                           │
│                    (React + Next.js/Vite)                       │
│         Multi-Cloud FinOps: AWS + Azure + GCP + OCI             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ OptiOra MCP Server (Hosted on OCI)                              │
│                                                                  │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────┐    │
│  │ AWS Cost     │  │ Azure Cost     │  │ GCP Billing     │    │
│  │ Explorer API │  │ Management API │  │ API             │    │
│  └──────────────┘  └────────────────┘  └─────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Core Processing (Python + ML)                           │  │
│  │ • Anomaly Detection                                     │  │
│  │ • Recommendations Engine                               │  │
│  │ • Cost Action Execution                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ OCI API Gateway (Authentication + Rate Limiting)        │  │
│  │ MCP Protocol Endpoint (for Claude/ChatGPT)             │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│ OCI Compute  │  │ OCI Database │  │ OCI Object       │
│ Instance     │  │ (PostgreSQL) │  │ Storage          │
│ (Host MCP)   │  │ (Audit logs) │  │ (Backups, data)  │
└──────────────┘  └──────────────┘  └──────────────────┘

Multi-Cloud Cost Connectors → OptiOra MCP (on OCI) → Dashboard (React)
```

### **What runs where:**

| Component | Deployed On | Purpose |
|-----------|-------------|---------|
| **OptiOra MCP Server** | OCI Compute | Multi-cloud cost analysis, anomaly detection, recommendations |
| **React Dashboard** | Vercel/CloudFlare Pages | Multi-cloud cost visualization |
| **Database** | OCI PostgreSQL | Customer data, audit logs, cost snapshots |
| **File Storage** | OCI Object Storage | Historical data, exports, backups |

### **Cloud Support:**
✅ **AWS** — Analyzes costs via Cost Explorer API  
✅ **Azure** — Analyzes costs via Cost Management API  
✅ **GCP** — Analyzes costs via BigQuery Billing API  
✅ **OCI** — Analyzes costs via Usage API + provides infrastructure  

**OptiOra's unique value:** Unified MCP interface for all 4 clouds. OCI serves dual purpose as both infrastructure host and analyzed cloud provider.

## 🔧 Setup

### 1. Clone & Install
```bash
git clone https://github.com/yourname/finops-mcp.git
cd finops-mcp
poetry install
```

### 2. Configure Cloud Credentials

Create a `.env` file:
```
# AWS
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1

# Azure
AZURE_SUBSCRIPTION_ID=your_subscription
AZURE_TENANT_ID=your_tenant
AZURE_CLIENT_ID=your_client
AZURE_CLIENT_SECRET=your_secret

# GCP
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# MCP Configuration
MCP_PORT=8000
MCP_LOG_LEVEL=INFO
```

### 3. Run the Server
```bash
poetry run finops-mcp
```

## � Dashboard (Frontend)

**Tech Stack Recommendation: React + Next.js**

| Aspect | Choice | Why |
|--------|--------|-----|
| **Framework** | React 18 | Industry standard, large ecosystem |
| **Meta-framework** | Next.js | Built-in API routes, SSR, easy deployment |
| **Styling** | Tailwind CSS | Rapid UI development, low bundle size |
| **Charts** | Recharts or Apache ECharts | React-native, interactive cost visualizations |
| **State Management** | TanStack Query (React Query) | Efficient data fetching from MCP backend |
| **Deployment** | Vercel or CloudFlare Pages | Global CDN, auto-scaling, free tier |

### Dashboard Features

**Multi-Cloud Cost Consolidation:**
- Unified cost dashboard (AWS + Azure + GCP costs in one place)
- Cost trends & forecasting
- Anomaly alerts (red flags for unusual spend)

**Optimization Recommendations:**
- Cost-saving opportunities ranked by impact
- ROI calculator (payback period for each recommendation)
- One-click execution (send to MCP backend)

**Audit & Compliance:**
- Cost breakdown by team/department
- Historical reports (PDF export)
- Compliance tags & chargeback allocation

**Integrations:**
- Slack notifications for anomalies
- Jira ticket creation for cost actions
- Webhooks for custom workflows

### Deployment

**Option 1: Vercel (Recommended for MVP)**
```bash
# Deploy Next.js frontend to Vercel
npm run build
vercel deploy
```
- Cost: Free tier includes generous limits
- URL: `https://optiora.vercel.app`

**Option 2: CloudFlare Pages**
```bash
# Deploy static React build
wrangler pages deploy build/
```
- Cost: Completely free
- Auto-scales globally

> **📘 Full Dashboard Guide:** See [DASHBOARD.md](DASHBOARD.md) for complete frontend architecture with code examples

---

## �🛠️ MCP Tools (Backend)

OptiOra exposes 6 core tools for multi-cloud cost management via MCP protocol:

### **get_cost_summary**
Returns total spend, top cost drivers, trends across AWS, Azure, GCP.

**Params:** `period` (day/week/month), `cloud_provider` (aws/azure/gcp/all), `filters`

### **detect_cost_anomalies**
Identifies unusual cost patterns (spikes, sudden increases).

**Params:** `window_days` (default: 30), `sensitivity` (1-10), `cloud_provider`

### **get_optimization_recommendations**
Suggests cost-saving actions with ROI estimates.

**Params:** `cloud_provider`, `min_savings_usd`, `recommendation_type` (reserved-instances/spot/idle-resources/storage)

### **execute_cost_action**
Applies cost optimizations (auto-tagging, scheduling, scaling).

**Params:** `action_type`, `resource_ids`, `dry_run` (default: true)

### **get_cost_forecast**
Predicts next 3/6/12-month spend based on historical data.

**Params:** `months`, `adjust_for_growth` (percentage)

### **create_cost_ticket**
Creates ticket in Jira/Azure DevOps with recommendations.

**Params:** `title`, `description`, `estimated_savings`, `priority`

## 💰 Monetization Checklist

- [ ] Authentication layer (API keys per customer)
- [ ] Multi-tenant support
- [ ] Usage metering (API calls, savings tracked)
- [ ] Webhook integrations (Slack, Teams, webhooks)
- [ ] Audit logging (compliance, SLA tracking)
- [ ] Premium features (forecasting, automation, custom policies)
- [ ] Upsell: % of savings tier above fixed price
- [ ] Partner program (consultancies, platforms)

## 🚀 Deployment

### OCI-Native Deployment (Recommended)

**1. Deploy to OCI Functions (Serverless)**
```bash
# Setup OCI CLI
oci setup config

# Deploy via OCI Functions
fn deploy --app optiora-prod
```

**Pricing:** $0.0000002 per invocation + minimal function execution time
- Ideal for: Event-driven anomaly detection, scheduled cost analysis

**2. Deploy to OCI Compute (Always-On)**
```bash
# Launch OCI Compute Instance (VM)
# Run Docker container with code
docker run -p 8000:8000 --env-file .env optiora-mcp
```

**Pricing:** $0.055/hour (VM.Standard.E4.Flex 1 OCPU)
- Ideal for: Real-time WebSocket support, high-frequency polling

**3. Production Setup (Recommended)**
```bash
# OCI Compute Instance (CPU + Memory)
# OCI PostgreSQL (audit logs, customer data) — $0.15/hour
# OCI Object Storage (historical data) — $0.0255/GB/month
# OCI API Gateway (auth + throttling)
# OCI Monitoring (logs, alerts)
```

### Cost Comparison

| Component | Cost | Notes |
|-----------|------|-------|
| **OCI Compute** | $0.055/hour ($40/mo) | Single VM instance |
| **OCI PostgreSQL** | $0.15/hour ($110/mo) | DB.Standard.E4.OCPU |
| **OCI Object Storage** | ~$10/mo | 1 GB historical data |
| **OCI Monitoring** | Free | Included tier |
| **API Gateway** | Pay-per-request | ~$0.01 per 10K requests |
| **Total (OCI)** | **~$160/mo** | All-inclusive multi-cloud |

**vs AWS (same setup):**
- ECS Fargate: $50/mo
- RDS PostgreSQL: $200+/mo
- S3: $10/mo
- CloudWatch: $0–50/mo
- **Total (AWS): ~$310–360/mo**

**💰 OCI is 50% cheaper + integrated billing + native Oracle support**

### Single-tenant (self-hosted):
```bash
docker build -t optiora .
docker run -p 8000:8000 --env-file .env optiora
```

### Multi-tenant SaaS (OCI):
- OCI Compute Clusters (auto-scaling)
- OCI PostgreSQL (multi-schema isolation)
- OCI Object Storage (per-customer folders)
- OCI API Gateway (customer API keys)

## 🔐 Security Considerations

- **Credential rotation:** Cloud credentials rotated weekly
- **Least privilege IAM:** Read-only access to cost APIs + limited action execution
- **Audit trail:** All cost queries, recommendations, actions logged
- **Rate limiting:** Per-customer API quotas
- **Encryption:** TLS for all data in transit; encrypted at rest

## 📈 Go-to-Market

1. **Phase 1:** Launch to VC fund portfolios (free trials for fast GTM)
2. **Phase 2:** Reach out to managed service providers (MSPs) — they resell FinOps services
3. **Phase 3:** GCP/AWS marketplace listings (30% take-rate)
4. **Phase 4:** Partner with cloud optimization consultancies

## 📝 Roadmap

- [ ] v0.1: AWS-only MVP (anomalies + basic recommendations)
- [ ] v0.2: Azure + GCP support
- [ ] v0.3: Automation action execution
- [ ] v0.4: Multi-tenant SaaS platform
- [ ] v0.5: Advanced ML forecasting + custom policies

## 📞 Support & Contributing

See CONTRIBUTING.md

## License

MIT
