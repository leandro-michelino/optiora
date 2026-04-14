# OptiOra Architecture

This document reflects the repository state as of April 14, 2026.

## 1) Runtime Topology

```text
┌────────────────────────────────────────────┐
│                 End Users                  │
└──────────────────────┬─────────────────────┘
                       │ HTTPS
                       v
┌────────────────────────────────────────────┐
│        Next.js Dashboard (port 3000)       │
│  - auth/session handling                    │
│  - cost, anomaly, recommendation views      │
│  - credentials + scan setup                 │
└──────────────────────┬─────────────────────┘
                       │ REST + Bearer JWT
                       v
┌────────────────────────────────────────────┐
│         FastAPI Backend (port 8000)        │
│  /auth/*                                    │
│  /api/v1/credentials/*                      │
│  /api/v1/scanning/*                         │
│  /api/v1/costs|anomalies|recommendations    │
└───────────────┬─────────────────┬──────────┘
                │                 │
                │ SQLAlchemy      │ Cloud SDK clients
                v                 v
      ┌──────────────────┐   ┌───────────────────────┐
      │ SQLite/Postgres  │   │ AWS/Azure/GCP/OCI APIs│
      │ - users          │   │ cost + usage endpoints │
      │ - orgs + roles   │   └───────────────────────┘
      │ - refresh tokens │
      │ - credentials    │
      │ - scan state     │
      └──────────────────┘
```

## 2) Auth + Session Flow

```text
Login form -> POST /auth/login
    -> access token (30m)
    -> refresh token (7d, hashed in DB)
    -> dashboard stores both in localStorage

Protected dashboard request
    -> Authorization: Bearer <access>
    -> if 401, dashboard calls POST /auth/refresh
    -> retries request with fresh access token

Logout
    -> POST /auth/logout
    -> all refresh tokens for the user are revoked
```

## 3) Credential + Scan Flow

```text
Dashboard Settings
   |
   | POST /api/v1/credentials/validate
   v
Provider API probe
   |
   | POST /api/v1/credentials/add
   v
Persist sanitized credential metadata only
   |
   | POST /api/v1/scanning/approve
   | POST /api/v1/scanning/start
   v
Background scan run recorded in scan_runs
   |
   | GET /api/v1/scanning/{scan_id}/progress
   v
Progress + results returned to dashboard
```

Server-side customer scoping:

```text
JWT subject (user.id)
   |
   v
customer_id := "user-<id>"
   |
   v
credentials / scans stored and queried with server-derived scope
```

The client no longer controls the persisted customer scope.

## 4) Environment + Configuration Loading

```text
python -m finops_mcp.app
   |
   v
finops_mcp/__init__.py loads .env
   |
   +--> auth_utils reads SECRET_KEY
   +--> orm_models resolves DATABASE_URL
   +--> provider tools read cloud credentials
```

Database resolution order:

```text
DATABASE_URL (preferred)
   |
   | if blank
   v
OCI_DB_HOST + OCI_DB_USER + OCI_DB_PASSWORD (+ OCI_DB_NAME / OCI_DB_PORT)
   |
   | if incomplete
   v
sqlite:///./optiora.db
```

## 5) OCI Deployment Topology

```text
OCI Compute VM
├── /opt/optiora
│   ├── finops_mcp/            # FastAPI code
│   ├── dashboard/             # Next.js app
│   ├── .env                   # runtime environment
│   └── venv/                  # Python virtualenv
├── systemd
│   ├── optiora-api.service
│   └── optiora-dashboard.service
└── logs
    ├── /var/log/optiora-api.log
    ├── /var/log/optiora-dashboard.log
    └── /var/log/optiora-setup.log
```

Remote deploy flow:

```text
Developer laptop
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
   | force FRONTEND_URL=http://<public-ip>:3000
   | force NEXT_PUBLIC_API_URL=http://<public-ip>:8000
   | replace placeholder SECRET_KEY if needed
   | pip install -e /opt/optiora
   | npm ci && npm run build
   v
systemd restart (API + Dashboard)
```

## 6) Terraform Network Baseline

```text
terraform plan
   |
   +--> VCN
   +--> Internet Gateway
   +--> Route Table
   +--> Security List
   +--> Public Subnet

Ingress:
  SSH    22   <- laptop_cidr
  UI   3000   <- laptop_cidr
  API  8000   <- laptop_cidr

Egress:
  all traffic -> egress_cidr
  default     -> 0.0.0.0/0
```

This keeps inbound access laptop-scoped while still allowing package installation and provider API egress by default.

## 7) Operational Notes

- Backend startup fails fast if DB initialization fails.
- Credential validation returns troubleshooting details but never persists raw secrets.
- Dashboard overview pages can fall back to safe mock data when backend data is unavailable.
- AI chat degrades cleanly when `ANTHROPIC_API_KEY` is not configured.
- Password strength is enforced on both the frontend and backend.
