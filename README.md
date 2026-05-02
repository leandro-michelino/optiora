# OptiOra

Multi-cloud FinOps platform with a FastAPI backend, a Next.js dashboard, and an OCI deployment path.

## Dashboard Preview

![OptiOra animated dashboard](dashboard/public/optiora-animated.svg)

The dashboard is the main workspace for:

- multi-cloud cost visibility across AWS, Azure, GCP, and OCI
- provider onboarding, CSV billing upload, and scan readiness checks
- anomaly detection and optimization recommendations
- forecasting with deterministic scenarios, fan percentiles, downside risk, model diagnostics, diagnostics views, and budget guardrails
- deeper FinOps analytics such as unit economics, scorecards, tagging coverage, sustainability, cross-provider comparison, anomaly intelligence, and chargeback/showback
- resource inventory, Kubernetes cost allocation, virtual tagging, and rightsizing workflows
- OCI GenAI-assisted narratives, hybrid advisory flows, and copilot bundles

## What the platform actually does

OptiOra keeps cost math deterministic and inspectable. Forecast values, savings math, breach probability, and efficiency scores are computed by the analytics layer first. OCI Generative AI is then used to explain findings, prioritise actions, adapt language for different stakeholders, and provide advisory packs.

## Repository Layout

- `finops_mcp/` > FastAPI backend, analytics, auth, imports, provider integrations
- `dashboard/` > Next.js dashboard UI
- `ansible/` > host provisioning and runtime configuration
- `deploy/deploy-oci.sh` > laptop-driven OCI deployment entrypoint
- `terraform/` > OCI network baseline, cost archive bucket, and optional Resource Scheduler
- `ARCHITECTURE.md` > authoritative ASCII architecture and processing flows
- `DEPLOYMENT.md` > deployment runbook
- `DATA_POLICY.md` > data usage and GenAI scope guidance

## Runtime Architecture

```text
Users
  |
  v
Next.js dashboard
  |
  v
FastAPI backend
  |
  +--> SQLite or PostgreSQL
  +--> Cloud provider APIs
  +--> OCI Generative AI
```

## Textual Diagram - Final Architecture

The dashboard is the presentation layer. The FastAPI backend is the control plane and system of record for cost ingestion, forecasting, analytics, rightsizing, alerts, exports, and business mapping. Cost data arrives from live cloud-provider APIs or imported CSV files. Deterministic analytics in `finops_mcp/tools/finops_analytics.py` calculate spend, risk, savings, efficiency, and forecast outcomes. OCI Generative AI is then used for narratives such as executive summaries, anomaly explanations, roadmap generation, tagging strategy, sustainability commentary, chargeback summaries, and multi-cloud comparison briefs.

## Main capability groups

### Forecasting

- deterministic baseline forecasting
- p10 / p50 / p90 / p95 fan percentiles
- CVaR downside risk
- budget guardrails and breach probability
- what-if simulation with phased actions, ROI, and payback
- deterministic stress testing for demand, price, and execution shocks
- champion/challenger model diagnostics with data quality, drift flags, and wMAPE
- forecast diagnostics with budget burn-rate, sensitivity analysis, and action recommendations

### FinOps analytics

- base analytics and risk scoring
- cost attribution and concentration analysis
- commitment optimization and commitment-gap analysis
- waste decomposition and efficiency scoring
- unit economics
- maturity assessment
- tagging coverage analytics
- sustainability metrics
- cross-provider comparison
- anomaly intelligence
- chargeback and showback summaries
- optimization portfolio ranking

### GenAI beyond forecasting

OptiOra uses OCI GenAI not only for forecast narration, but also for:

- spend narratives
- anomaly explanation and alert triage
- optimization briefs and 30/60/90-day roadmaps
- maturity narratives
- budget-risk summaries
- commitment strategy briefs
- tagging enforcement strategy
- sustainability and ESG commentary
- chargeback / showback reporting language
- cross-provider comparison briefs
- rightsizing ROI briefs
- vendor negotiation talking points
- forecast model-risk explanations
- weekly FinOps operating review narratives
- MSP/customer portfolio summaries and next-best-action prompts

## Key Behavior

- `.env` is loaded automatically when the backend starts
- authentication and RBAC are optional and disabled by default unless explicitly enabled
- when auth is disabled, public workspace flows remain available for local demos and PoCs
- CSV imports are UTF-8 only and limited to 10 MB
- OptiOra prefers live provider data when available and falls back to imported CSV where needed
- provider diagnostics expose readiness without exposing secrets
- dashboard views indicate whether data is live, imported, partial, or fallback
- OCI GenAI is optional; prompt-only fallback remains supported when it is not configured
- OCI credential file paths are resolved on the backend host (not in the browser)
- OCI profile names should be entered without brackets (use `JNB`, not `[JNB]`)
- for OCI test workflows, the dashboard can upload an OCI config/key file pair to the API host and use those server paths for validation
- `OCI_GENAI_COMPARTMENT_ID` overrides `OCI_COMPARTMENT_OCID` for GenAI calls when the model lives in a separate compartment
- OCI managed database services should use `BYOL` license model by default when that option is available
- optional data retention archives cold cost rows to OCI Object Storage before purging them from the database

## OpenCost Quick Start

Use OpenCost when you want real Kubernetes namespace and pod cost allocation instead of modeled splits.

1. Install OpenCost in the target Kubernetes cluster (or use `POST /api/v1/analytics/kubernetes/opencost/auto-install`).
2. In the Kubernetes dashboard page, set OpenCost URL and click **Sync OpenCost**.
3. If OpenCost runs on the same VM as OptiOra API, use `http://localhost:9003`.
4. If OpenCost runs elsewhere, use a URL reachable from the OptiOra API host, such as `http://<host-or-lb>:9003`.

Important: `localhost` is resolved on the OptiOra API server, not your browser machine.

## Core API Surface

### Core platform

- `GET /health`
- `GET /api/v1/info`
- `GET /api/v1/provider-diagnostics`
- `POST /api/v1/credentials/validate`
- `POST /api/v1/credentials/add`
- `POST /api/v1/credentials/oci/upload-files` (test-only OCI config/key upload to backend host)
- `GET /api/v1/credentials`
- `DELETE /api/v1/credentials/{provider}`
- `POST /api/v1/imports/costs/preview`
- `POST /api/v1/imports/costs/csv`
- `GET /api/v1/imports/costs/summary`

### Forecasting and analytics

- `GET /api/v1/forecast`
- `POST /api/v1/forecast/what-if`
- `POST /api/v1/forecast/stress-test`
- `GET /api/v1/forecast/model-diagnostics`
- `GET /api/v1/analytics/forecast-diagnostics`
- `GET /api/v1/analytics`
- `GET /api/v1/analytics/attribution`
- `GET /api/v1/analytics/commitment-optimization`
- `GET /api/v1/analytics/maturity`
- `GET /api/v1/analytics/unit-economics`
- `GET /api/v1/analytics/cloud-waste`
- `GET /api/v1/analytics/efficiency-score`
- `GET /api/v1/analytics/commitment-gap`
- `GET /api/v1/analytics/optimization-portfolio`
- `GET /api/v1/analytics/tagging-coverage`
- `GET /api/v1/analytics/sustainability`
- `GET /api/v1/analytics/cross-provider-comparison`
- `GET /api/v1/analytics/anomaly-intelligence`
- `GET /api/v1/analytics/chargeback-summary`
- `GET /api/v1/analytics/scorecards`

### Operations and optimization

- `GET /api/v1/inventory/resources`
- `GET /api/v1/analytics/kubernetes/summary`
- `GET /api/v1/analytics/kubernetes/provider-catalog`
- `POST /api/v1/analytics/kubernetes/cluster-cost`
- `POST /api/v1/analytics/kubernetes/opencost/sync`
- `POST /api/v1/analytics/kubernetes/opencost/auto-install`
- `GET /api/v1/virtual-tags/rules`
- `POST /api/v1/virtual-tags/rules`
- `PUT /api/v1/virtual-tags/rules/{rule_id}`
- `DELETE /api/v1/virtual-tags/rules/{rule_id}`
- `GET /api/v1/virtual-tags/preview`
- `GET /api/v1/recommendations/rightsizing`
- `GET /api/v1/advisor/hybrid`
- `POST /api/v1/genai/analyze` (`spend`, `anomaly`, `optimization`, `maturity`, `budget_risk`, `waste_insights`, `optimization_roadmap`, `executive_narrative`, `commitment_strategy`, `tagging_strategy`, `sustainability_narrative`, `chargeback_narrative`, `cross_provider_comparison_brief`, `alert_triage`, `rightsizing_brief`, `vendor_negotiation_brief`, `forecast_model_diagnostics`, `finops_operating_review`)
- `POST /api/v1/genai/copilot-pack`

### Accounts, alerts, reporting, exports

- `GET /api/v1/provider-accounts/rollups`
- `GET /api/v1/provider-accounts`
- `GET /api/v1/provider-accounts/{id}/region-breakdown`
- `GET /api/v1/partner/customer-portfolio`
- `GET /api/v1/alerts`
- `GET /api/v1/alerts/executive-summary`
- `GET /api/v1/alerts/ops-policy`
- `PUT /api/v1/alerts/ops-policy`
- `POST /api/v1/alerts/{alert_id}/acknowledge`
- `POST /api/v1/alerts/{alert_id}/dismiss`
- `POST /api/v1/alerts/{alert_id}/reactivate`
- `GET /api/v1/audit-logs`
- `PATCH /api/v1/scanning/scheduler/policy`
- `GET /api/v1/admin/diagnostics`
- `GET /api/v1/reports/executive-summary.csv`
- `GET /api/v1/reports/executive-summary.xls`
- `GET /api/v1/reports/executive-summary.xlsx`
- `GET /api/v1/reports/executive-digest.pdf`
- `GET /api/v1/exports/focus.csv`
- `GET /api/v1/exports/focus.json`

## Local Development

Supported Python for backend setup: `3.10` through `3.13`

### Local bootstrap

```bash
./setup.sh

# With cleanup + quick validation:
./setup.sh --clean --verify

# Manual equivalent:
python3.13 -m venv .venv
source .venv/bin/activate
pip install -e .
pip install "pytest>=9,<10" "ruff>=0.1,<0.2" "mypy>=1.5,<2" "black>=23,<24"

cd dashboard
npm install
cd ..

terraform -chdir=terraform init
terraform -chdir=terraform validate
```

`scripts/bootstrap-local.sh` is kept as a compatibility wrapper and delegates to `./setup.sh`.

Generate dashboard client from OpenAPI:

```bash
cd dashboard
npm run generate-api-client
```

### Backend

```bash
python3.13 -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
optiora
```

Backend default: `http://localhost:8000`

### Dashboard

```bash
cd dashboard
npm install
npm run dev
```

Dashboard default: `http://localhost:3000`

## OCI Deployment

Recommended guided path:

```bash
./deploy/deploy-oci.sh menu
```

Alternative operations:

```bash
./deploy/deploy-oci.sh full
./deploy/deploy-oci.sh compute
./deploy/deploy-oci.sh status
./deploy/deploy-oci.sh verify
```

Primary OCI region for hosting and GenAI inference: `uk-london-1`

## Verification

```bash
python3 -m py_compile $(find ./finops_* -name '*.py')
.venv/bin/python -m pytest -q
./scripts/check-animated-svg-routes.sh

cd dashboard
npm run type-check
npm run lint
npm run build
npm run test:e2e

terraform -chdir=../terraform validate
```

## Workspace Cleanup

```bash
./scripts/cleanup-workspace.sh
```

This removes redundant duplicate-copy artifacts (for example `* (1).*`) and local cache directories while keeping `.git`, virtualenvs, `dashboard/node_modules`, and `dashboard/.next` untouched.

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Deployment](DEPLOYMENT.md)
- [Testing](TESTING.md)
- [Terraform](terraform/README.md)
- [Ansible](ansible/README.md)
- [Roadmap](ROADMAP.md)
- [Next Phase](NEXT_PHASE.md)
- [Data Policy](DATA_POLICY.md)

## License

MIT
