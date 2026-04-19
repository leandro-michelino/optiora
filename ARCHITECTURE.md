# OptiOra Architecture

Current as of April 2026 — Release 1.0 feature-complete.

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
│  Overview · Costs · Forecasting · Anomalies · Recommendations · Settings    │
│  FinOps Analytics:                                                           │
│    Unit Economics · Scorecards · Resource Inventory · Kubernetes Costs       │
│    Virtual Tags · Resource-Level Rightsizing                                 │
│  Account hierarchy rollups, allocation coverage, FOCUS export                │
│  Animated KPI surfaces: efficiency score, waste categories, commitment gap   │
│                                                                              │
│  App Router API: /api/ai/chat -> dashboard/lib/ai-service.ts -> OCI GenAI   │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ REST /api/v1/*
                                       v
┌──────────────────────────────────────────────────────────────────────────────┐
│                       FastAPI Backend (port 8000)                            │
│                                                                              │
│  Auth / RBAC              /auth/*                                            │
│  Credentials              /api/v1/credentials/*                              │
│  CSV imports              /api/v1/imports/costs/*                            │
│  Scanning + scheduler     /api/v1/scanning/*                                 │
│  Core dashboard data      /api/v1/costs | anomalies | recommendations       │
│  Forecasting              /api/v1/forecast                                   │
│  Forecast simulations      /api/v1/forecast/what-if                           │
│  Analytics family         /api/v1/analytics/*                                │
│    base · attribution · commitment-optimization · maturity                   │
│    unit-economics · cloud-waste · efficiency-score · commitment-gap          │
│  FinOps Intelligence                                                         │
│    Hybrid advisor         /api/v1/advisor/hybrid                             │
│    GenAI narratives       /api/v1/genai/analyze                              │
│    GenAI copilot pack     /api/v1/genai/copilot-pack                         │
│    Resource inventory     /api/v1/inventory/resources                        │
│    Kubernetes costs       /api/v1/analytics/kubernetes/cluster-cost          │
│    Scorecards             /api/v1/analytics/scorecards                       │
│    Virtual tags (CRUD)    /api/v1/virtual-tags/rules                         │
│    Virtual tags preview   /api/v1/virtual-tags/preview                       │
│    Rightsizing            /api/v1/recommendations/rightsizing                │
│  Account hierarchy        /api/v1/provider-accounts/*                        │
│  Business mapping         /api/v1/business-mapping/*                         │
│  Alerts / Audit / Exports /api/v1/alerts* | audit-logs* | reports/* | FOCUS │
└─────────────────────┬───────────────────────────────────┬────────────────────┘
                      │ SQLAlchemy ORM                    │ Provider / GenAI APIs
                      v                                   v
            ┌──────────────────────┐        ┌──────────────────────────────────┐
            │ SQLite (dev) /        │        │ AWS · Azure · GCP · OCI Cost APIs│
            │ PostgreSQL (prod)     │        │ OCI Generative AI Inference      │
            │                      │        │ (uk-london-1 default endpoint)   │
            │  organizations        │        └──────────────────────────────────┘
            │  users                │
            │  user_organizations   │
            │  credentials          │
            │  scan_runs            │
            │  provider_accounts    │
            │  provider_acct_links  │
            │  provider_acct_snaps  │
            │  imported_cost_records│
            │  cost_alloc_snapshots │
            │  cost_period_summaries│
            │  alert_routing_policies│
            │  export_jobs          │
            │  business_mapping_rules│
            │  chargeback_entries   │
            │  virtual_tag_rules    │  ← migration 0011
            │  credential_records   │  ← multi-provider cred store (0001)
            │  scanning_permissions │
            └──────────────────────┘
```

## 2) FinOps Analytics Pipeline

```text
              source data (live providers and/or imported CSV)
                                   │
                                   v
                    _cost_context aggregation helper
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
  - CVaR downside risk      - optimization cap        build_unit_economics()
  - budget guardrails       - provider findings       build_forecast_what_if()
  - backtesting (MAPE)      - action plan signals     build_scorecards()
         │                         │                          │
         └─────────────────────────┴──────────────────────────┘
                                   │ JSON
                                   v
                            /api/v1/analytics/*

  Supplementary engines (no analytics dependency):
    - _vtag_matches()         virtual tag rule evaluation (AND-combined conditions)
    - _DOWNSIZE_MAP           per-provider instance size downgrade ladder
    - 3-tier data fallback:   live snapshot → imported CSV → synthetic demo
```

## 3) GenAI Integration

```text
Path A: Frontend chat (Next.js App Router)
  /api/ai/chat/route.ts
      -> dashboard/lib/ai-service.ts
      -> OCI signed HTTP request (RSA-SHA256)
      -> OCI GenAI model response

Path B: Backend narratives (server-side, async-capable)
  finops_mcp/tools/genai_advisor.py
      generate_spend_narrative()
      generate_anomaly_explanation()
      generate_optimization_brief()
      generate_maturity_narrative()
      generate_budget_risk_alert()
      generate_waste_insights()
      generate_optimization_roadmap()
      generate_executive_narrative()
      generate_commitment_strategy()
          consumed by GET /api/v1/genai/analyze

Path C: Backend copilot bundle (single-call narrative package)
  POST /api/v1/genai/copilot-pack
      -> deterministic context assembly (analytics + forecast + commitment gap)
      -> selected narrative generators in genai_advisor
      -> narratives[] with fallback prompts when OCI GenAI is unavailable
```

## 4) Hybrid Advisor Orchestration

```text
Client (Cost Advisor page)
      │
      └─► GET /api/v1/advisor/hybrid?narrative_type=optimization_roadmap
              │
              ├─ Deterministic block  (source_of_truth — authoritative for $ math)
              │    ├─ base analytics  (risk, maturity, spend-at-risk)
              │    ├─ waste analysis  (categories + quick wins)
              │    ├─ efficiency score (weighted grade A–F)
              │    ├─ commitment gap  (per-provider scenarios)
              │    └─ prioritized recommendations
              │
              └─ Advisory block  (GenAI overlay — narrative only)
                   ├─ waste_insights
                   ├─ optimization_roadmap
                   └─ executive_narrative

Contract:
- Deterministic values remain authoritative for savings/ROI math.
- GenAI text explains, prioritizes, and sequences actions.
- Feature flag: virtual_tagging=true, rightsizing_resource_level=true (GET /api/v1/info)
```

## 5) Virtual Tag Engine

```text
Rule store (DB)
  virtual_tag_rules
    tag_key, tag_value                  ← tag being applied
    match_provider, match_service       ← AND-combined filter conditions
    match_region, match_account_id
    match_resource_type
    match_resource_name_contains
    match_team, match_environment
    priority (higher = applied first)
    is_active

Evaluation (GET /api/v1/virtual-tags/preview)
  for each cost item in active cost data:
    for rule in rules ordered by priority desc (active only):
      if _vtag_matches(rule, item):
        item.applied_tags[rule.tag_key] = rule.tag_value
        (continue — multiple keys can be assigned, first matching value per key wins)
  returns: coverage_percent, per-resource preview with applied_tags
```

## 6) Rightsizing Engine

```text
GET /api/v1/recommendations/rightsizing?provider=all&min_savings=10&limit=50

  5-tier data waterfall (first tier with usable data wins):

  Tier 1 — AWS Cost Explorer API
    Calls ce.get_rightsizing_recommendations() using stored AWS credentials.
    Returns real instance IDs, utilisation stats, projected savings.
    Requires: CredentialRecord with provider=aws and valid access_key/secret_key.

  Tier 2 — Azure Advisor API  (azure-mgmt-advisor)
    Calls AdvisorManagementClient.recommendations.list() filtered to
    Cost category using stored Azure credentials.
    Requires: CredentialRecord with provider=azure and valid tenant/client/secret.

  Tier 3 — Cost-trend signal from ProviderAccountSnapshot history
    Uses the last 2+ snapshots per account to compute a deterministic
    growth trend; accounts whose cost grew >10 % MoM generate a
    "reserve" or "modernize" recommendation.

  Tier 4 — Imported CSV cost-signal analysis
    Examines ImportedCostRecord rows grouped by service_name to detect
    services consuming a disproportionate share of spend and emits
    deterministic rightsizing candidates.

  Tier 5 — Synthetic examples  (zero-data orgs only)
    Produced only when Tiers 1–4 yield no results; clearly flagged as
    is_synthetic=True and confidence="low" in the response.

  Response: RightsizingResponse
    total_resources_analyzed, rightsizable_count
    total_monthly_savings_usd, total_annual_savings_usd
    recommendations[]  (ranked by monthly_savings_usd desc)
      - per-item: resource_id, provider, current_type, recommended_type,
                  monthly_savings_usd, confidence, action, effort, is_synthetic
```

## 7) Account Hierarchy and Rollups

```text
Live scan or CSV import
      -> ProviderAccount / ProviderAccountLink
      -> ProviderAccountSnapshot / CostAllocationSnapshot
      -> _materialize_rollup_items()
      -> GET /api/v1/provider-accounts/rollups

Rollup result provides:
- hierarchical depth (parent → child accounts)
- direct and rolled-up costs
- child counts
- top regions per account tree branch
```

## 8) Security and Configuration

```text
Secret management:
  SECRET_KEY   — RuntimeError on startup if production + insecure default detected
  ENABLE_AUTH  — defaults false; WARNING logged if false + ENVIRONMENT=production
  auth_enabled  — RBAC roles: OWNER / ADMIN / ANALYST / READONLY

Transport:
  CORS         — explicit methods/headers (no wildcard)
  CSV import   — 10 MB limit enforced, UTF-8 validated
  Rate limits  — login / password-reset: 8 attempts / 900 s (process-local;
                 NOT safe for multi-replica — post-1.0: replace with Redis)

Database:
  DATABASE_URL      → explicit override
  OCI_DB_*          → composed to PostgreSQL URL if DATABASE_URL absent
  SQLite fallback   → dev / CI only (placeholder detection via _is_placeholder())

Migrations:
  0001 → … → 0011 (chain intact, all indexes present)
  Upgrade: alembic upgrade head
```

## 9) Deployment Model

```text
Terraform    → provisions OCI network baseline (VCN, subnets, security lists)
Ansible      → provisions app runtime (Python venv, systemd services, health checks)
setup.sh --interactive → guided end-to-end TF vars + plan/apply + Ansible inventory/playbook
deploy-oci.sh→ image discovery, upload, environment render, service restart
OCI region   → uk-london-1 (hosting + GenAI inference)

Environment:
  .env.example   → canonical reference for all 40+ env vars
  REQUIRE_LIVE_PROVIDER_DATA=true  → 503 when only CSV/demo data present (production)
  REQUIRE_LIVE_PROVIDER_DATA=false → CSV-only evaluation (PoC mode)
```
