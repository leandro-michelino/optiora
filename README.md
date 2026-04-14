# OptiOra

## Multi-Cloud FinOps Optimization Platform

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)](https://www.python.org)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)

**OptiOra** is a Model Context Protocol (MCP) server that provides unified cloud cost
optimization across **AWS, Azure, GCP, and OCI**. It detects cost anomalies, generates
ROI-ranked recommendations, and executes automated cost-saving actions.

Deployed on OCI Infrastructure | React Dashboard | MCP Protocol | Multi-Cloud Support

---

## Dashboard Preview

![OptiOra Dashboard](dashboard/public/dashboard-preview.png)

---

> **OCI-Only Deployment**
>
> OptiOra is deployed exclusively on Oracle Cloud Infrastructure (OCI).
>
> - **Production**: OCI (required)
> - **Staging**: OCI (recommended)
> - **Local/Docker**: Not supported
>
> See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete setup.

---

## Documentation

| Document | Purpose |
| -------- | ------- |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Complete OCI deployment guide |
| [ARCHITECTURE_COMPLETE.md](./ARCHITECTURE_COMPLETE.md) | OCI infrastructure & system design |
| [DASHBOARD.md](./DASHBOARD.md) | Frontend dashboard components & features |
| [CREDENTIAL_MANAGEMENT.md](./CREDENTIAL_MANAGEMENT.md) | Secure credential handling & encryption |
| [COST_ESTIMATE.md](./COST_ESTIMATE.md) | Deployment costs & ROI analysis |
| [TESTING.md](./TESTING.md) | Testing strategy & coverage targets |
| [ROADMAP.md](./ROADMAP.md) | Product roadmap |

---

## Key Features

### Multi-Cloud Cost Monitoring

- **Real-time visibility** across AWS, Azure, GCP, and OCI
- **Automatic cost aggregation** and normalization
- **Trend analysis** and forecasting
- **Historical tracking** with audit logs

### Anomaly Detection

- **Statistical analysis** of cost patterns (Z-score based)
- **Configurable sensitivity** levels
- **Confidence scoring** for accuracy
- **Alert channels**: Slack, Teams, email

### AI-Powered Recommendations

- **ROI-ranked suggestions** (highest savings first)
- **Difficulty scoring** (easy, medium, hard)
- **Multi-type recommendations**:
  - Reserved Instances (30–70% savings)
  - Spot Instances (up to 90% savings)
  - Idle resource cleanup
  - Storage optimization
  - Network optimization

### Automated Actions

- **Cost action execution**: auto-tagging, scheduling, cleanup
- **Ticket creation**: Jira, Azure DevOps
- **Audit trail** of all actions
- **Dry-run mode** for safety

### Interactive Dashboard

- **shadcn/ui** component system — KPI cards, alerts, progress bars, tables, badges
- **Multi-cloud visualization** with Recharts (area charts, pie charts)
- **Dark mode** support via `next-themes`
- **Responsive design** (mobile-friendly)
- **Claude AI chat** for natural-language cost analysis

---

## Architecture at a Glance

```text
┌─────────────────────────────────────────────────────┐
│  React Dashboard (OCI hosted)                       │
│  ├─ Cost Overview       ├─ Anomalies                │
│  ├─ Multi-Cloud Costs   ├─ Recommendations          │
│  ├─ AI Insights         ├─ Cost Advisor             │
│  ├─ Forecasting         └─ Settings                 │
└────────────────┬────────────────────────────────────┘
                 │ HTTPS / REST
                 ▼
        ┌────────────────────┐
        │  FastAPI Backend   │  (OCI Compute)
        ├────────────────────┤
        │ auth_routes.py     │  JWT auth
        │ api.py             │  Credential & scan mgmt
        │ server.py          │  MCP protocol handler
        │                    │
        │ Tools:             │
        │ ├─ AWS Costs       │
        │ ├─ Azure Costs     │
        │ ├─ GCP Costs       │
        │ ├─ OCI Costs       │
        │ ├─ Anomalies       │
        │ ├─ Recommendations │
        │ └─ Actions         │
        └────────┬───────────┘
                 │
    ┌────┬───────┼──────┬────────────┐
    ▼    ▼       ▼      ▼            ▼
   AWS Azure   GCP    OCI      PostgreSQL
```

For full detail, see [ARCHITECTURE_COMPLETE.md](./ARCHITECTURE_COMPLETE.md).

---

## Getting Started (5 Minutes)

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

# Check status
./deploy/deploy-oci.sh status
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

---

## Project Status

Last Updated: April 14, 2026
Status: Active development — backend and frontend feature-complete; auth and test coverage in progress.

### Component Status

| Component | Status | Details |
| --------- | ------ | ------- |
| MCP server | Complete | 6 tools: cost, anomaly, recommendations, forecast, actions, tickets |
| FastAPI REST API | Complete | Credential mgmt, scanning permissions, health |
| User authentication | Complete | Register, login, JWT refresh, logout |
| Password reset | Partial | Request endpoint stubbed; email delivery not implemented |
| Cost aggregation | Complete | AWS, Azure, GCP, OCI supported |
| Anomaly detection | Complete | Statistical analysis + confidence scoring |
| Recommendations | Complete | ROI-ranked, 12+ suggestion types |
| React dashboard | Complete | 10 pages, multi-cloud visualization, dark mode |
| Credential management | Complete | Encrypted storage, per-provider validation |
| Claude AI integration | Complete | 5 analysis functions + prompt caching |
| OCI deployment script | Complete | One-command automated deployment |
| Automated tests | Removed | Removed Apr 14 2026 — see [TESTING.md](./TESTING.md) |
| CI/CD pipeline | Removed | GitHub Actions removed — to be restored |

### Roadmap

- Q2 2026 — Restore test suite and CI/CD pipeline
- Q3 2026 — Multi-tenant support, advanced ML forecasting, Slack/Teams bot
- Q4 2026 — Custom cost rules engine, Datadog/PagerDuty integration

See [ROADMAP.md](./ROADMAP.md) for the full roadmap.

---

## MCP Tools

The server exposes 6 standardized MCP tools:

| Tool | Input | Output |
| ---- | ----- | ------ |
| `get_cost_summary` | period, cloud_provider, filters | Total cost, trends, top services |
| `detect_cost_anomalies` | sensitivity, providers | List of anomalies with confidence |
| `get_recommendations` | min_savings, difficulty | Ranked cost optimization suggestions |
| `forecast_costs` | period, growth_factor | Projected costs (3–12 months) |
| `execute_action` | action_type, resource_id, params | Execution status, audit trail |
| `create_ticket` | title, description, priority | Ticket ID, tracking link |

Usage example:

```python
response = mcp_client.call_tool(
    "get_cost_summary",
    period="month",
    cloud_provider="aws",
    filters={"environment": "production"}
)
# Returns: {"total_cost_usd": 12450.50, "top_services": [...]}
```

---

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| **Frontend** | React 19 + Next.js 16 + Tailwind CSS 4 |
| **UI components** | shadcn/ui + Recharts 3 |
| **AI** | Claude (`claude-3-5-sonnet`) via `@anthropic-ai/sdk` |
| **Backend** | Python 3.10+ + FastAPI 0.100+ |
| **MCP protocol** | `mcp` 0.4 |
| **Cloud SDKs** | boto3, azure-identity, google-cloud-billing, oci |
| **Database** | PostgreSQL (OCI DBaaS) via SQLAlchemy 2 |
| **Auth** | JWT (python-jose) + bcrypt (passlib) |
| **Deployment** | OCI Compute (VM.Standard.E4.Flex) |

---

## Business Model

| Tier | Price | Features |
| ---- | ----- | -------- |
| **Free** | $0 | Single cloud, basic reporting |
| **Professional** | $1,499/mo | Multi-cloud, recommendations, API access |
| **Enterprise** | $5,000+/mo | Automation, custom policies, dedicated support |
| **Revenue share** | 15% of annual savings | After recommendations implemented |

---

## License

OptiOra is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

## Support

- **Bug reports**: [GitHub Issues](https://github.com/leandro-michelino/optiora/issues)
- **Discussions**: [GitHub Discussions](https://github.com/leandro-michelino/optiora/discussions)
- **Email**: Contact maintainers via GitHub

---

OptiOra — Intelligent Cloud Financial Operations
