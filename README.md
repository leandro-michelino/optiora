# OptiOra
## Multi-Cloud FinOps Optimization Platform

[![Tests](https://github.com/leandro-michelino/optiora/actions/workflows/deploy-oci.yml/badge.svg)](https://github.com/leandro-michelino/optiora/actions)
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
- ❌ **Laptop or On-Premises**: Not supported

→ See [OCI_DEPLOYMENT.md](./OCI_DEPLOYMENT.md) for deployment setup

---

📚 **[Browse All Documentation →](./DOCUMENTATION.md)** | Quick links below:

---

## 🎯 Quick Links

| Document | Purpose |
|----------|---------|
| [📖 Setup Guide](./SETUP.md) | OCI deployment guide (one-click setup) |
| [🏗️ Architecture](./ARCHITECTURE_COMPLETE.md) | System design & components |
| [💵 Cost Estimate](./COST_ESTIMATE.md) | Deployment costs & ROI analysis |
| [🧪 Testing Guide](./TESTING.md) | Run & write tests |
| [🚀 Deployment](./OCI_DEPLOYMENT.md) | Production deployment on OCI |
| [🔐 Credentials](./CREDENTIAL_MANAGEMENT.md) | Secure credential system |
| [💰 Business Model](./MONETIZATION.md) | Pricing & revenue strategy |
| [📊 Competitive Analysis](./COMPETITIVE_ANALYSIS.md) | Market positioning vs competitors |
| [🎯 Roadmap](./ROADMAP.md) | Future features & timeline |

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
- **Multi-cloud visualization** with Recharts
- **Dark mode** support
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
- Python 3.10+ 
- Node.js 18+
- Cloud credentials (AWS, Azure, GCP, or OCI)

### Backend Setup

```bash
# Clone and enter directory
git clone https://github.com/leandro-michelino/optiora.git
cd optiora

# Deploy on OCI (see SETUP.md for details)
chmod +x deploy/deploy-oci.sh
./deploy/deploy-oci.sh

# For development references, see:
# - SETUP.md for OCI deployment
# - OCI_DEPLOYMENT.md for infrastructure details

# Run MCP server
python -m finops_mcp.server
# ✓ OptiOra MCP Server listening on port 8000
```

### Frontend Setup

```bash
# In another terminal
cd dashboard
npm install
npm run dev
# ✓ Open http://localhost:3000
```

### Run Tests

```bash
# All tests
pytest tests/ -v
# ✓ 33 passed in 0.XX s
```

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

## 🚀 Deployment Options

### Local Development
```bash
npm run dev      # Frontend on :3000
python -m finops_mcp.server  # Backend on :8000
```

### Docker
```bash
docker-compose up -d
```

### Production (OCI)
```bash
./deploy/deploy-oci.sh compute
# See OCI_DEPLOYMENT.md for details
```

### Vercel (Frontend)
```bash
cd dashboard
vercel
```

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
