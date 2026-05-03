# OptiOra

Multi-cloud FinOps platform with a FastAPI backend, a Next.js dashboard, and an OCI-first deployment path.

## Dashboard Preview

![OptiOra animated dashboard](dashboard/public/optiora-animated.svg)

## What The Platform Does

- Aggregates cost signals across AWS, Azure, GCP, and OCI.
- Runs deterministic forecasting and analytics for spend, risk, savings, and efficiency.
- Supports operations workflows for scans, alerts, exports, and governance.
- Uses OCI GenAI as an advisory overlay (narrative and prioritization), not as the source of truth for cost math.

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
  +--> Cloud provider APIs
  +--> OCI Generative AI (optional)
```

For the full topology and pipeline details, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Capability Highlights

- Forecasting: baseline forecast, percentiles, downside risk, what-if, stress testing, model diagnostics.
- FinOps analytics: attribution, commitment analysis, waste decomposition, efficiency score, unit economics, scorecards.
- Optimization and governance: rightsizing, virtual tags, chargeback/showback, business mapping, exports.
- Operations: scan history/diff, alert lifecycle, routing policy simulation, freshness telemetry.
- Kubernetes: OpenCost sync and namespace/workload/team/node-pool allocation views.

## Repository Layout

- `finops_mcp/` - FastAPI backend, analytics, auth, imports, provider integrations
- `dashboard/` - Next.js dashboard UI
- `deploy/deploy-oci.sh` - deployment entrypoint for OCI operations
- `terraform/` - OCI network baseline and optional scheduler resources
- `ansible/` - host provisioning and runtime configuration

## Local Development

Supported Python for backend setup: `3.10` through `3.13`.

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

For full validation commands and coverage notes, see [TESTING.md](TESTING.md).

## OCI Deployment

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

Primary OCI region for hosting and GenAI inference: `uk-london-1`.

For prerequisites, environment variables, post-deploy checks, and troubleshooting, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Deployment](DEPLOYMENT.md)
- [Testing](TESTING.md)
- [Roadmap](ROADMAP.md)
- [Next Phase](NEXT_PHASE.md)
- [Cost Estimate](COST_ESTIMATE.md)
- [Data Policy](DATA_POLICY.md)
- [Terraform](terraform/README.md)
- [Ansible](ansible/README.md)

## License

MIT
