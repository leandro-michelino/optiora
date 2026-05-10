# OptiOra

**Multi-cloud FinOps control plane for real cloud cost telemetry, deterministic optimization math, and OCI GenAI-assisted advisory workflows.**

Current release: `0.9.1` dashboard wiring and repository hygiene.
Current documentation baseline: May 10, 2026.

![OptiOra animated dashboard](dashboard/public/optiora-animated.svg)

## Why OptiOra

OptiOra helps FinOps, platform, and cloud operations teams turn cloud billing and resource telemetry into explainable actions:

- **Real data only**: provider APIs, persisted live scan snapshots, or customer-imported CSV billing data.
- **Deterministic first**: forecasts, savings, rightsizing, anomaly, and efficiency math stay authoritative.
- **GenAI as an overlay**: OCI Generative AI explains, prioritizes, and summarizes; it does not invent cost numbers.
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
+-------------+----------------------+------------------------+
              |                      |
              | SQLAlchemy           | provider / GenAI APIs
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
        |     +--> OCI network baseline and optional scheduler resources
        |
        +--> deploy/deploy-oci.sh
              +--> compute create/start
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
| Cost visibility | Multi-provider spend views, account hierarchy, service hotspots, resource inventory, imported billing files |
| Forecasting | Baseline forecasts, percentile bands, budget risk, what-if scenarios, stress tests, model diagnostics |
| Optimization | Rightsizing, provider-native recommendations, commitment gaps, waste decomposition, savings sequencing |
| Unit economics | Cost allocation, business mapping, normalized dimensions, scorecards, showback/chargeback views |
| Kubernetes | OpenCost sync, cluster modeling, namespace/team/workload/node-pool allocation, optimization recommendations |
| Operations | Scan history, scan diffs, alert lifecycle, routing policy simulation, evidence exports, freshness telemetry |
| Intelligence | Cost Advisor, AI Insights, RAG-guided narratives, operating review packs, decision intelligence frontier |
| Governance | Virtual tags, tag quality, audit logs, data-source banners, export jobs, retention controls |

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
|-- terraform/               OCI network baseline and optional scheduler resources
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

Common direct operations:

```bash
./deploy/deploy-oci.sh compute
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
optional terraform apply
        |
        v
deploy-oci.sh compute or full
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

Current verified baseline is recorded in [RELEASE_NOTES.md](RELEASE_NOTES.md) and [TESTING.md](TESTING.md).

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

## License

MIT. See [LICENSE](LICENSE).

## Contact / Pilot

Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot
