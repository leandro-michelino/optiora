# OptiOra Architecture

This document reflects the current standard deployment architecture (FastAPI + Next.js).

## 1) System Overview

```text
┌──────────────────────────────────────────────────────────────┐
│                        End Users                            │
└───────────────────────────────┬──────────────────────────────┘
                                │
                                │ HTTPS
                                v
┌──────────────────────────────────────────────────────────────┐
│                   Next.js Dashboard (:3000)                 │
│  - Auth pages (login/signup)                                │
│  - Overview, costs, anomalies, recommendations              │
│  - Settings (credentials + scanning workflow)               │
└───────────────────────────────┬──────────────────────────────┘
                                │ REST API
                                v
┌──────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (:8000)                  │
│  /auth/*                                                    │
│  /api/v1/credentials/*                                      │
│  /api/v1/scanning/*                                         │
│  /api/v1/costs | /anomalies | /recommendations             │
└───────────────┬───────────────────────────────┬──────────────┘
                │                               │
                │ SQLAlchemy                    │ Provider SDKs
                v                               v
      ┌───────────────────────┐      ┌──────────────────────────┐
      │ SQLite/PostgreSQL DB  │      │ AWS / Azure / GCP / OCI │
      │ - users               │      │ cost and usage APIs      │
      │ - tokens              │      └──────────────────────────┘
      │ - credential records  │
      │ - scanning state      │
      └───────────────────────┘
```

## 2) Request Flow (Dashboard Data)

```text
Dashboard page load
   |
   | GET /api/v1/costs
   v
FastAPI router
   |
   | calls provider summary tools (AWS/Azure/GCP/OCI)
   | + anomaly/recommendation engines
   v
Aggregated response
   |
   v
Dashboard charts/cards rendered
```

## 3) Auth Flow

```text
POST /auth/login
   |
   v
Validate password hash
   |
   v
Issue access + refresh JWT
   |
   v
Store deterministic refresh token hash in DB
   |
   v
Client stores tokens and fetches /auth/profile
```

## 4) Credential + Scan Setup Flow

```text
Settings page
   |
   | POST /api/v1/credentials/validate
   v
Provider-specific credential check
   |
   | POST /api/v1/credentials/add
   v
Persist credential metadata
   |
   | POST /api/v1/scanning/approve
   | POST /api/v1/scanning/start
   v
Background scan run created
   |
   | GET /api/v1/scanning/{scan_id}/progress
   v
Progress + results
```

## 5) OCI Deployment Topology

```text
OCI Compute Instance
├── /opt/optiora
│   ├── finops_mcp/
│   └── dashboard/
├── systemd
│   ├── optiora-api.service
│   └── optiora-dashboard.service
└── logs
    ├── /var/log/optiora-api.log
    ├── /var/log/optiora-dashboard.log
    └── /var/log/optiora-setup.log
```

## 6) Design Notes

- API and dashboard are independently restartable.
- Backend supports partial provider availability (returns provider-level errors while preserving response shape).
- Scan workflow is stateful and persisted, so scan progress endpoint can return real run status.
- Tool modules currently mix live-provider calls and fallback/mock behavior; responses are normalized at API layer.
