# OptiOra Architecture

This document reflects the deployable architecture in this repository as of April 14, 2026.

## 1) Runtime Topology

```text
┌────────────────────────────────────────────┐
│                 End Users                  │
└──────────────────────┬─────────────────────┘
                       │ HTTPS
                       v
┌────────────────────────────────────────────┐
│        Next.js Dashboard (port 3000)      │
│  - Auth flows                              │
│  - Costs/anomalies/recommendations         │
│  - Credential and scanning setup           │
└──────────────────────┬─────────────────────┘
                       │ REST
                       v
┌────────────────────────────────────────────┐
│         FastAPI Backend (port 8000)       │
│  /auth/*                                   │
│  /api/v1/credentials/*                     │
│  /api/v1/scanning/*                        │
│  /api/v1/costs|anomalies|recommendations   │
└───────────────┬─────────────────┬──────────┘
                │                 │
                │ SQLAlchemy      │ Cloud SDK clients
                v                 v
      ┌──────────────────┐   ┌───────────────────────┐
      │ SQLite/Postgres  │   │ AWS/Azure/GCP/OCI APIs│
      │ - users          │   │ cost + usage endpoints │
      │ - refresh tokens │   └───────────────────────┘
      │ - credentials    │
      │ - scan state     │
      └──────────────────┘
```

## 2) OCI Deployment Topology

```text
OCI Compute VM
├── /opt/optiora
│   ├── finops_mcp/            # FastAPI code
│   ├── dashboard/             # Next.js code + built output
│   ├── .env                   # runtime environment
│   └── venv/                  # Python virtual environment
├── systemd
│   ├── optiora-api.service
│   └── optiora-dashboard.service
└── logs
    ├── /var/log/optiora-api.log
    ├── /var/log/optiora-dashboard.log
    └── /var/log/optiora-setup.log
```

## 3) Laptop-Controlled Deploy Flow

```text
Developer Laptop
   |
   | ./deploy/deploy-oci.sh compute
   v
OCI CLI provisions/starts VM
   |
   | tar + scp of LOCAL workspace snapshot
   v
VM receives /tmp/optiora-deploy.tar.gz
   |
   | unpack -> /opt/optiora
   | pip install -e /opt/optiora
   | npm ci && npm run build
   v
systemd restart (API + Dashboard)
```

No Git clone and no CI trigger is required for deployment.

## 4) Auth + Token Flow

```text
POST /auth/login
   |
   v
Password verification (bcrypt)
   |
   v
Issue access + refresh JWT
   |
   v
Store refresh token hash in DB
   |
   v
Client uses Bearer access token for /auth/profile and protected API calls
```

## 5) Credential + Scan Flow

```text
Dashboard Settings
   |
   | POST /api/v1/credentials/validate
   v
Provider API probe
   |
   | POST /api/v1/credentials/add
   v
Persist sanitized credential metadata
   |
   | POST /api/v1/scanning/approve
   | POST /api/v1/scanning/start
   v
Background scan run stored in scan_runs
   |
   | GET /api/v1/scanning/{scan_id}/progress
   v
Progress + results to UI
```

## 6) Operational Notes

- Backend startup fails fast if DB initialization fails.
- API health/version and app metadata are consistent (`0.1.0` in current codebase).
- Dashboard can run without Anthropic key; AI chat returns a configuration message instead of crashing.
- Cloud-cost provider tools still include fallback/mock behavior when SDK/config is missing.

## 7) Terraform Security Baseline (Plan-Only)

```text
terraform plan
   |
   +--> VCN
   +--> Internet Gateway
   +--> Route Table
   +--> Security List
   +--> Public Subnet

Security List ingress:
  SSH    22   <- laptop_cidr/32
  UI   3000   <- laptop_cidr/32
  API  8000   <- laptop_cidr/32

No 0.0.0.0/0 ingress is defined.
```
