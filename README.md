# OptiOra

Current release: `0.9.1` dashboard wiring and repository hygiene.

Multi-cloud FinOps platform with a FastAPI backend, a Next.js dashboard, and an OCI-only production deployment path.

## Dashboard Preview

![OptiOra animated dashboard](dashboard/public/optiora-animated.svg)

## What The Platform Does

- Aggregates cost signals across AWS, Azure, GCP, and OCI.
- Runs deterministic forecasting and analytics for spend, risk, savings, and efficiency.
- Supports operations workflows for scans, alerts, exports, and governance.
- Uses OCI GenAI as an advisory overlay (narrative and prioritization), not as the source of truth for cost math.
- Adds CSV-backed FinOps RAG retrieval for benchmark-guided narratives across forecasting, operations, governance, and commitment strategy.
- Reuses stored live scan snapshots when provider APIs are unavailable, while still refusing synthetic/demo cost data.

## Architecture At A Glance

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
  +--> Cloud provider APIs + stored scan snapshots + CSV imports
  +--> OCI Generative AI (optional)
```

For the full topology and pipeline details, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Delivery Architecture (ASCII)

```text
Local workspace
  |
  +--> setup.sh
  |     +--> Python venv + backend deps
  |     +--> dashboard npm deps
  |     +--> OpenAPI client generation
  |
  +--> tests + build gates
        +--> backend unittest/pytest
        +--> dashboard type-check/lint/build
        +--> terraform validate
```

## Capability Highlights

- Forecasting: baseline forecast, percentiles, downside risk, what-if, stress testing, model diagnostics.
- FinOps analytics: attribution, commitment analysis, waste decomposition, efficiency score, unit economics, scorecards.
- Decision intelligence: scenario-frontier recommendations (stability/balanced/acceleration) with risk-confidence-payback trade-offs.
- Optimization and governance: provider-native recommendations, rightsizing, virtual tags, chargeback/showback, business mapping, exports.
- Operations: scan history/diff, alert lifecycle, routing policy simulation, freshness telemetry.
- Intelligence layer: `/api/v1/analytics/finops-intelligence` and `/api/v1/genai/rag-guidance` for deterministic + RAG + GenAI workflows.
- Executive decision route: `/api/v1/analytics/decision-intelligence` for 30/60/90 sequencing and advisory memo generation.
- Kubernetes: OpenCost sync and namespace/workload/team/node-pool allocation views.
- Data source policy: dashboard metrics use live provider APIs or imported billing data only; empty states are explicit when neither source is available.

## Repository Layout

- `finops_mcp/` - FastAPI backend, analytics, auth, imports, provider integrations
- `dashboard/` - Next.js dashboard UI
- `deploy/deploy-oci.sh` - deployment entrypoint for OCI operations
- `terraform/` - OCI network baseline and optional scheduler resources
- `ansible/` - host provisioning and runtime configuration

## Local Development

Local commands are for development and test loops only. Until this policy is changed, production services must run on OCI compute and the deployed systemd units refuse to start when OCI instance metadata is unavailable.

Supported Python for backend setup: `3.10` through `3.13`.
Supported Node.js for dashboard setup: `20.9.0` or newer.

```bash
./setup.sh

# Backend (default http://localhost:8000)
source .venv/bin/activate
optiora

# Dashboard (default http://localhost:3000)
cd dashboard
npm install
npm run dev
```

For the easiest local quick start, copy `.env.example` to `.env` and leave provider credentials blank. The example file sets `REQUIRE_LIVE_PROVIDER_DATA=false` so local CSV/import workflows can run without pretending placeholder cloud credentials are real.

For full validation commands and coverage notes, see [TESTING.md](TESTING.md).

## Verified Baseline (May 10, 2026)

- Frontend gates passed serially: `npm run build`, `npm run type-check`, `npm run lint`
- Frontend audit passed: `npm audit --audit-level=high`
- Backend syntax and regression gates passed: `python3 -m py_compile ...` and `279` tests via `unittest discover` (`2` skipped)
- Infrastructure syntax gates passed: tracked Terraform format/validate and Ansible playbook syntax check
- Animated dashboard wiring gate passed: `./scripts/check-animated-svg-routes.sh`
- Production browser smoke passed for `/optiora-animated.svg`, desktop `/dashboard`, mobile `/dashboard`, and friendly backend-unavailable alerts
- Workspace cleanup preserves dependency/runtime state while removing generated dashboard, Playwright, Python, Terraform, and scratch cache artifacts

Run `npm run build` before standalone `npm run type-check` after cleanup so
Next.js regenerates `.next/types` before TypeScript reads them.

## OCI Deployment

Production/runtime policy: OCI only. The Ansible-rendered `.env` sets `DEPLOYMENT_TARGET=oci` and `OCI_RUNTIME_REQUIRED=true`, and both API and dashboard systemd units perform an OCI metadata preflight before starting.

Recommended path:

```bash
./deploy/deploy-oci.sh menu
```

Common direct commands:

```bash
./deploy/deploy-oci.sh compute
./deploy/deploy-oci.sh status
./deploy/deploy-oci.sh verify
```

Recommended release order for Terraform + Ansible deployments: Terraform `init/validate/plan` -> optional `apply` -> `deploy-oci.sh compute/full` (Ansible run) -> `deploy-oci.sh verify` -> `scripts/generate_evidence_pack.sh`.

Primary OCI region for hosting and GenAI inference: `uk-london-1`.

Validated cloud connections are persisted until the customer disconnects them. Adding a valid credential writes runtime credentials on the API host and immediately starts a provider scan; unreachable or disabled credentials are marked invalid/inactive instead of being replaced with synthetic dashboard data.

Recommendations are collected from live provider sources when credentials allow it: AWS Cost Explorer rightsizing, Savings Plans, and reservation purchase recommendations; Azure Advisor cost recommendations; GCP Recommender and Cloud Monitoring signals; OCI Optimizer plus compute, boot volume, and block volume inventory. CSV imports remain the only non-provider fallback.

The default rightsizing dashboard path uses stored scan/import signals for responsiveness. Operators can request a live refresh; if that refresh fails, the dashboard keeps showing stored scan results with an explicit warning.

For prerequisites, environment variables, post-deploy checks, and troubleshooting, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Deployment](DEPLOYMENT.md)
- [Release Notes](RELEASE_NOTES.md)
- [Testing](TESTING.md)
- [Roadmap](ROADMAP.md)
- [Next Phase](NEXT_PHASE.md)
- [Cost Estimate](COST_ESTIMATE.md)
- [Data Policy](DATA_POLICY.md)
- [Terraform](terraform/README.md)
- [Ansible](ansible/README.md)

## License

MIT

## Contact / Pilot

Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot
