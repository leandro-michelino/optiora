# OptiOra Architecture

Current as of April 2026 — Release 1.0. Reflects public-dashboard deployment model,
multi-account hierarchy (Epic 2), and deep FinOps analytics with OCI GenAI backend narration.

---

## Runtime Topology

```text
┌──────────────────────────────────────────────────────────────────┐
│                          End Users                               │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ HTTP/HTTPS
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│               Next.js Dashboard  (port 3000)                     │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐   │
│  │ Cost views           │  │ AI Advisor chat (Cost Advisor)   │   │
│  │ Forecasting / Fan    │  │ /api/ai/chat route               │   │
│  │ Anomalies / Recs     │  │ ↓ ai-service.ts (OCI signing)    │   │
│  │ Account Hierarchy    │  │ ↓ OCI GenAI inference            │   │
│  │ Operations / Exports │  └──────────────────────────────────┘   │
│  └─────────────────────┘                                          │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ REST  /api/v1/*
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│               FastAPI Backend  (port 8000)                       │
│                                                                  │
│  Auth & RBAC         /auth/*                                     │
│  Credentials         /api/v1/credentials/*                       │
│  CSV Import          /api/v1/imports/costs/*                     │
│  Scanning            /api/v1/scanning/*                          │
│  Dashboard data      /api/v1/costs | anomalies | recommendations │
│  Forecasting         /api/v1/forecast                            │
│  Core analytics      /api/v1/analytics                           │
│  Attribution         /api/v1/analytics/attribution               │
│  Commitment ROI      /api/v1/analytics/commitment-optimization   │
│  Maturity model      /api/v1/analytics/maturity                  │
│  Unit economics      /api/v1/analytics/unit-economics            │
│  GenAI narration     /api/v1/genai/analyze                       │
│  Account hierarchy   /api/v1/provider-accounts/*                 │
│  Region breakdown    /api/v1/provider-accounts/{id}/region-*     │
│  Alerts / Exports    /api/v1/alerts | audit-logs | reports       │
└──────────┬───────────────────────┬───────────────────────────────┘
           │ SQLAlchemy            │ Cloud APIs + OCI GenAI
           ▼                       ▼
┌────────────────────┐   ┌──────────────────────────────────────┐
│  SQLite / Postgres │   │  AWS Cost Explorer                   │
│                    │   │  Azure Cost Management               │
│  organizations     │   │  GCP Cloud Billing                   │
│  users / auth      │   │  OCI Usage API                       │
│  credentials       │   │                                      │
│  scan_runs         │   │  OCI Generative AI (uk-london-1)     │
│  cost_snapshots    │   │  ↳ backend narration (genai_advisor) │
│  provider_accounts │   │  ↳ frontend chat (ai-service.ts)     │
│  cost_allocation   │   └──────────────────────────────────────┘
│    _snapshots      │
│  imported_costs    │
│  alerts / audit    │
└────────────────────┘
```

---

## FinOps Analytics Engine

```text
/api/v1/costs  +  /api/v1/scanning/permission
      │
      ├─► effective monthly spend + provider mix + budget guardrails
      │         │
      │         ▼
      │   finops_analytics.py  (fully deterministic — no RNG)
      │         │
      │   ┌─────┴──────────────────────────────────────────────────┐
      │   │                                                         │
      │   ├─► build_forecast()                                      │
      │   │     synthetic history + OLS regression blend            │
      │   │     deterministic Monte Carlo fan  (SHA256 PRNG)        │
      │   │     p10 / p50 / p90 / p95 per month                    │
      │   │     budget breach probability + safe_budget_95pct       │
      │   │     cost velocity (MoM %) + trend acceleration          │
      │   │     holdout backtesting (MAPE / wMAPE)                  │
      │   │     4 scenarios: baseline / conservative / balanced /   │
      │   │                  aggressive                             │
      │   │     → /api/v1/forecast                                  │
      │   │                                                         │
      │   ├─► build_analytics()                                     │
      │   │     risk score + maturity score                         │
      │   │     waste rate + commitment coverage (per provider)     │
      │   │     spend-at-risk + optimization capacity               │
      │   │     MoM change % + anomaly severity flag                │
      │   │     break-even on balanced scenario                     │
      │   │     → /api/v1/analytics  (+ GenAI narrative if wired)   │
      │   │                                                         │
      │   ├─► build_cost_attribution()                              │
      │   │     Pareto rank by provider (80/20 cutoff)              │
      │   │     HHI concentration index + efficiency score          │
      │   │     optional service-level Pareto breakdown             │
      │   │     → /api/v1/analytics/attribution                     │
      │   │                                                         │
      │   ├─► build_commitment_optimization()                       │
      │   │     RI/Savings Plan ROI at 50% / 65% / 80% coverage     │
      │   │     per-provider discount tiers (1yr / 3yr)             │
      │   │     upfront estimate + payback period                   │
      │   │     → /api/v1/analytics/commitment-optimization         │
      │   │                                                         │
      │   ├─► build_maturity_assessment()                           │
      │   │     7 dimensions scored 0-100                           │
      │   │     CRAWL / WALK / RUN / OPTIMIZE maturity level        │
      │   │     priority actions + next-level gap analysis          │
      │   │     → /api/v1/analytics/maturity (+ GenAI narrative)    │
      │   │                                                         │
      │   ├─► build_unit_economics()                                │
      │   │     cost-per-resource + unit cost trend                 │
      │   │     waste-to-spend ratio + dollar efficiency score      │
      │   │     → /api/v1/analytics/unit-economics                  │
      │   │                                                         │
      │   └─► build_anomaly_scores()                                │
      │         z-score severity ranking                            │
      │         financial impact % of monthly spend                 │
      │         critical / high / medium / low tiers                │
      │         (called internally; exposed via anomaly endpoints)   │
      │                                                             │
      └─────────────────────────────────────────────────────────────┘
```

---

## OCI GenAI Integration (Two Paths)

```text
Path A — Frontend chat (Cost Advisor page)
   │
   ▼ /api/ai/chat  (Next.js App Router)
   │
   ▼ dashboard/lib/ai-service.ts
       OCI RSA-SHA256 request signing (Node.js crypto, no SDK)
       │
       ▼ OCI Generative AI inference  (uk-london-1)
           model: meta.llama-3-70b-instruct (default)

Path B — Backend narration  (analytics and maturity endpoints)
   │
   ▼ finops_mcp/tools/genai_advisor.py
       Auth resolution order:
         1. OCI_CONFIG_FILE + OCI_PROFILE  (OCI SDK signer)
         2. OCI_PRIVATE_KEY_PATH or OCI_PRIVATE_KEY inline
         3. Not configured → returns None; prompt surfaced to frontend
       │
       ├─► generate_spend_narrative()      called by /api/v1/analytics
       ├─► generate_maturity_narrative()   called by /api/v1/analytics/maturity
       ├─► generate_anomaly_explanation()  available via /api/v1/genai/analyze
       ├─► generate_optimization_brief()   available via /api/v1/genai/analyze
       └─► generate_budget_risk_alert()    available via /api/v1/genai/analyze

Required env vars for both paths:
   OCI_GENAI_ENDPOINT         inference endpoint URL (default: uk-london-1)
   OCI_GENAI_MODEL            model ID (default: meta.llama-3-70b-instruct)
   OCI_COMPARTMENT_OCID       compartment for GenAI calls
   OCI_CONFIG_FILE            or direct key vars below
   OCI_TENANCY_OCID           |
   OCI_USER_OCID              | used when OCI_CONFIG_FILE is absent
   OCI_FINGERPRINT            |
   OCI_PRIVATE_KEY_PATH       | (prefer over inline)
   OCI_PRIVATE_KEY            | (inline PEM with \n escapes)
```

---

## Multi-Account Hierarchy (Epic 2)

```text
CSV import / Live scan
      │
      ├─► ImportedCostRecord  (with account_identifier, account_type,
      │                         parent_account_identifier, region columns)
      │
      └─► Live scan path
            │
            ▼
      ProviderAccount  (hierarchy node — account / subscription / project)
            │
            ├─► ProviderAccountLink   (parent → child edges)
            │
            └─► ProviderAccountSnapshot  (per-scan cost metrics)
                      │
                      └─► CostAllocationSnapshot  (per-scan, per-account, per-region)

Rollup engine  (_materialize_rollup_items)
      │
      reads ProviderAccount + ProviderAccountLink + ProviderAccountSnapshot
      │                        + CostAllocationSnapshot (for top_regions)
      ▼
ProviderAccountRollupResponse
   items[]:
     depth          — tree indentation level
     rolled_up_cost — sum of self + all descendants
     child_count    — direct children count
     top_regions    — up to 5 highest-cost regions from CostAllocationSnapshot

API surface:
   GET /api/v1/provider-accounts/rollups           → tree with rolled-up costs
   GET /api/v1/provider-accounts                   → flat inventory (filterable)
   GET /api/v1/provider-accounts/{id}/region-breakdown → per-region cost rows
```

---

## Public Access Model

```text
Default deployment  (ENABLE_AUTH=false)
      │
      ├─► backend resolves every request to the seeded public workspace
      ├─► dashboard opens directly — no login wall
      ├─► same org-scoped data model (single workspace context)
      └─► CSV upload, credentials, scanning all work without auth

Hardened deployment  (ENABLE_AUTH=true)
      │
      ├─► JWT + cookie session required
      ├─► org selected via /auth/organization/select
      ├─► owner/admin required for credential/scanning mutations
      └─► RBAC roles: OWNER > ADMIN > ANALYST > READONLY
```

---

## Cost Source Flow

```text
Dashboard Settings
      │
      ├─► Live provider path
      │     POST /api/v1/credentials/validate  → provider-specific check
      │     POST /api/v1/credentials/add       → persist sanitized metadata
      │     POST /api/v1/scanning/approve      → set budget + frequency
      │     POST /api/v1/scanning/start        → background scan
      │           │
      │           └─► per-provider cost fetch
      │                 │
      │                 ├─► CostSnapshot         (monthly totals)
      │                 ├─► ProviderAccount       (hierarchy nodes)
      │                 ├─► ProviderAccountSnapshot (per-scan metrics)
      │                 ├─► CostAllocationSnapshot  (per-region breakdown)
      │                 ├─► AlertEvent           (budget / anomaly alerts)
      │                 └─► AuditLog             (activity record)
      │
      └─► CSV billing path
            POST /api/v1/imports/costs/csv
                  │
                  ├─► ImportedCostRecord rows persisted
                  ├─► ProviderAccount nodes built from account_identifier columns
                  ├─► region costs aggregated into top_regions on rollup items
                  └─► cost / forecast / analytics / recommendations use imported context
```

---

## Scheduler and Diff Flow

```text
FastAPI startup
      │
      └─► ENABLE_SCAN_SCHEDULER=true?
              │
              └─► background loop  (SCAN_SCHEDULER_INTERVAL_MINUTES, default 60)
                      │
                      └─► due approved scanning_permissions
                              │
                              ├─► create scan_runs  (state=running)
                              ├─► fetch provider costs / anomalies / recommendations
                              ├─► write CostSnapshot + ProviderAccountSnapshot
                              │              + CostAllocationSnapshot
                              └─► complete scan_runs
                                      │
                                      ├─► /api/v1/scanning/history
                                      ├─► /api/v1/scanning/{scan_id}/diff
                                      └─► CSV / Excel exports
```

---

## Data Model

```text
users ──< user_organizations >── organizations
  │                                    │
  ├─< refresh_tokens                   ├─< stored_credentials
  └─< password_reset_tokens            ├─< scanning_permissions
                                       ├─< audit_logs
                                       ├─< alert_events
                                       ├─< imported_cost_records
                                       └─< provider_accounts ──< provider_account_links
                                                │
scan_runs ──< cost_snapshots                    ├─< provider_account_snapshots
scan_runs ──< provider_account_snapshots        └─< cost_allocation_snapshots
                                                     (per scan, per account, per region)
```

---

## Deployment Paths

### Quick OCI deploy

```text
Developer laptop
      │
      │  ./deploy/deploy-oci.sh compute
      │  ./deploy/deploy-oci.sh verify
      ▼
OCI Compute VM  (Oracle Linux 9, uk-london-1)
      │
      ├─► upload workspace snapshot
      ├─► install backend venv + dashboard npm ci + build
      ├─► render /opt/optiora/.env  (SECRET_KEY auto-generated)
      ├─► alembic upgrade head      (schema to 0006)
      ├─► restart systemd services
      └─► smoke verify  (health, CSV, exports, AI route, diagnostics)
```

### Terraform + Ansible

```text
Terraform  (terraform/)
      │
      ├─► VCN + internet gateway + route table
      ├─► public subnet  (10.50.1.0/24)
      └─► security list  (ingress: laptop_cidr → 22/3000/8000)

Ansible  (ansible/)
      │
      ├─► Oracle Linux / Debian package install
      ├─► Python venv + editable backend install
      ├─► dashboard npm ci + next build
      ├─► .env render + systemd units
      └─► alembic upgrade head + health checks
```

---

## Authorization Modes

```text
ENABLE_AUTH=true
      │
      ├─► JWT (HS256) + HttpOnly cookie session
      ├─► org selected via /auth/organization/select
      ├─► owner/admin required for credential/scanning mutations
      └─► RBAC: OWNER > ADMIN > ANALYST > READONLY
              ANALYST  — read credentials, costs, reports; no mutations
              READONLY — read costs and reports only

ENABLE_AUTH=false
      │
      ├─► backend resolves to seeded public workspace identity
      ├─► dashboard opens directly with no login wall
      └─► same org-scoped model — single workspace context
```
