# OptiOra Architecture

Current as of May 11, 2026.

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
| - Refresh buttons send force-refresh hints for fresh reads    |
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
| Response cache                                                |
| - JSON GET /api/v1/* cache, 5-minute TTL by default           |
| - active-entry warmer refreshes cached keys every 5 minutes   |
| - force_refresh=true / no-cache bypasses and repopulates      |
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
| - FinOps control tower          /api/v1/analytics/control-tower |
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
        | SQLAlchemy ORM                   | Provider and GenAI/RAG APIs
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
| - recommendation_ledger     |
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

## Dashboard Response Cache

```text
dashboard page load
        |
        | GET /api/v1/* JSON
        v
FastAPI response cache
        |
        +-- HIT: return recent real API/CSV/provider-derived response
        |
        +-- MISS: execute backend endpoint and store successful JSON
        |
        +-- BYPASS: user Refresh sends force_refresh=true/no-cache
             |
             v
        execute backend endpoint and replace cached entry

successful POST/PUT/PATCH/DELETE /api/v1/* or /auth/*
        |
        v
clear cached reads so writes are visible immediately

background warmer, every 5 minutes
        |
        v
refresh active cached keys through the same ASGI app with force_refresh=true
```

The cache is process-local and bounded. It is intentionally used only for
dashboard JSON `GET /api/v1/*` responses. Health/info endpoints, export/download
routes, scan-progress polling, and live rightsizing requests are excluded. Cached
responses are still real responses from provider APIs, stored snapshots, or
customer CSV imports; the cache never creates synthetic data.

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
            - build_finops_control_tower()
```

## FinOps Control Tower

```text
current cost context + historical snapshots + budget policy
        |
        v
/api/v1/analytics/control-tower
        |
        +--> forecast risk lane
        |    - forecast diagnostics
        |    - budget breach guardrails
        |    - confidence and tail-risk exposure
        |
        +--> waste lane
        |    - waste categories
        |    - quick-win execution queue
        |
        +--> commitment lane
        |    - provider commitment gaps
        |    - annual opportunity
        |
        +--> governance lane
        |    - tagging/allocation coverage
        |    - virtual-tag and policy-gate recommendations
        |
        +--> decision lane
        |    - stability / balanced / acceleration frontier
        |    - payback, confidence, execution risk
        |
        +--> RAG by lane
        |    - finops_control_tower
        |    - budget_risk
        |    - waste_insights
        |    - commitment_strategy
        |    - tagging_strategy
        |    - decision_intelligence
        |
        +--> GenAI advisory prompt/narrative
             - advisory only; numeric outputs remain deterministic
```

This control tower is the consolidation layer for dense intelligence screens. It
reduces page-to-page context switching by putting forecast, waste, commitment,
governance, and decision signals into the Advanced FinOps page while preserving
specialized pages where the user journey is genuinely different.

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

## Recommendation Ledger And Realized Savings

```text
rightsizing recommendations
        |
        v
/api/v1/recommendations/rightsizing
        |
        +--> deterministic recommendation rows
        |    - provider, account, resource, source, fingerprint
        |    - current/projected monthly cost
        |    - planned monthly and annual savings
        |
        v
recommendation_ledger
        |
        +--> finance update path
        |    PATCH /api/v1/recommendations/ledger/{ledger_id}
        |    - owner
        |    - status
        |    - realized savings
        |    - variance reason
        |
        +--> finance exports
        |    GET /api/v1/recommendations/ledger
        |    GET /api/v1/recommendations/ledger.csv
        |    executive workbook: Recommendation Ledger sheet
        |
        +--> realized savings scorecards
             GET /api/v1/analytics/scorecards
             - by provider
             - by owner
             - by business unit
             - by realized month
```

Business-unit grouping is derived from recommendation evidence first, then from
normalized cost dimensions (`cost_center`, `team`, or `application`) when a
ledger row can be matched to observed provider/service/region context. Missing
business-unit attribution remains explicit as `(unassigned)`.

## Dashboard UIX Information Architecture

```text
Dashboard shell
        |
        +--> Workspace
        |    Overview, My Dashboards, Billing & Allocation, Account Hierarchy, Portfolio
        |
        +--> Intelligence
        |    AI Insights, Cost Advisor, Forecasting
        |
        +--> FinOps
        |    Unit Economics, Scorecards, Advanced FinOps, Cloud Resources,
        |    Kubernetes, Virtual Tags, Rightsizing
        |
        +--> Operations
             Operations, Admin Diagnostics, Anomalies, Recommendations, Settings

Shared UIX behavior
        |
        +--> synonym-aware navigation search
        +--> active-page helper text in sticky header
        +--> expandable evidence/details sections on dense pages
        +--> explicit empty/unavailable states when real data is missing
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

Dashboard client
  refresh_live=false -> 10s responsive stored-signal path
  refresh_live=true  -> 120s provider-native live path
                        (observed OCI live refresh about 50s)

Backend default path (refresh_live=false)
  Tier 1  Stored provider recommendation rows from previous scans
  Tier 2  Snapshot trend analysis
  Tier 3  Imported CSV cost-signal analysis

Backend live refresh path (refresh_live=true)
  Tier 1  Provider-native usage and rightsizing signals when available
  Tier 2  Provider inventory and configuration heuristics
  Tier 3  Stored scan snapshots when live context returns no data
  Tier 4  Imported CSV cost-signal analysis

No synthetic recommendation tier
If no eligible real signals exist: empty recommendation list with no_data_available source
```

## Recommendation Ledger

```text
GET /api/v1/recommendations/rightsizing
    |
    +--> normalize recommendation row
    |       provider
    |       resource_id / resource_name / resource_type
    |       evidence_source
    |       action, confidence, effort
    |       planned monthly and annual savings
    |
    +--> fingerprint
    |       sha256(provider + resource + source + action + sizing + savings + reason)
    |
    +--> recommendation_ledger upsert
            unique key:
              organization_id
              provider
              resource_id
              recommendation_source
              recommendation_fingerprint

Finance visibility
    |
    +--> GET /api/v1/recommendations/ledger
    +--> PATCH /api/v1/recommendations/ledger/{ledger_id}
    |       realized savings, owner, status, variance reason
    +--> GET /api/v1/recommendations/ledger.csv
    +--> /api/v1/reports/finance-workbook.xlsx
            Recommendation Ledger sheet:
              planned savings
              realized savings
              variance
```

## Rightsizing Dashboard UX Wiring

```text
/dashboard/rightsizing
        |
        +--> Scan Status expander
        |     - mode: stored or live provider scan
        |     - evidence source and load timestamp
        |     - provider scope and visible card count
        |     - friendly live-scan running/fallback messages
        |
        +--> Filters And Search expander
        |     - provider filter
        |     - action filter
        |     - product filter
        |     - search by resource, OCID, account, region, evidence, reason
        |
        +--> Executive Summary expander
        |     - resources analyzed
        |     - rightsizable count
        |     - monthly savings
        |     - non-compute savings
        |
        +--> Savings/action expanders
        |     - product category breakdown
        |     - downsize / terminate / reserve / modernize mix
        |
        +--> Resource Recommendations expander
              - compact evidence card per recommendation
              - inline Execution details disclosure
              - console deep links where provider scope is known
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
        +--> backend /api/v1/genai/rag-guidance
        |       |
        |       +--> dashboard /api/ai/chat
        |       |       |
        |       |       +--> dashboard/lib/ai-service.ts
        |       |       +--> signed OCI GenAI chat request
        |       |
        |       +--> Cost Advisor RAG answer fallback when direct GenAI is unavailable
        |
        v
genai_advisor prompt composer
        |
        +--> deterministic numbers (source of truth)
        +--> retrieved guidance context (RAG)
        +--> backend /api/v1/genai/analyze and analytics overlays
        |
        v
OCI GenAI narrative when configured
        |
        +--> prompt/RAG fallback when GenAI is disabled or unavailable
```

## Deployment Model

```text
Terraform
  - VCN, public subnet, route table, security list
  - Object Storage archive bucket + lifecycle policy
  - optional Resource Scheduler policy/schedules
  - optional compute instance
  - optional app/data block volume attachment
  - deploy outputs: instance_id, instance_public_ip, subnet_id, bucket

Ansible
  - host packages
  - Python environment
  - Node.js/dashboard build
  - runtime .env and OCI GenAI config/key material
  - service deployment
  - systemd units for API and dashboard
  - nginx/front-door configuration
  - host firewall/hardening
  - health checks

Deploy script
  ./deploy/deploy-oci.sh menu|full|compute|status|verify

Execution order (full/menu flow)
  1) resolve operator inputs and write terraform.tfvars
  2) terraform init/validate/plan/apply
  3) read Terraform compute and network outputs
  4) wait for SSH and data-volume readiness
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
  laptop -> deploy-oci.sh full
        -> single OCI VM
        -> Terraform VCN/subnet/security list + optional data volume
        -> FastAPI + Next.js + SQLite
        -> direct ingress (3000/8000) or optional nginx (80/443)

medium profile
  laptop -> deploy-oci.sh full
        -> Terraform OCI baseline + single VM + managed PostgreSQL
        -> FastAPI + Next.js + PostgreSQL
        -> direct ingress or nginx/TLS front door

enterprise profile
  laptop -> deploy-oci.sh full + policy hardening
        -> Terraform OCI baseline + single VM + managed PostgreSQL + scheduler
        -> strict ingress CIDRs, optional web-only exposure, auth/RBAC enabled
        -> FastAPI + Next.js + PostgreSQL + GenAI narrative overlays
```

## Runtime Configuration Architecture

```text
.env / environment variables
        |
        +--> Frontend runtime
        |     NEXT_PUBLIC_* + server-side OCI GenAI credentials
        |     dashboard/app/api/ai/chat/route.ts stays server-side
        |     dashboard/lib/ai-service.ts resolves "~/" key paths
        |     fetches backend /api/v1/genai/rag-guidance for RAG context
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
  - OCI live inventory scans discover the tenancy home region first
  - OCI scans enumerate tenancy subtree compartments with ANY, then ACCESSIBLE fallback
  - OCI regional resources are scanned across subscribed regions
  - documented placeholders like your_aws_access_key are treated as unset
```

## Deployment Configuration Resolution

```text
Operator input
  |
  +--> OCI_COMPARTMENT_ID / TF_VAR_compartment_id
  |        |
  |        v
  |     deploy-oci.sh
  |        |
  |        +--> rejects blank/placeholder OCIDs
  |        +--> writes terraform/terraform.tfvars compartment_id
  |        +--> exports TF_VAR_compartment_id for Terraform
  |
  +--> terraform/terraform.tfvars
           |
           +--> laptop_cidr
           +--> oci_object_storage_namespace
           +--> compute_enabled, shape, OCPU, memory
           +--> image OS/version and optional image compartment
           +--> SSH public key
           +--> optional extra block volume settings

End-to-end flow
  Terraform OCI baseline
      -> VCN/subnet/security list/object bucket
      -> compute instance + optional block volume
      -> instance_id / instance_public_ip outputs
      -> source archive upload
      -> Ansible temporary inventory + vars
      -> systemd services + smoke verification
```

## Dashboard Wiring Architecture

```text
README.md
  |
  +--> dashboard/public/optiora-animated.svg
  |       |
  |       +--> scene classes: scene1..scene5
  |       +--> nav classes:   nav1..nav5
  |       +--> prefers-reduced-motion static first scene
  |       +--> /api/v1/* labels checked by scripts/check-animated-svg-routes.sh
  |
  +--> dashboard/app/page.tsx
          |
          +--> public preview scene registry
          +--> pause-on-hover/focus rotation
          +--> reduced-motion stop condition
          +--> auth-enabled redirect to /dashboard when already signed in

dashboard/app/dashboard/page.tsx
  |
  +--> dashboard/lib/api.ts
          |
          +--> requestJson()
          +--> responseErrorMessage()
          +--> strips HTML/Next.js 404 payloads before AlertDescription
```

## Local Cleanup Boundary

```text
./scripts/cleanup-workspace.sh
  |
  +--> removes generated artifacts
  |     - dashboard/.next
  |     - dashboard/test-results
  |     - dashboard/playwright-report
  |     - dashboard/tsconfig.tsbuildinfo
  |     - terraform/.terraform
  |     - terraform/tfplan
  |     - .tmp/tmp scratch directories
  |     - Python cache directories and duplicate-copy files
  |
  +--> preserves local runtime/dependency state
        - .venv and .venv313
        - dashboard/node_modules
        - optiora.db
        - terraform/*.tfstate
        - terraform/terraform.tfvars
```

## Release Documentation Wiring

```text
pyproject.toml + finops_mcp/__init__.py + dashboard/package.json
        |
        v
version 0.9.2
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
   +--> dashboard build -> type-check -> lint
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

## Current Live Verification Path

```text
local workspace
   |
   +--> npm lint/type-check/build
   +--> targeted backend pytest slices
   +--> deploy/deploy-oci.sh full
   |
   v
OCI VM 140.238.90.95
   |
   +--> API health 200
   +--> dashboard route 200
   +--> /api/v1/recommendations/rightsizing?provider=oci&refresh_live=true
   |       -> completes in about 50s
   |       -> returns OCI recommendations from real provider/snapshot signals
   |
   +--> deploy/deploy-oci.sh verify
           -> 48 passed, 0 failed, 3 skipped

Latest May 11, 2026 verification also covered:
   - Terraform + Ansible redeploy from the local workspace
   - server-side OCI GenAI chat route wiring
   - backend RAG retrieval and GenAI prompt context injection
   - runtime OCI GenAI config in uk-london-1
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

## Contact / Pilot

Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot
