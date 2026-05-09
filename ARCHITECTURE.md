# OptiOra Architecture

Current as of May 9, 2026.

## Runtime Topology

```text
+----------------+
| End users      |
+-------+--------+
        |
        | HTTPS (optional nginx front door) or direct app ports
        v
+---------------------------------------------------------------+
| Next.js dashboard, port 3000                                  |
|                                                               |
| Surfaces                                                      |
| - Overview, costs, anomalies, recommendations, forecasting    |
| - FinOps analytics, inventory, scorecards, chargeback, tags   |
| - Kubernetes, MSP/customer portfolio, AI advisor              |
|                                                               |
| Frontend GenAI path                                           |
| - /api/ai/chat -> dashboard/lib/ai-service.ts -> OCI GenAI    |
+-------+-------------------------------------------------------+
        |
        | REST /api/v1/*
        v
+---------------------------------------------------------------+
| FastAPI backend, port 8000                                    |
|                                                               |
| Core APIs                                                     |
| - Auth and RBAC                 /auth/*                       |
| - Credentials                   /api/v1/credentials/*         |
| - CSV import                    /api/v1/imports/costs/*       |
| - Scanning and scheduler        /api/v1/scanning/*            |
| - Costs, anomalies, recs        /api/v1/costs|anomalies|recs  |
| - Forecasting and diagnostics   /api/v1/forecast*             |
| - Deep analytics                /api/v1/analytics/*           |
| - Resource intelligence         /api/v1/analytics/resource-intelligence |
| - VM utilization hotspots       /api/v1/analytics/vm-utilization-hotspots |
| - Operating review pack         /api/v1/analytics/operating-review |
| - Decision intelligence frontier /api/v1/analytics/decision-intelligence |
| - Hybrid advisor                /api/v1/advisor/hybrid        |
| - GenAI narratives              /api/v1/genai/*               |
| - Provider accounts             /api/v1/provider-accounts/*   |
| - Partner portfolio             /api/v1/partner/*             |
| - Business mapping              /api/v1/business-mapping/*    |
| - Virtual tags                  /api/v1/virtual-tags/*        |
| - Rightsizing                   /api/v1/recommendations/*     |
| - Alerts, audit, exports        /api/v1/alerts*|reports/*     |
+-------+----------------------------------+--------------------+
        |                                  |
        | SQLAlchemy ORM                   | Provider and GenAI APIs
        v                                  v
+-----------------------------+    +--------------------------------+
| SQLite dev / PostgreSQL prod|    | AWS, Azure, GCP, OCI           |
|                             |    | cost and usage endpoints       |
| Tables                      |    | OCI Generative AI Inference    |
| - organizations             |    | default region: uk-london-1    |
| - users, user_organizations |    +--------------------------------+
| - credential_records        |
| - scan_runs, cost_snapshots |
| - provider_accounts         |
| - provider_account_links    |
| - provider_account_snaps    |
| - imported_cost_records     |
| - cost_allocation_snapshots |
| - cost_period_summaries     |
| - alert_events              |
| - alert_routing_policies    |
| - export_jobs, export_runs  |
| - business_mapping_rules    |
| - normalized_dimensions     |
| - virtual_tag_rules         |
| - audit_logs                |
+-----------------------------+
```

Ingress control is enforced primarily at OCI security list level (`laptop_cidr`
and optional `allowed_public_ingress_cidrs`). The default Ansible profile also
manages host firewalld and keeps direct app ports closed when nginx front-door
mode is enabled.

## Textual Diagram - Final Architecture

OptiOra uses a Next.js dashboard as the user-facing control plane and a FastAPI backend as the system of record for FinOps analytics, forecasting, alerts, imports, and advisory flows. The backend stores normalized operational data in SQLite for local development or PostgreSQL for production. Runtime cost data enters the platform from live cloud-provider APIs or from imported CSV billing files. Deterministic analytics are computed first and remain authoritative for cost, savings, risk, and forecast math. OCI Generative AI is then used as a narrative and prioritization layer on top of those deterministic outputs, not as the source of truth for numbers.

## FinOps Analytics Pipeline

```text
source data (live providers and/or imported CSV)
        |
        v
_cost_context aggregation helper
        |
        v
finops_mcp/tools/finops_analytics.py
        |
        +-- Forecasting
        |   - build_forecast()
        |   - build_forecast_what_if()
        |   - build_forecast_stress_test()
        |   - build_forecast_model_diagnostics()
        |
        +-- Core analytics
        |   - build_analytics()
        |   - build_cost_attribution()
        |   - /api/v1/analytics/service-hotspots (cross-service ranking)
        |   - /api/v1/analytics/resource-intelligence (owner/creator and observed lifecycle cost)
        |   - /api/v1/analytics/vm-utilization-hotspots (CPU/memory + disk/network proxy ranking)
        |   - build_commitment_optimization()
        |   - build_maturity_assessment()
        |   - build_unit_economics()
        |
        +-- Advanced analytics
            - build_cloud_waste_analysis()
            - build_cost_efficiency_score()
            - build_commitment_gap_analysis()
            - build_optimization_portfolio()
            - build_tagging_coverage_analytics()
            - build_sustainability_metrics()
            - build_cross_provider_comparison()
            - build_cost_anomaly_intelligence()
            - build_chargeback_summary()
            - build_finops_operating_review()
            - build_decision_intelligence()
```

## Weekly Operating Review Pack

```text
cost context + provider mix + budget policy + recommendations
        |
        v
/api/v1/analytics/operating-review
        |
        +--> deterministic summary
        |    - spend, waste, risk, velocity
        |    - budget breach probability
        |    - tagging and chargeback governance gaps
        |
        +--> deterministic execution plan
        |    - top actions by savings signal
        |    - owner-aligned workstreams
        |
        +--> GenAI narrative overlay (optional)
             - generate_finops_operating_review()
             - prompt fallback when GenAI is not configured
```

## Decision Intelligence Frontier

```text
forecast diagnostics + commitment gap + waste + optimization portfolio
        |
        v
/api/v1/analytics/decision-intelligence
        |
        +--> deterministic scenario frontier
        |    - stability / balanced / acceleration
        |    - annual savings, execution risk, confidence, payback
        |
        +--> recommended sequence
        |    - 0-30 / 31-60 / 61-90 day execution phases
        |
        +--> RAG context injection
        |    - analysis_type=decision_intelligence
        |
        +--> GenAI decision memo (optional)
             - CFO/CTO recommendation and trade-off narrative
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

## Forecast Model Governance

```text
cost_snapshots / imported cost context
        |
        v
monthly history builder
        |
        +--> dedupe by month + provider, keeping latest capture
        |
        v
champion / challenger backtest
        |
        +--> naive_last_value
        +--> moving_average_3
        +--> linear_trend
        +--> provider_growth
        +--> blended_regression_smoothing
        |
        v
/api/v1/forecast/model-diagnostics
        |
        +--> champion model and wMAPE
        +--> data quality score
        +--> drift flags
        +--> model risk level
        +--> GenAI model-risk prompt or narrative

/api/v1/analytics/forecast-diagnostics
        |
        +--> budget burn-rate vs guardrails
        +--> sensitivity scenarios (conservative/balanced/aggressive)
        +--> high-risk months and recommended actions
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
  -> includes decision_intelligence narrative type

Path E: Model-risk advisory
  /api/v1/forecast/model-diagnostics
      -> deterministic champion/challenger metrics
      -> GenAI model-risk explanation for finance and engineering

Path F: Forecast diagnostics advisory
  /api/v1/analytics/forecast-diagnostics
      -> deterministic budget pressure and sensitivity
      -> GenAI budget-risk narrative context

Path G: RAG-guided advisory
  /api/v1/genai/rag-guidance
      -> local FinOps benchmark catalog retrieval (CSV-backed)
      -> ranked guidance snippets + sources
  /api/v1/analytics/finops-intelligence
      -> deterministic analytics block
      -> retrieved guidance context injection
      -> GenAI narrative with explicit retrieved context
      -> includes focus=decision_intelligence
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
  - forecast model-risk explanations
  - weekly FinOps operating review updates
  - scenario-frontier decision memos with trade-off analysis
  - MSP customer portfolio summaries and next-best-action prompts

GenAI is not used as the source of truth for:
  - savings math
  - forecast values
  - budget breach calculations
  - rightsizing economics
```

## MSP / Partner Portfolio

```text
partner user
    |
    v
user_organizations
    |
    +--> org A: imported costs, snapshots, accounts, scans, alerts
    +--> org B: imported costs, snapshots, accounts, scans, alerts
    +--> org N: imported costs, snapshots, accounts, scans, alerts
    |
    v
/api/v1/partner/customer-portfolio
    |
    +--> portfolio KPIs
    +--> customer health
    +--> white-label config from environment
    +--> dashboard /dashboard/portfolio
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

Default path (refresh_live=false)
  Tier 1  Stored provider recommendation rows from previous scans
  Tier 2  Snapshot trend analysis
  Tier 3  Imported CSV cost-signal analysis

Live refresh path (refresh_live=true)
  Tier 1  Provider-native usage and rightsizing signals when available
  Tier 2  Provider inventory and configuration heuristics
  Tier 3  Stored scan snapshots when live context returns no data
  Tier 4  Imported CSV cost-signal analysis

No synthetic recommendation tier
If no eligible real signals exist: empty recommendation list with no_data_available source
```

## Data Source Fallback Architecture

```text
dashboard request
        |
        v
FastAPI endpoint
        |
        +--> live provider APIs
        |       |
        |       +--> success: deterministic analytics/recommendations
        |       |
        |       +--> no data / provider error
        |              |
        |              v
        +------> latest persisted scan snapshots
        |              |
        |              +--> cost_snapshots
        |              +--> cost_allocation_snapshots
        |              +--> provider recommendation rows
        |
        +------> imported CSV billing rows (when policy allows)
        |
        v
explicit source metadata + provider_errors when partial

Rules
  - no synthetic cost, recommendation, forecast, or dashboard payloads
  - stored snapshots must originate from previous live provider scans
  - CSV imports must be customer-provided billing data
  - empty state is returned when no real source exists
```

## RAG Retrieval Pipeline

```text
Deterministic FinOps context
  - forecast diagnostics
  - budget guardrails
  - commitment gaps
  - tagging coverage
  - operating review signals
        |
        v
analysis_type + provider + context tokens
        |
        v
finops_mcp/tools/finops_rag.py
        |
        +--> load finops_mcp/data/finops_rag_catalog.csv
        +--> score entries by analysis/provider/token overlap
        +--> return top guidance snippets + sources + rag_brief
        |
        v
genai_advisor prompt composer
        |
        +--> deterministic numbers (source of truth)
        +--> retrieved guidance context (RAG)
        |
        v
OCI GenAI narrative (or prompt fallback when GenAI is disabled)
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
  - optional nginx/TLS front door

Deploy script
  ./deploy/deploy-oci.sh menu|full|compute|status|verify

Execution order (full/menu flow)
  1) terraform init/validate/plan
  2) optional terraform apply
  3) create/start compute
  4) attach extra block volume (when enabled)
  5) upload local source archive
  6) run ansible playbook
  7) smoke + live-data verification gates
  8) dated evidence pack generation

Primary OCI region
  uk-london-1
```

## Deployment Size Profiles

```text
small profile
  laptop -> deploy-oci.sh compute/full
        -> single OCI VM
        -> FastAPI + Next.js + SQLite
        -> direct ingress (3000/8000) or optional nginx (80/443)

medium profile
  laptop -> deploy-oci.sh full
        -> OCI network baseline + single VM + managed PostgreSQL
        -> FastAPI + Next.js + PostgreSQL
        -> direct ingress or nginx/TLS front door

enterprise profile
  laptop -> deploy-oci.sh full + policy hardening
        -> OCI network baseline + single VM + managed PostgreSQL + scheduler
        -> strict ingress CIDRs, optional web-only exposure, auth/RBAC enabled
        -> FastAPI + Next.js + PostgreSQL + GenAI narrative overlays
```

## Runtime Configuration Architecture

```text
.env / environment variables
        |
        +--> Frontend runtime
        |     NEXT_PUBLIC_* + OCI GenAI credentials
        |     dashboard/lib/ai-service.ts resolves "~/" key paths
        |
        +--> Backend runtime
              finops_mcp/config.py + tools/genai_advisor.py
              resolves "~/" and env-expanded file paths for:
                - OCI_CONFIG_FILE
                - OCI_PRIVATE_KEY_PATH

Validation rules
  - DEPLOYMENT_TARGET must be oci
  - OCI_RUNTIME_REQUIRED=true requires OCI instance metadata
  - REQUIRE_LIVE_PROVIDER_DATA=true requires at least one real provider config
  - documented placeholders like your_aws_access_key are treated as unset
```

## Release Documentation Wiring

```text
pyproject.toml + finops_mcp/__init__.py + dashboard/package.json
        |
        v
version 0.9.0
        |
        +--> FastAPI /health and OpenAPI schema
        +--> dashboard package metadata
        +--> README.md current release pointer
        +--> RELEASE_NOTES.md release history
        +--> TESTING.md validation commands
        +--> DEPLOYMENT.md OCI release gate
```

## Release Gate Architecture

```text
code change
   |
   +--> static python compile
   +--> backend regression suite
   +--> dashboard type-check/lint/build
   +--> terraform validate
   |
   v
deploy-oci.sh verify
   |
   +--> smoke_test_0_9.sh
   +--> live_data_gate.sh
   |
   v
generate_evidence_pack.sh -> artifacts/evidence/<timestamp>/SUMMARY.md
```

## Configuration and Security Notes

```text
- SQLite is for local development and laptop-run tests
- PostgreSQL is the production target
- CORS is explicit, not wildcard
- CSV uploads are limited to 10 MB and UTF-8
- Authentication is optional but should be enabled for production
- OCI GenAI is optional; prompt-only fallback remains supported
- Auto-remediation execution is disabled by default and guarded by ENABLE_AUTO_REMEDIATION
- Process-local rate limiting exists today; distributed rate limiting should move to Redis in a future hardening phase
```
