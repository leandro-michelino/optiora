# OptiOra

Multi-cloud FinOps platform with a FastAPI backend and Next.js dashboard.

## Dashboard Preview

![OptiOra Dashboard Preview](dashboard/public/dashboard-preview.png)

## What This Repo Contains

- `finops_mcp/`: Python backend (FastAPI, auth, credential management, scan workflow, dashboard APIs)
- `dashboard/`: Next.js dashboard UI
- `deploy/deploy-oci.sh`: OCI compute deployment automation
- `ARCHITECTURE_COMPLETE.md`: current architecture and ASCII diagrams
- `DEPLOYMENT.md`: operational deployment runbook

## Current Runtime Architecture

```text
Users
  |
  v
Next.js Dashboard (port 3000)
  |
  | HTTPS/REST
  v
FastAPI Backend (port 8000)
  |
  +--> Auth + JWT
  +--> Credential Validation/Storage
  +--> Scanning Workflow
  +--> Dashboard Data APIs (/api/v1/costs|anomalies|recommendations)
  |
  +--> Cloud SDK calls (AWS, Azure, GCP, OCI)
  +--> SQLite/PostgreSQL via SQLAlchemy
```

## API Surface (Core)

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/profile`
- `POST /auth/logout`
- `POST /api/v1/credentials/validate`
- `POST /api/v1/credentials/add`
- `GET /api/v1/credentials?customer_id=...`
- `DELETE /api/v1/credentials/{provider}?customer_id=...`
- `POST /api/v1/scanning/approve`
- `POST /api/v1/scanning/start`
- `GET /api/v1/scanning/{scan_id}/progress`
- `GET /api/v1/costs`
- `GET /api/v1/anomalies`
- `GET /api/v1/recommendations`

## Local Development

### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
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

Set `NEXT_PUBLIC_API_URL` if backend is not local:

```bash
export NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Deploy to OCI

```bash
export OCI_COMPARTMENT_ID=ocid1.compartment.oc1...
./deploy/deploy-oci.sh compute
./deploy/deploy-oci.sh status
```

The deploy script provisions:

- `optiora-api.service` (FastAPI on port 8000)
- `optiora-dashboard.service` (Next.js on port 3000)

## Quality Checks

```bash
# Backend syntax
python3 -m py_compile finops_mcp/*.py finops_mcp/tools/*.py

# Frontend
cd dashboard
npm run type-check
npm run lint
```

## Documentation

- [Architecture](/Users/leandromichelino/Desktop/Oracle/Github/newproject/ARCHITECTURE_COMPLETE.md)
- [Deployment](/Users/leandromichelino/Desktop/Oracle/Github/newproject/DEPLOYMENT.md)
- [Dashboard](/Users/leandromichelino/Desktop/Oracle/Github/newproject/DASHBOARD.md)
- [Credential Management](/Users/leandromichelino/Desktop/Oracle/Github/newproject/CREDENTIAL_MANAGEMENT.md)
- [Testing](/Users/leandromichelino/Desktop/Oracle/Github/newproject/TESTING.md)

## License

MIT
