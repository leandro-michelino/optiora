# OptiOra Architecture

This document reflects the current public-dashboard deployment model and the repo state on April 15, 2026.

## Runtime Topology

```text
┌──────────────────────────────────────────────┐
│                  End Users                   │
└────────────────────────┬─────────────────────┘
                         │ HTTP/HTTPS
                         v
┌──────────────────────────────────────────────┐
│          Next.js Dashboard (port 3000)       │
│  - public landing and direct dashboard       │
│  - cloud setup, scan approval, operations    │
│  - forecasting, anomalies, recommendations   │
│  - OCI GenAI chat route for advisor UX       │
└────────────────────────┬─────────────────────┘
                         │ REST
                         v
┌──────────────────────────────────────────────┐
│           FastAPI Backend (port 8000)        │
│  /api/v1/credentials/*                       │
│  /api/v1/scanning/*                          │
│  /api/v1/costs|anomalies|recommendations     │
│  /api/v1/forecast|analytics|alerts|exports   │
│  /auth/* (optional deployment hardening)     │
└───────────────┬──────────────────┬───────────┘
                │                  │
                │ SQLAlchemy       │ Cloud APIs / OCI GenAI
                v                  v
      ┌──────────────────┐   ┌───────────────────────┐
      │ SQLite/Postgres  │   │ AWS / Azure / GCP / OCI│
      │ - org/workspace  │   │ cost + usage endpoints │
      │ - credentials    │   │ OCI GenAI chat         │
      │ - scan runs      │   └───────────────────────┘
      │ - alerts/audit   │
      └──────────────────┘
```

## Public Access Model

```text
Default deployment
   |
   +--> ENABLE_AUTH=false
   +--> NEXT_PUBLIC_ENABLE_AUTH=false
   |
   v
Single public workspace
   |
   +--> dashboard opens directly
   +--> no login wall
   +--> org-scoped data stored under one workspace
   +--> auth/RBAC code remains optional hardening only
```

## Credential and Scan Flow

```text
Dashboard Settings
   |
   | POST /api/v1/credentials/validate
   v
Provider-specific validation
   |
   | POST /api/v1/credentials/add
   v
Persist sanitized metadata only
   |
   | POST /api/v1/scanning/approve
   | POST /api/v1/scanning/start
   v
Scan run recorded
   |
   +--> snapshots
   +--> alerts
   +--> audit events
   +--> history + diff + CSV exports
```

## Deployment Paths

### Quick OCI deploy

```text
Developer laptop
   |
   | ./deploy/deploy-oci.sh compute
   v
OCI VM
   |
   +--> upload local workspace snapshot
   +--> install backend + dashboard dependencies
   +--> render /opt/optiora/.env
   +--> alembic upgrade head
   +--> restart systemd services
```

### Terraform + Ansible

```text
Terraform
   |
   +--> VCN
   +--> subnet
   +--> route table
   +--> security list
   v
Ansible
   |
   +--> host packages + Node.js
   +--> Python virtualenv
   +--> dashboard build
   +--> runtime env + systemd units
   +--> alembic upgrade head
   +--> health checks
```

## AI Advisor Configuration

```text
Dashboard chat UI
   |
   v
/api/ai/chat
   |
   v
dashboard/lib/ai-service.ts
   |
   +--> OCI_PRIVATE_KEY      (inline PEM with \n escapes)
   |    or
   +--> OCI_PRIVATE_KEY_PATH (path on the host)
   |
   v
OCI request signing
   |
   v
OCI Generative AI inference endpoint
```
