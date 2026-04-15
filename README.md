# OptiOra

Multi-cloud FinOps platform with a FastAPI backend, a Next.js dashboard, and an OCI deployment path.

## Dashboard Preview

<p align="center">
  <img
    src="dashboard/public/optiora-animated.svg"
    alt="OptiOra animated dashboard — cycling through cost overview, anomaly detection, recommendations, and AI cost advisor"
    width="900"
  />
</p>

The dashboard is the main workspace for:

- multi-cloud cost overview across AWS, Azure, GCP, and OCI
- provider connection and scan readiness checks
- anomaly detection and optimization recommendations
- deterministic forecasting with baseline, conservative, balanced, and aggressive scenarios
- OCI GenAI-assisted cost advisor conversations when OCI GenAI credentials are configured

## Repository Layout

- `finops_mcp/`: FastAPI backend, auth, credential workflows, scan state, provider integrations
- `dashboard/`: Next.js dashboard UI
- `ansible/`: host provisioning and application runtime configuration
- `deploy/deploy-oci.sh`: laptop-driven OCI compute deployment
- `terraform/`: OCI network baseline
- `ARCHITECTURE_COMPLETE.md`: full architecture and ASCII diagrams
- `DEPLOYMENT.md`: deployment runbook

## Runtime Architecture

```text
┌──────────────────────────────────────────────┐
│                  End Users                   │
└────────────────────────┬─────────────────────┘
                         │ HTTPS
                         v
┌──────────────────────────────────────────────┐
│          Next.js Dashboard (port 3000)       │
│  - cost views and AI advisor chat            │
│  - credential + scan setup                   │
│  - anomaly detection and recommendations     │
└────────────────────────┬─────────────────────┘
                         │ REST
                         v
┌──────────────────────────────────────────────┐
│           FastAPI Backend (port 8000)        │
│  /api/v1/credentials/*                       │
│  /api/v1/scanning/*                          │
│  /api/v1/costs|anomalies|recommendations     │
│  /api/v1/provider-diagnostics                │
└───────────────┬──────────────────┬───────────┘
                │                  │
                │ SQLAlchemy       │ Cloud SDK / APIs
                v                  v
      ┌──────────────────┐   ┌───────────────────────┐
      │ SQLite/Postgres  │   │ AWS / Azure / GCP / OCI│
      │ - org mapping    │   │ cost + usage endpoints │
      │ - credentials    │   └───────────────────────┘
      │ - scan runs      │
      └──────────────────┘
```

## Key Behavior

- `.env` is loaded automatically when the backend package is imported.
- Raw cloud secrets are validated server-side but not persisted; only sanitized metadata is stored.
- Provider diagnostics report missing cloud configuration without exposing secret values.
- Dashboard overview pages mark partial or fallback data explicitly if backend data is unavailable.
- Forecasts, anomaly detection, and recommendations are all driven from live provider cost data — no hardcoded baselines.

## Core API Surface

- `GET /health`
- `POST /api/v1/credentials/validate`
- `POST /api/v1/credentials/add`
- `GET /api/v1/credentials`
- `DELETE /api/v1/credentials/{provider}`
- `POST /api/v1/scanning/request-approval`
- `POST /api/v1/scanning/approve`
- `GET /api/v1/scanning/permission`
- `POST /api/v1/scanning/start`
- `GET /api/v1/scanning/{scan_id}/progress`
- `GET /api/v1/costs`
- `GET /api/v1/anomalies`
- `GET /api/v1/recommendations`
- `GET /api/v1/forecast`
- `GET /api/v1/analytics`
- `GET /api/v1/provider-diagnostics`
- `GET /api/v1/info`

## Local Development

Supported Python for backend setup: `3.10` through `3.13`

### One-command bootstrap

```bash
./setup.sh
```

This creates a backend virtualenv, installs dashboard dependencies, and runs Terraform init/validate.

### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
python -m finops_mcp.app
```

Backend default: `http://localhost:8000`

### Dashboard

```bash
cd dashboard
npm install
npm run dev
```

Dashboard default: `http://localhost:3000`

Local frontend env:

```bash
export NEXT_PUBLIC_API_URL=http://localhost:8000
```

Database config:

- default local DB: SQLite via `sqlite:///./optiora.db`
- preferred override: `DATABASE_URL=...`
- legacy fallback: if `DATABASE_URL` is blank and `OCI_DB_*` vars are set, the backend derives a PostgreSQL URL automatically

## OCI Deployment

```bash
export OCI_COMPARTMENT_ID=ocid1.compartment.oc1...
./deploy/deploy-oci.sh compute
./deploy/deploy-oci.sh status
```

Deployment script behavior:

- provisions or reuses an OCI compute instance
- uploads the current local workspace snapshot
- rewrites remote `FRONTEND_URL` and `NEXT_PUBLIC_API_URL` to the instance public IP
- replaces placeholder JWT secrets with a generated value
- installs backend + dashboard dependencies and starts systemd services

## Terraform + Ansible Baseline

Terraform is intentionally limited to OCI networking primitives. Ansible owns host package installation, runtime `.env` rendering, dashboard builds, systemd units, and health checks.

```bash
terraform -chdir=terraform init
terraform -chdir=terraform validate
terraform -chdir=terraform plan \
  -var="compartment_id=<your_compartment_ocid>" \
  -var="region=af-johannesburg-1" \
  -var="laptop_cidr=<your_public_ip>/32"
```

Security defaults:

- ingress locked to `laptop_cidr`
- egress defaults to `0.0.0.0/0` so provisioning and cloud API access work out of the box
- override `egress_cidr` if you want a more restrictive outbound policy

Ansible provisioning:

```bash
cp ansible/inventory.example.yml ansible/inventory.yml
ansible-playbook -i ansible/inventory.yml ansible/playbooks/site.yml
```

## Verification

```bash
python3 -m py_compile finops_mcp/*.py finops_mcp/tools/*.py
python3 -m compileall finops_mcp
python3 -m unittest discover -s tests

cd dashboard
npm run type-check
npm run lint
npm run build

terraform -chdir=../terraform validate
```

## Documentation

- [Architecture](ARCHITECTURE_COMPLETE.md)
- [Deployment](DEPLOYMENT.md)
- [Dashboard Architecture](DASHBOARD.md)
- [Credential Management](CREDENTIAL_MANAGEMENT.md)
- [Testing](TESTING.md)
- [Terraform](terraform/README.md)
- [Ansible](ansible/README.md)
- [Roadmap](ROADMAP.md)

## License

MIT
