# OptiOra

**Multi-cloud FinOps control plane for real cloud cost telemetry, deterministic optimization math, and OCI GenAI-assisted advisory workflows.**

Current release: `0.9.2` dashboard wiring, advisor polish, live rightsizing scan fix, realized savings scorecards, FinOps Control Tower, canonical resource-cost explorer, 5-minute API response cache, UIX review, Terraform + Ansible OCI deployment wiring, and repository hygiene.
Current documentation baseline: May 11, 2026.

> **A quick, honest note:** OptiOra is still an active work in progress. The core platform, deployment path, and dashboard experiences are evolving quickly, but it is not being presented as a fully finished product yet. Some live-provider workflows depend on cloud account details, permissions, billing exports, utilization telemetry, and recommendation APIs that are not all available in my current test environments across every provider. If you are interested in running a real pilot, validating it with your cloud data, or shaping the next set of features, please get in touch.

![OptiOra animated dashboard](dashboard/public/optiora-animated.svg)

## Why OptiOra

OptiOra helps FinOps, platform, and cloud operations teams turn cloud billing and resource telemetry into explainable actions:

- **Real data only**: provider APIs, persisted live scan snapshots, or customer-imported CSV billing data.
- **Deterministic first**: forecasts, savings, rightsizing, anomaly, and efficiency math stay authoritative.
- **GenAI as an overlay**: OCI Generative AI explains, prioritizes, and summarizes; it does not invent cost numbers.
- **RAG-backed advisor context**: Cost Advisor and backend GenAI endpoints retrieve curated FinOps guidance before composing prompts and narratives.
- **Operator-ready workflows**: scans, approvals, exports, alerts, routing policies, scorecards, and weekly operating review packs.
- **OCI production path**: repeatable deployment with Terraform infrastructure, Ansible runtime provisioning, systemd services, and smoke verification.

## Contents

- [Architecture](#architecture)
- [Core Capabilities](#core-capabilities)
- [Data Policy](#data-policy)
- [Repository Layout](#repository-layout)
- [Local Development](#local-development)
- [OCI Deployment](#oci-deployment)
- [Validation](#validation)
- [Cost Planning](#cost-planning)
- [Documentation Map](#documentation-map)
- [License](#license)
- [Contact / Pilot](#contact--pilot)

## Architecture

```text
Users / Operators
        |
        | browser
        v
+-------------------------------------------------------------+
| Next.js Dashboard                                           |
| - FinOps cockpit, Cost Advisor, inventory, Kubernetes       |
| - Forecasting, scorecards, recommendations, operations      |
| - Refresh controls can bypass backend response cache        |
| - /api/ai/chat route for OCI GenAI advisor conversations    |
+----------------------------+--------------------------------+
                             |
                             | REST /api/v1/*
                             v
+-------------------------------------------------------------+
| FastAPI Backend                                              |
| - Costs, scans, imports, forecasts, anomalies, exports       |
| - Rightsizing, recommendations, decision intelligence        |
| - Hybrid advisor contract: deterministic data + narrative    |
| - 5-minute JSON response cache + active-entry warmer         |
+-------------+----------------------+------------------------+
              |                      |
              | SQLAlchemy           | provider / GenAI/RAG APIs
              v                      v
+-------------------------+    +--------------------------------+
| SQLite or PostgreSQL    |    | AWS, Azure, GCP, OCI            |
| - snapshots             |    | cost, usage, recommendations    |
| - imports               |    | OCI Generative AI Inference     |
| - alerts/audit/exports  |    | default region: uk-london-1     |
+-------------------------+    +--------------------------------+
```

Deployment flow:

```text
Local workspace
        |
        +--> Terraform
        |     +--> OCI network, compute, data volume, archive bucket, scheduler
        |
        +--> deploy/deploy-oci.sh
              +--> read Terraform instance outputs
              +--> source archive upload
              +--> Ansible provisioning
              +--> dashboard build + backend venv
              +--> systemd restart
              +--> smoke verification
```

For the deeper system topology, API surface, and data pipelines, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Core Capabilities

| Area | What OptiOra Provides |
|---|---|
| Cost visibility | Billing & Allocation spend views, account hierarchy, service hotspots, Cloud Resources & Costs explorer, imported billing files |
| Forecasting | Baseline forecasts, percentile bands, budget risk, what-if scenarios, stress tests, model diagnostics |
| Optimization | Rightsizing with stored/live provider scan modes, provider-native recommendations, recommendation ledger, commitment gaps, waste decomposition, savings sequencing |
| Unit economics | Cost allocation, business mapping, normalized dimensions, realized savings scorecards, showback/chargeback views |
| Kubernetes | Live OKE/Container Instance/OCIR inventory, OpenCost sync, cluster modeling, namespace/team/workload/node-pool allocation, optimization recommendations |
| Operations | Scan history, scan diffs, alert lifecycle, routing policy simulation, evidence exports, freshness telemetry |
| Intelligence | Cost Advisor, AI Insights, RAG-guided narratives, operating review packs, decision intelligence frontier |
| Governance | Virtual tags, tag quality, audit logs, data-source banners, export jobs, retention controls |
| Control tower | Unified Advanced FinOps view for forecast risk, waste, commitment, governance, decision frontier, RAG evidence, and GenAI advisory prompts |
| Performance | Process-local API response cache for dashboard JSON GETs, refreshed every 5 minutes and bypassed by user Refresh actions |

Recent UIX and wiring updates:

- Cost Advisor chat now uses the server-side dashboard `/api/ai/chat` route to call OCI GenAI with signed requests and enriches answers with backend RAG guidance from `/api/v1/genai/rag-guidance`.
- Backend GenAI narratives now inject retrieved RAG briefs into the OCI GenAI prompt path while preserving deterministic cost, savings, risk, and forecast numbers as the source of truth.
- OCI deployment is wired end to end through Terraform-managed infrastructure and Ansible-managed runtime provisioning, with the deploy script reading Terraform outputs for inventory, upload, provisioning, and smoke checks.
- Rightsizing live provider scans now use a longer dashboard timeout for provider-native calls observed at about `50s` in OCI, while still falling back to stored results if the live path fails.
- Rightsizing now has expandable scan status, executive summary, filters/search, action mix, and per-resource execution details.
- Rightsizing recommendations now populate a finance-ready recommendation ledger with planned savings, realized savings, and variance, exposed through JSON, CSV, and the finance workbook.
- Scorecards now include realized savings scorecards by provider, owner, business unit, and realized month, backed by the recommendation ledger.
- Kubernetes now merges billing data with live OCI OKE, Container Instance, and OCIR inventory so newly launched container services appear before cost-management data catches up.
- Cloud Resources is now the canonical resource-cost explorer, with provider/type/region/account/top-resource breakdowns, local search/sort, and expandable details.
- Dashboard JSON GETs now use a bounded backend response cache so normal navigation is fast; active entries are warmed every `5` minutes and Refresh buttons request a fresh backend read.
- Advanced FinOps now consolidates forecast risk, waste, commitment, governance, and decision-frontier signals into one control tower instead of forcing operators to stitch disconnected analytics together manually.
- Billing & Allocation now owns finance spend, chargeback, mapping, and export workflows, removing confusing overlap with resource investigation.
- The legacy Kubernetes namespace route wiring was removed; `/dashboard/kubernetes` is the only Kubernetes/container/Docker page.
- Cost Advisor now separates deterministic decision snapshots, quick wins, provider evidence, and conversation starters into focused sections.

## Data Policy

OptiOra must not fabricate production cost data.

Allowed runtime sources:

- Cloud provider APIs from AWS, Azure, GCP, and OCI.
- Persisted scan snapshots derived from those provider APIs.
- Customer-provided CSV imports.

Disallowed runtime sources:

- hardcoded demo datasets
- synthetic cost records
- mock production payloads
- generated recommendations used to hide missing telemetry

If no real source exists, the application surfaces an explicit empty or unavailable state. The full policy is tracked in [DATA_POLICY.md](DATA_POLICY.md).

## Repository Layout

```text
.
|-- finops_mcp/              FastAPI backend, analytics, auth, provider integrations
|-- dashboard/               Next.js dashboard and e2e tests
|-- deploy/deploy-oci.sh     OCI deployment and operations entrypoint
|-- terraform/               OCI network, compute, data volume, archive bucket, scheduler resources
|-- ansible/                 Oracle Linux host provisioning and service templates
|-- tests/                   Backend, smoke, live-data, and deployment checks
|-- scripts/                 Local bootstrap, cleanup, evidence, and wiring helpers
|-- ARCHITECTURE.md          Runtime topology and pipeline diagrams
|-- DEPLOYMENT.md            End-to-end OCI deployment guide
|-- COST_ESTIMATE.md         Monthly planning ranges and cost drivers
|-- RELEASE_NOTES.md         Release history and validation notes
```

## Local Development

Local development is for build, test, and CSV/import workflows. Production runtime is OCI-only until that policy changes.

Requirements:

- Python `3.10` through `3.13`
- Node.js `20.9.0` or newer
- npm
- Optional: OCI CLI, Terraform, and Ansible for infrastructure/deployment work

Bootstrap:

```bash
./setup.sh
```

Run the backend:

```bash
source .venv/bin/activate
optiora
```

Run the dashboard:

```bash
cd dashboard
npm install
npm run dev
```

Default local URLs:

| Service | URL |
|---|---|
| Dashboard | `http://localhost:3000/dashboard` |
| Backend health | `http://localhost:8000/health` |
| Backend docs | `http://localhost:8000/docs` |

For the easiest local quick start, copy `.env.example` to `.env` and leave cloud credentials blank. The example sets `REQUIRE_LIVE_PROVIDER_DATA=false`, allowing CSV/import workflows without pretending placeholder credentials are real.

## OCI Deployment

Production/runtime policy: **OCI only**.

The Ansible-rendered environment sets:

```env
DEPLOYMENT_TARGET=oci
OCI_RUNTIME_REQUIRED=true
```

Both API and dashboard systemd units perform an OCI instance metadata preflight before starting.

Recommended guided deployment:

```bash
./deploy/deploy-oci.sh menu
```

Recommended direct end-to-end deployment:

```bash
./deploy/deploy-oci.sh full
```

Common direct operations:

```bash
./deploy/deploy-oci.sh status
./deploy/deploy-oci.sh verify
./deploy/deploy-oci.sh logs
./deploy/deploy-oci.sh restart
```

Recommended release order:

```text
terraform init/validate/plan
        |
        v
terraform apply
        |
        v
Ansible provisioning from deploy-oci.sh full
        |
        v
deploy-oci.sh verify
        |
        v
scripts/generate_evidence_pack.sh
```

Primary OCI region for hosting and GenAI inference: `uk-london-1`.

For prerequisites, environment variables, networking, Terraform/Ansible details, and troubleshooting, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Validation

High-signal local gates:

```bash
python3 -m py_compile $(find ./finops_mcp -name '*.py')
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'

cd dashboard
npm run build
npm run type-check
npm run lint
npm run test:e2e
```

Infrastructure gates:

```bash
terraform fmt -check
terraform validate
ansible-playbook --syntax-check -i ansible/inventory.example.yml ansible/playbooks/site.yml
```

Wiring and cleanup:

```bash
./scripts/check-animated-svg-routes.sh
./scripts/cleanup-workspace.sh
```

Important Next.js note: run `npm run build` before standalone `npm run type-check` after cleanup so `.next/types` exists before TypeScript reads generated route types.

Current verified baseline is recorded in [RELEASE_NOTES.md](RELEASE_NOTES.md), [TESTING.md](TESTING.md), and [E2E_WALKTHROUGH_NOTES.md](E2E_WALKTHROUGH_NOTES.md).

Latest deployed OCI verification snapshot:

```text
deploy/deploy-oci.sh verify
  48 passed, 0 failed, 3 skipped

Operator dashboard walkthrough
  all 20 main screens passed route, heading, active-nav, and canonical Kubernetes checks

Rightsizing live refresh
  provider=oci, refresh_live=true
  returned about 730 OCI recommendations in roughly 50 seconds
```

## Cost Planning

Planning ranges are tracked in [COST_ESTIMATE.md](COST_ESTIMATE.md). Current profile guidance:

| Profile | Runtime Guidance | Estimated Monthly Range |
|---|---|---:|
| Small | `1 OCPU / 4 GB`, SQLite on VM, light telemetry | `$85-$240` |
| Default | `2 OCPU / 8 GB`, PostgreSQL, medium telemetry and GenAI | `$240-$620` |
| High Throughput | `4 OCPU / 16 GB`, PostgreSQL, heavier telemetry and GenAI | `$675-$2120+` |

Treat these as planning bands. Verify region-specific list prices in the OCI cost estimator before purchase.

## Documentation Map

| Document | Purpose |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Runtime topology, APIs, analytics pipelines, ASCII diagrams |
| [DEPLOYMENT.md](DEPLOYMENT.md) | OCI deployment, operations, networking, troubleshooting |
| [RELEASE_NOTES.md](RELEASE_NOTES.md) | Release history, fixes, validation commands |
| [TESTING.md](TESTING.md) | Test strategy and coverage map |
| [E2E_WALKTHROUGH_NOTES.md](E2E_WALKTHROUGH_NOTES.md) | Human operator walkthrough notes, process outcomes, and live OCI verification snapshot |
| [UIX_REVIEW.md](UIX_REVIEW.md) | Page-by-page UIX review, applied shell improvements, and UX backlog |
| [ROADMAP.md](ROADMAP.md) | Product direction and capability gaps |
| [NEXT_PHASE.md](NEXT_PHASE.md) | Near-term implementation plan |
| [COST_ESTIMATE.md](COST_ESTIMATE.md) | Monthly cost planning and cost drivers |
| [DATA_POLICY.md](DATA_POLICY.md) | Real-data-only source policy and guardrails |
| [terraform/README.md](terraform/README.md) | OCI Terraform baseline |
| [ansible/README.md](ansible/README.md) | Oracle Linux provisioning and runtime configuration |

## Security And Operations Notes

- Default deployed dashboard posture is public workspace mode unless auth/RBAC is intentionally enabled.
- Provider credentials are validated before use and stored on the API host for runtime scans.
- Direct app ports can be closed behind the nginx front door.
- Smoke verification auto-detects direct-port versus front-door exposure.
- Workspace cleanup preserves dependency/runtime state while removing generated build, cache, report, and scratch artifacts.
- OCI deploy archives exclude local secrets, Terraform state/tfvars, databases, build outputs, `node_modules`, reports, and scratch folders; Ansible also removes stale generated deploy artifacts before unpacking new source.

## License

MIT. See [LICENSE](LICENSE).

## Contact / Pilot

Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot
