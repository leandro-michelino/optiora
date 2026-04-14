# OptiOra
## Multi-Cloud FinOps Optimization Platform

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)](https://www.python.org)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)

**OptiOra** is a Model Context Protocol (MCP) server that provides unified cloud cost optimization across **AWS, Azure, GCP, and OCI**. It detects cost anomalies, generates ROI-ranked recommendations, and executes automated cost-saving actions.

🚀 **Deployed on OCI Infrastructure** | 📊 **React Dashboard** | 🔌 **MCP Protocol** | 💰 **Multi-Cloud Support**

---

⚠️ **IMPORTANT: OCI-Only Deployment**

**OptiOra is deployed exclusively on Oracle Cloud Infrastructure (OCI).**

- ✅ **Production**: OCI (required)
- ✅ **Staging**: OCI (recommended)
- ❌ **Local/Docker**: Not supported (OCI-only model)

→ See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete setup

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [🚀 DEPLOYMENT.md](./DEPLOYMENT.md) | Complete OCI deployment guide |
| [🏗️ ARCHITECTURE_COMPLETE.md](./ARCHITECTURE_COMPLETE.md) | OCI infrastructure & system design |
| [💻 DASHBOARD.md](./DASHBOARD.md) | Frontend dashboard components & features |
| [🔐 CREDENTIAL_MANAGEMENT.md](./CREDENTIAL_MANAGEMENT.md) | Secure credential handling & encryption |
| [💵 COST_ESTIMATE.md](./COST_ESTIMATE.md) | Deployment costs & ROI analysis |
| [🧪 TESTING.md](./TESTING.md) | Running & writing tests |

---

## Key Features

### 📊 Multi-Cloud Cost Monitoring
- **Real-time visibility** across AWS, Azure, GCP, and OCI
- **Automatic cost aggregation** and normalization
- **Trend analysis** and forecasting
- **Historical tracking** with audit logs

### 🚨 Anomaly Detection
- **Statistical analysis** of cost patterns
- **Configurable sensitivity** levels
- **Confidence scoring** for accuracy
- **Alert channels**: Slack, Teams, email

### 💡 AI-Powered Recommendations
- **ROI-ranked suggestions** (highest savings first)
- **Difficulty scoring** (easy, medium, hard)
- **Multi-type recommendations**:
  - Reserved Instances (30-70% savings)
  - Spot Instances (up to 90% savings)
  - Idle resource cleanup
  - Storage optimization
  - Network optimization

### ⚡ Automated Actions
- **Cost action execution**: auto-tagging, scheduling, cleanup
- **Ticket creation**: Jira, Azure DevOps
- **Audit trail** of all actions
- **Dry-run mode** for safety

### 🎨 Interactive Dashboard

- **shadcn/ui** component system — KPI cards, alerts, progress bars, tables, badges
- **Multi-cloud visualization** with shadcn Charts (built on Recharts)
- **Dark mode** support via `next-themes`
- **Responsive design** (mobile-friendly)
- **Real-time updates** via WebSocket (optional)

---

## 🏗️ Architecture at a Glance

```
┌─────────────────────────────────────────────────────┐
│  React Dashboard (Vercel)                           │
│  ├─ Cost Overview       ├─ Anomalies                │
│  ├─ Multi-Cloud Breakdown  ├─ Recommendations      │
│  └─ Settings           └─ Dark Mode                 │
└────────────────┬────────────────────────────────────┘
                 │ HTTPS API
                 ▼
        ┌────────────────────┐
        │  MCP Server(OCI)   │
        ├─ Cost Aggregation │
        ├─ Anomaly Detection│
        ├─ Recommendations  │
        └─ Auto Actions     │
                 │
    ┌────┬─────┬─┴──┬────────┐
    ▼    ▼     ▼    ▼        ▼
   AWS Azure GCP  OCI  PostgreSQL
```

**For details**, see [ARCHITECTURE_COMPLETE.md](./ARCHITECTURE_COMPLETE.md)

---

## 🚀 Getting Started (5 Minutes)

### Prerequisites
- OCI account with CLI (v3.0+) configured
- Cloud credentials (AWS, Azure, GCP, or OCI)

### Deploy to OCI

```bash
# Clone repository
git clone https://github.com/leandro-michelino/optiora.git
cd optiora

# Deploy (fully automated)
export OCI_COMPARTMENT_ID=ocid1.compartment.oc1...
chmod +x deploy/deploy-oci.sh
./deploy/deploy-oci.sh compute

# Deployment complete! Check status:
./deploy/deploy-oci.sh status
```

For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## ✅ Project Status

**Last Updated:** April 12, 2026  
**Status:** Production Ready for OCI Deployment

### Completed

- ✅ **Backend**: Python MCP server with 16 tools (100%)
- ✅ **Frontend**: React dashboard with 8 pages (100%)
- ✅ **Tests**: 33 tests passing (100%)
- ✅ **Documentation**: Consolidated and cleaned
- ✅ **Deployment**: OCI script automated and production-ready
- ✅ **Architecture**: OCI infrastructure defined
- ✅ **CI/CD**: GitHub Actions configured

### Current Implementation

| Component | Status | Details |
|-----------|--------|---------|
| Cost aggregation | ✅ | AWS, Azure, GCP, OCI supported |
| Anomaly detection | ✅ | Statistical analysis + confidence scoring |
| Recommendations | ✅ | ROI-ranked, 12+ suggestion types |
| Dashboard | ✅ | Multi-cloud visualization + dark mode |
| Credentials | ✅ | Encrypted storage with validation |
| Automated actions | ✅ | Cost optimization execution |
| Deployment | ✅ | One-command OCI deployment |

### What's Next

- ⏳ User authentication & multi-tenant support
- ⏳ Advanced ML forecasting (Q3 2026)
- ⏳ Slack/Teams integration
- ⏳ Custom cost rules engine

---

## 📚 MCP Tools

The server exposes 6 standardized MCP tools:

| Tool | Input | Output |
|------|-------|--------|
| `get_cost_summary` | period, cloud_provider, filters | Total cost, trends, top services |
| `detect_cost_anomalies` | sensitivity, providers | List of anomalies with confidence |
| `get_recommendations` | min_savings, difficulty | Ranked cost optimization suggestions |
| `forecast_costs` | period, growth_factor | Projected costs (3-12 months) |
| `execute_action` | action_type, resource_id, params | Execution status, audit trail |
| `create_ticket` | title, description, priority | Ticket ID, tracking link |

**Usage Example:**

```python
# Using MCP client (LLM like Claude)
response = mcp_client.call_tool(
    "get_cost_summary",
    period="month",
    cloud_provider="aws",
    filters={"environment": "production"}
)
# Returns: {"total_cost_usd": 12450.50, "top_services": [...]}
```

---

## 💻 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + Next.js 14 + Tailwind CSS |
| **Visualizations** | Recharts 3 + dark mode (next-themes) |
| **Backend** | Python 3.14 + MCP 0.4 |
| **Cloud SDKs** | boto3, azure-identity, google-cloud, oci |
| **Database** | PostgreSQL 15+ (OCI hosted) |
| **Hosting** | OCI Compute (backend) + Vercel (frontend) |
| **Containers** | Docker + Docker Compose |
| **CI/CD** | GitHub Actions |
| **Testing** | pytest (33 tests, all passing) |

---

## 📊 Test Coverage

```
test_aws_integration.py        ✓ 4 tests
test_azure_gcp.py              ✓ 12 tests
test_anomaly_recommendations   ✓ 6 tests
test_oci_database.py           ✓ 7 tests
test_tools.py                  ✓ 4 tests
────────────────────────────────────────
TOTAL:                         ✓ 33 tests passing
```

Run tests: `pytest tests/ -v`

---

## 🚀 Deployment

**OptiOra is OCI-only.** Deploy with one command:

```bash
./deploy/deploy-oci.sh compute
# See DEPLOYMENT.md for detailed setup
```

For complete deployment guide, costs, troubleshooting, and scaling, see [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## 💰 Business Model

**OptiOra operates on a freemium model:**

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | Single cloud, basic reporting |
| **Professional** | $1,499/mo | Multi-cloud, recommendations, API access |
| **Enterprise** | $5,000+/mo | Automation, custom policies, dedicated support |
| **Revenue Multiplier** | 15% of annual savings | After recommendations implemented |

---

## 📈 Roadmap

### Q2 2026
- ✅ Multi-cloud cost aggregation (AWS, Azure, GCP, OCI)
- ✅ Anomaly detection engine
- ✅ Recommendation system
- ✅ React dashboard
- ⏳ User authentication

### Q3 2026
- Advanced ML forecasting
- FinOps team collaboration features
- Slack/Teams bot integration
- Unit cost analysis

### Q4 2026
- Machine learning-based anomaly detection
- Multi-tenant billing platform
- Custom recommendation rules
- Datadog/PagerDuty integration

---

## 💼 Enterprise Access

OptiOra is a **commercial SaaS platform**. Organizations interested in using OptiOra should:
- 📧 Contact us for pricing and deployment
- 🏢 Enterprise support available
- 🔒 Self-hosted OCI deployment option

---

## 📄 License

OptiOra is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

## 🔗 Resources

- 📖 **[Setup Guide](./SETUP.md)** — Installation & configuration
- 🏗️ **[Architecture](./ARCHITECTURE_COMPLETE.md)** — System design
- 🧪 **[Testing](./TESTING.md)** — How to write & run tests
- 🚀 **[Deployment](./OCI_DEPLOYMENT.md)** — Production setup
- 📊 **[GitHub Repository](https://github.com/leandro-michelino/optiora)**

---

## ❓ Support

- 💬 **Discussion**: Open a [GitHub Discussion](https://github.com/leandro-michelino/optiora/discussions)
- 🐛 **Bug Report**: Create a [GitHub Issue](https://github.com/leandro-michelino/optiora/issues)
- 📧 **Email**: Contact maintainers via GitHub

---

## 🎯 Next Steps

1. **Read**: [Setup.md](./SETUP.md) for installation
2. **Run**: `pytest tests/ -v` to verify tests pass
3. **Explore**: [ARCHITECTURE_COMPLETE.md](./ARCHITECTURE_COMPLETE.md) for system design
4. **Deploy**: Follow [OCI_DEPLOYMENT.md](./OCI_DEPLOYMENT.md) for production

---

**Built with ❤️ for cloud cost optimization**

*OptiOra — Intelligent Cloud Financial Operations*
