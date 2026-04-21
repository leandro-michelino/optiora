# OptiOra Architecture

Current as of April 2026.

## Runtime Topology

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                                 End Users                                    │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ HTTPS
                                       v
┌──────────────────────────────────────────────────────────────────────────────┐
│                      Next.js Dashboard (port 3000)                           │
│                                                                              │
│  Main surfaces                                                               │
│  - Overview, costs, anomalies, recommendations, forecasting                  │
│  - FinOps analytics, inventory, scorecards, chargeback, tagging             │
│  - AI advisor chat and advisory packs                                        │
│                                                                              │
│  App Router                                                                  │
│  - /api/ai/chat -> dashboard/lib/ai-service.ts -> OCI GenAI                  │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ REST /api/v1/*
                                       v
┌──────────────────────────────────────────────────────────────────────────────┐
│                       FastAPI Backend (port 8000)                            │
│                                                                              │
│  Core APIs                                                                   │
│  - Auth and RBAC              /auth/*                                        │
│  - Credentials                /api/v1/credentials/*                          │
│  - CSV import                 /api/v1/imports/costs/*                        │
│  - Scanning and scheduler     /api/v1/scanning/*                             │
│  - Costs, anomalies, recs     /api/v1/costs | anomalies | recommendations    │
│  - Forecasting                /api/v1/forecast*                              │
│  - Analytics                  /api/v1/analytics/*                            │
│  - Hybrid advisor             /api/v1/advisor/hybrid                         │
│  - GenAI narratives           /api/v1/genai/*                                │
│  - Provider accounts          /api/v1/provider-accounts/*                    │
│  - Business mapping           /api/v1/business-mapping/*                     │
│  - Virtual tags               /api/v1/virtual-tags/*                         │
│  - Rightsizing                /api/v1/recommendations/rightsizing            │
│  - Alerts, audit, exports     /api/v1/alerts* | audit-logs* | reports/*      │
└─────────────────────┬───────────────────────────────────┬────────────────────┘
                      │ SQLAlchemy ORM                    │ Provider and GenAI APIs
                      v                                   v
            ┌──────────────────────┐        ┌──────────────────────────────────┐
            │ SQLite (dev) /        │        │ AWS · Azure · GCP · OCI          │
            │ PostgreSQL (prod)     │        │ cost and usage endpoints         │
            │                      │        │ OCI Generative AI Inference      │
            │  organizations        │        │ default region: uk-london-1      │
            │  users                │        └──────────────────────────────────┘
            │  user_organizations   │
            │  credential_records   │
            │  scan_runs            │
            │  provider_accounts    │
            │  provider_account_links│
            │  provider_account_snaps│
            │  imported_cost_records│
            │  cost_alloc_snapshots │
            │  cost_period_summaries│
            │  alert_events         │
            │  alert_routing_policies│
            │  export_jobs          │
            │  export_job_runs      │
            │  business_mapping_rules│
            │  normalized_dimensions│
            │  virtual_tag_rules    │
            │  audit_logs           │
            └──────────────────────┘
```

## Textual Diagram – Final Architecture

OptiOra uses a Next.js dashboard as the user-facing control plane and a FastAPI backend as the system of record for FinOps analytics, forecasting, alerts, imports, and advisory flows. The backend stores normalized operational data in SQLite for local development or PostgreSQL for production. Runtime cost data enters the platform from live cloud-provider APIs or from imported CSV billing files. Deterministic analytics are computed first and remain authoritative for cost, savings, risk, and forecast math. OCI Generative AI is then used as a narrative and prioritization layer on top of those deterministic outputs, not as the source of truth for numbers.

## FinOps Analytics Pipeline

```text
source data (live providers and/or imported CSV)
        │
        v
_cost_context aggregation helper
        │
        v
finops_mcp/tools/finops_analytics.py
        │
        ├─ Forecasting
        │   - build_forecast()
        │   - build_forecast_what_if()
        │   - build_forecast_stress_test()
        │
        ├─ Core analytics
        │   - build_analytics()
        │   - build_cost_attribution()
        │   - build_commitment_optimization()
        │   - build_maturity_assessment()
        │   - build_unit_economics()
        │
        └─ Advanced analytics
            - build_cloud_waste_analysis()
            - build_cost_efficiency_score()
            - build_commitment_gap_analysis()
            - build_optimization_portfolio()
            - build_tagging_coverage_analytics()
            - build_sustainability_metrics()
            - build_cross_provider_comparison()
            - build_cost_anomaly_intelligence()
            - build_chargeback_summary()
```

## Forecasting Models

```text
Inputs
  - current spend
  - provider mix
  - historical monthly spend when available
  - budget threshold

Models
  - blended regression + smoothing baseline
  - deterministic Monte Carlo fan for p10/p50/p90/p95
  - downside CVaR tracking
  - what-if timeline simulation with phased actions
  - deterministic stress testing for demand, price, and execution shocks

Outputs
  - forecast timeline
  - confidence and quality metrics
  - budget breach probability
  - downside risk summary
  - scenario comparison and payback
```

## GenAI Integration

```text
Path A: Frontend chat
  /api/ai/chat/route.ts
      -> dashboard/lib/ai-service.ts
      -> OCI signed HTTP request
      -> OCI GenAI response

Path B: Backend narrative generation
  finops_mcp/tools/genai_advisor.py
      -> spend narratives
      -> anomaly explanations
      -> optimization briefs and roadmaps
      -> maturity and budget-risk narratives
      -> tagging, sustainability, chargeback, and comparison briefs
      -> alert triage and rightsizing narratives

Path C: Hybrid advisor
  /api/v1/advisor/hybrid
      -> deterministic analytics block
      -> advisory narrative block

Path D: Copilot pack
  /api/v1/genai/copilot-pack
      -> multi-narrative bundle driven by deterministic context
```

## How GenAI Is Used Beyond Forecasting

```text
GenAI is used for:
  - executive summaries for finance and leadership
  - anomaly explanation and triage guidance
  - optimization roadmaps and prioritization
  - commitment strategy narratives
  - tagging enforcement action plans
  - sustainability and ESG narratives
  - chargeback and showback reporting language
  - cross-provider comparison briefs
  - vendor negotiation talking points

GenAI is not used as the source of truth for:
  - savings math
  - forecast values
  - budget breach calculations
  - rightsizing economics
```

## Hybrid Advisor Contract

```text
Deterministic layer
  - authoritative for spend, risk, savings, ROI, payback, and forecast math

GenAI layer
  - explains findings
  - sequences actions
  - adapts language to stakeholder audience
  - provides fallback prompts when OCI GenAI is not configured
```

## Virtual Tag Engine

```text
Rule store
  virtual_tag_rules
    - tag_key, tag_value
    - match_provider, match_service, match_region
    - match_account_id, match_resource_type
    - match_resource_name_contains
    - match_team, match_environment
    - priority, is_active

Evaluation
  /api/v1/virtual-tags/preview
    -> applies rules in priority order
    -> first matching value wins per tag key
    -> returns preview coverage and applied tags
```

## Rightsizing Engine

```text
/api/v1/recommendations/rightsizing

Tier 1  AWS Cost Explorer rightsizing API
Tier 2  Azure Advisor recommendations
Tier 3  Snapshot trend analysis
Tier 4  Imported CSV cost-signal analysis
Tier 5  Synthetic fallback examples
```

## Deployment Model

```text
Terraform
  - OCI network baseline
  - canonical volume settings

Ansible
  - host packages
  - Python environment
  - service deployment
  - systemd units
  - health checks

Deploy script
  ./deploy/deploy-oci.sh menu|full|compute|status|verify

Primary OCI region
  uk-london-1
```

## Configuration and Security Notes

```text
- SQLite is for local development and CI
- PostgreSQL is the production target
- CORS is explicit, not wildcard
- CSV uploads are limited to 10 MB and UTF-8
- Authentication is optional but should be enabled for production
- OCI GenAI is optional; prompt-only fallback remains supported
- Process-local rate limiting exists today; distributed rate limiting should move to Redis in a future hardening phase
```
