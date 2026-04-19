# OptiOra Architecture

Current as of April 2026 (Release 1.0 + Epic 5 analytics enhancements).

## 1) Runtime Topology

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                                 End Users                                    │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ HTTPS
                                       v
┌──────────────────────────────────────────────────────────────────────────────┐
│                      Next.js Dashboard (port 3000)                           │
│                                                                              │
│  Overview / Costs / Forecasting / Anomalies / Recommendations / Settings    │
│  Account hierarchy rollups, allocation coverage, export workflows            │
│  Animated KPI surfaces: efficiency score, waste categories, commitment gap   │
│                                                                              │
│  App Router API: /api/ai/chat -> dashboard/lib/ai-service.ts -> OCI GenAI   │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ REST /api/v1/*
                                       v
┌──────────────────────────────────────────────────────────────────────────────┐
│                       FastAPI Backend (port 8000)                            │
│                                                                              │
│  Auth/RBAC                /auth/*                                            │
│  Credentials              /api/v1/credentials/*                              │
│  CSV imports              /api/v1/imports/costs/*                            │
│  Scanning + scheduler     /api/v1/scanning/*                                 │
│  Core dashboard data      /api/v1/costs | anomalies | recommendations        │
│  Forecasting              /api/v1/forecast                                   │
│  Analytics family         /api/v1/analytics/*                                │
│    - base analytics       /api/v1/analytics                                  │
│    - attribution          /api/v1/analytics/attribution                      │
│    - commitment ROI       /api/v1/analytics/commitment-optimization          │
│    - maturity             /api/v1/analytics/maturity                         │
│    - unit economics       /api/v1/analytics/unit-economics                   │
│    - cloud waste          /api/v1/analytics/cloud-waste                      │
│    - efficiency score     /api/v1/analytics/efficiency-score                 │
│    - commitment gap       /api/v1/analytics/commitment-gap                   │
│  Hybrid advisor          /api/v1/advisor/hybrid                              │
│  GenAI narratives         /api/v1/genai/analyze                              │
│  Account hierarchy        /api/v1/provider-accounts/*                        │
│  Alerts/Audit/Exports     /api/v1/alerts* | /api/v1/audit-logs* | reports   │
└─────────────────────┬───────────────────────────────────┬────────────────────┘
                      │ SQLAlchemy ORM                    │ Provider / GenAI APIs
                      v                                   v
            ┌──────────────────────┐        ┌──────────────────────────────────┐
            │ SQLite / PostgreSQL  │        │ AWS / Azure / GCP / OCI Cost APIs│
            │ organizations/users  │        │ OCI Generative AI Inference      │
            │ credentials          │        │ (uk-london-1 default endpoint)   │
            │ scan_runs/snapshots  │        └──────────────────────────────────┘
            │ imported costs       │
            │ provider accounts    │
            │ alerts/audit/exports │
            └──────────────────────┘
```

## 2) Analytics Pipeline

```text
              source data (live providers and/or imported CSV)
                                   │
                                   v
                         _cost_context aggregation
                                   │
                                   v
                      finops_mcp/tools/finops_analytics.py
                                   │
         ┌─────────────────────────┼──────────────────────────┐
         v                         v                          v
  Forecasting               Core analytics            Advanced analytics
  build_forecast()          build_analytics()         build_cloud_waste_analysis()
  - deterministic fan       - risk/maturity           build_cost_efficiency_score()
  - p10/p50/p90/p95         - spend-at-risk           build_commitment_gap_analysis()
  - budget guardrails       - optimization cap        + attribution/commitment/maturity
  - backtesting (MAPE)      - provider findings       + unit economics/anomaly scores
         │                         │                          │
         └─────────────────────────┴──────────────────────────┘
                                   │ JSON
                                   v
                            /api/v1/analytics/*
```

## 3) GenAI Integration

```text
Path A: Frontend chat
  dashboard/app/api/ai/chat/route.ts
      -> dashboard/lib/ai-service.ts
      -> OCI signed HTTP request (RSA-SHA256)
      -> OCI GenAI model response

Path B: Backend narratives
  finops_mcp/tools/genai_advisor.py
      -> generate_spend_narrative
      -> generate_anomaly_explanation
      -> generate_optimization_brief
      -> generate_maturity_narrative
      -> generate_budget_risk_alert
      -> generate_waste_insights
      -> generate_optimization_roadmap
      -> generate_executive_narrative
      -> consumed by /api/v1/genai/analyze
```

## 4) Hybrid Advisor Orchestration

```text
Client (Cost Advisor page)
      │
      └─► GET /api/v1/advisor/hybrid?narrative_type=optimization_roadmap
              │
              ├─ Deterministic block (source_of_truth)
              │    ├─ base analytics (risk, maturity, spend-at-risk)
              │    ├─ waste analysis (categories + quick wins)
              │    ├─ efficiency score (weighted grade)
              │    ├─ commitment gap (per-provider scenarios)
              │    └─ prioritized deterministic recommendations
              │
              └─ Advisory block (GenAI overlay)
                   ├─ waste_insights
                   ├─ optimization_roadmap
                   └─ executive_narrative

Contract:
- deterministic values remain authoritative for savings/ROI math
- GenAI text explains, prioritizes, and sequences actions
```

## 5) Account Hierarchy and Rollups

```text
Live scan or CSV import
      -> ProviderAccount / ProviderAccountLink
      -> ProviderAccountSnapshot / CostAllocationSnapshot
      -> _materialize_rollup_items()
      -> /api/v1/provider-accounts/rollups

Rollup result provides:
- hierarchical depth
- direct and rolled-up costs
- child counts
- top regions per account tree branch
```

## 6) Security and Configuration Highlights

- Auth disabled by default for public dashboard mode.
- When ENABLE_AUTH=true, RBAC uses OWNER/ADMIN/ANALYST/READONLY roles.
- CORS now uses explicit methods/headers instead of wildcard values.
- CSV import now enforces max upload size of 10 MB.
- `SECRET_KEY` now fails startup in production when insecure default is detected (warning only in non-production).
- Alembic runtime should use `DATABASE_URL`; local fallback is dev-only.

## 7) Deployment Model

- Terraform provisions OCI network baseline only.
- Ansible provisions app runtime, services, health checks.
- deploy/deploy-oci.sh handles image discovery, upload, environment render, and service restart.
- Primary OCI region for hosting and GenAI: uk-london-1.
