# OptiOra Roadmap

## Implemented

- FastAPI backend with credential metadata storage and scan-state tracking
- workspace-scoped CSV billing import with persisted imported cost records
- organization membership endpoints for tenant context
- provider diagnostics endpoint for cloud readiness checks without leaking secrets
- backend regression tests covering organization membership, customer scoping, credential flows, and CSV import flows
- Next.js dashboard with credential setup, CSV upload, scanning setup, forecasting, recommendations, and operations readiness views
- laptop-driven OCI compute deployment
- Terraform OCI network baseline
- Ansible host provisioning for runtime packages, environment, systemd services, dashboard build, and health checks
- dashboard credential form with inline per-provider setup guidance (what credentials to obtain and where)
- animated SVG dashboard preview in README
- split credential form into separate "Test Connection" and "Save Credentials" steps
- secure session flow with HTTP-only auth cookies and refresh rotation
- active organization switcher in dashboard with `/auth/organization/select`
- org-scoped credential and scan ownership (`org-<id>` customer scope) enforced server-side
- authenticated dashboard data endpoints for costs, anomalies, recommendations, forecast, and analytics
- real API calls for AWS, Azure, GCP, and OCI with deeper permission probes
- nginx reverse proxy with TLS via Let's Encrypt automation
- Alembic-managed database migration path
- persisted historical cost models through snapshot storage after each scan run
- organization-scoped audit logging for credential, alert, and scan events
- persisted budget alerts with acknowledgement support
- scan history browser, scan diff workflow, and CSV exports
- public-by-default dashboard access with optional auth hardening
- region-level cost breakdown across providers and aggregated dashboard views
- scheduled scan runner with approval-based cadence checks
- external AWS anomaly ingestion into normalized alert events
- enterprise hierarchy federation across AWS Organizations, Azure Management Groups, GCP folders/organizations, and OCI tenancies/compartments
- consolidated account, subscription, project, compartment, region, and provider rollup views
- business mapping, tag normalization, chargeback/showback, allocation coverage, and finance-ready exports
- executive CSV/XLS/XLSX reports, finance workbooks, PDF digest download, tokenized report sharing, and FOCUS CSV/JSON exports
- external GCP budget Pub/Sub ingestion with dedupe and audit trail
- connector framework for CloudHealth, Spot, and OpenCost
- Kubernetes namespace cost allocation and OpenCost sync MVP
- Kubernetes workload/team/node-pool allocation with request and node-pool recommendations
- MSP customer portfolio endpoint and white-label configuration response
- forecast champion/challenger model diagnostics with data quality, drift flags, and GenAI model-risk prompts
- unit economics, scorecards, virtual tags, decision-grade recommendations, and resource-level rightsizing endpoints
- alert lifecycle states, routing-policy simulator, destination tests/toggles/status, data freshness observability, and channel delivery telemetry
- RAG-grounded intelligence workflows (`/api/v1/genai/rag-guidance`, `/api/v1/analytics/finops-intelligence`) with retrieved FinOps benchmark context injected into GenAI prompts

## Current Deployment Stance

The current product direction is intentionally simple for customer rollout:

- customers open the dashboard directly
- default deployment is a single public workspace
- CSV billing import is the first supported customer data-ingestion workflow
- authentication and RBAC remain optional hardening for a later deployment, not a current blocker

That keeps the immediate focus on deployment stability, customer data ingestion readiness, and reporting depth rather than mandatory access-control expansion.

## Product Positioning

OptiOra is a modern multi-cloud FinOps platform focused on clear cost visibility, deterministic forecasting, explainable optimization, and a strong OCI-friendly deployment path.

The product is already well positioned to serve customers operating across AWS, Azure, GCP, and OCI, especially where a simpler and more transparent alternative is preferred over heavier enterprise FinOps platforms.

The next phase should not try to out-feature every competitor immediately. Instead, OptiOra should aim to become:

- the strongest OCI-friendly multi-cloud FinOps platform
- a highly explainable FinOps platform for engineering and finance teams
- a strong mid-market and FinOps-as-a-Service platform with lower complexity than traditional enterprise suites

## High-Priority Next Steps

### 1. Validate deployment and customer workflow

Status: **remaining live-environment gate**. Local code and automated coverage are in place, but a real OCI deployment still needs a dated evidence run.

- deploy the current public-dashboard build onto OCI
- validate CSV upload, imported dataset activation, and cost page correctness with real/customer-like data
- validate credential add, scan approval, scan start, and live provider reads where live billing access is in scope
- confirm scan history, diff, alerts, and CSV/XLSX/PDF/FOCUS exports in the deployed environment
- verify dashboard pages are using live backend data paths rather than placeholders
- finalize the operational runbook with the exact deploy, rollback, migration, and smoke-test commands used

### 2. Expand automated regression coverage

Status: **substantially complete locally; keep expanding through laptop-run regressions**.

- public-mode API/data-path regression coverage exists
- role-boundary and org-switch isolation tests exist for credentials, scans, imports, and analytics
- Alembic upgrade/downgrade round-trip coverage exists
- CSV import validation covers malformed and rejected rows; keep adding bad encoding/header edge cases as discovered
- endpoint contract tests exist for dashboard-critical APIs; keep extending with new dashboard routes

### 3. Add enterprise account hierarchy support

This closes one of the biggest gaps versus more mature FinOps platforms.

Status: **implemented as MVP**.

- AWS Organizations support with multi-account scan orchestration
- Azure Management Groups support across multiple subscriptions
- GCP folder and organization-level billing aggregation
- OCI multi-compartment and tenancy/compartment aggregation
- consolidated account, subscription, project, and compartment views
- region-level and account-level breakdown by provider

### 4. Improve reporting and operational visibility

Status: **implemented as MVP; scheduled delivery remains**.

- cost trend views by provider, region, service, and account
- CSV import validation previews with mapping feedback
- multi-sheet Excel workbooks for finance-friendly reporting
- PDF digest download for weekly and monthly summaries
- tokenized read-only report sharing
- remaining: scheduled email delivery of report digests

### 5. Add alerts and notifications

Status: **core implemented with advanced ops policy + scheduler controls; scheduled delivery remains**.

- alert routing by organization and severity/channel matrix
- destination toggles, test endpoint, delivery status, last-success/last-error telemetry
- cost spike/budget alerts and external AWS/GCP anomaly ingestion
- acknowledgement, dismissal, reactivation, and audit history
- mute windows, escalation policies, acknowledgement SLAs, scheduler retry/backoff controls, and executive alert summary APIs implemented
- remaining: daily/weekly delivered executive summaries and deeper noise-reduction analytics

## Execution Checklist (Now / Next / Blocked-by-live-access)

### Now

- [x] expand smoke gate coverage for export + scan release paths (CSV/XLS/XLSX/PDF/FOCUS + scan history/diff)
- [x] enforce strict fail-fast behavior in dashboard fetch layer when live backend data is unavailable
- [x] run release-critical dashboard live-data gate against backing APIs (fail on fallback/placeholder sources)
- [x] generate a dated deployment evidence pack for deploy/migration/smoke/live-credential-flow logs
- [x] keep roadmap sections consolidated and remove duplicate competitive/backlog tracking

### Next

- [ ] run full local regression pass after each major dashboard/backend change (`pytest`, dashboard `lint/type-check/build`, smoke script)
- [ ] keep extending endpoint contract coverage for new dashboard routes and export/report variants
- [ ] track recommendation-lifecycle and policy-automation scope as the next differentiation slice

### Blocked-by-live-access

- [ ] validate credential add/test for at least one real provider in deployed OCI
- [ ] approve and start a real scan, then capture terminal completion evidence
- [ ] capture deployed export proofs for CSV/XLS/XLSX/PDF/FOCUS
- [ ] attach one dated end-to-end evidence pack run as the release gate artifact

## Competitive Parity Status (Merged May 2026)

This section consolidates the former competitive planning docs into the roadmap.

### External benchmark inputs

- Google Cloud Billing budget/anomaly delivery patterns (Pub/Sub semantics, automation model)
- Azure Cost Management budget/alert lifecycle and scope controls
- Datadog CCM allocation/monitoring operational patterns
- Cloudability positioning around maturity, commitment optimization, and business mapping
- FinOps Foundation capability model for ingestion, forecasting, reporting, and governance

### Current parity position

- No blocking parity gaps remain for the original Phase 0/1 scope.
- Core parity features for alert lifecycle, routing, ingestion reliability, and freshness observability are implemented in MVP form.
- Near-term focus should move from parity completion to differentiation depth and live OCI evidence runs.

### Competitive backlog status bands

#### P0 (Start now)

- Budget alert delivery controls for email/Slack/Teams: **Concluded (MVP)**
- Scheduler operations visibility (status/timeline/next-run signals): **Concluded**
- External anomaly ingestion (AWS first): **Concluded**

#### P1 (Near-term)

- Export jobs and run history: **Concluded (MVP)**
- GCP budget Pub/Sub ingestion with dedupe/audit trail: **Concluded (MVP)**
- Hierarchical rollup budget fields: **Concluded (MVP)**
- Connector framework (CloudHealth/Spot/OpenCost): **Concluded (MVP)**

#### P2 (Expansion)

- Kubernetes/OpenCost cost-allocation depth: **Concluded (MVP)**
- Multi-destination alert routing matrix: **Concluded (MVP)**
- Finance-ready report packs and business mapping outputs: **Concluded (MVP)**

### Recommended immediate competitive slice

- Add stronger decision confidence and realization windows to recommendation workflows, then track planned-vs-realized outcomes.

## Competitive Gap Refresh (May 2026)

Based on current platform state vs. mainstream FinOps products (Cloudability, Flexera, Harness CCM, Datadog CCM, Kubecost), these are the highest-value capability gaps that still matter in enterprise evaluations:

### P0 - Next 1-2 releases

- **Recommendation lifecycle and realized savings accounting**
  - Competitor pattern: explicit recommendation lifecycle and post-action savings tracking.
  - OptiOra gap: we generate recommendations but do not yet track plan -> approved -> executed -> realized with variance.
  - Roadmap action: add recommendation ledger, owner assignment, execution timestamping, and realized-vs-expected savings scorecards.

- **Policy-as-code automation engine for FinOps controls**
  - Competitor pattern: customizable policy engines with dry-run, approvals, and automated actions.
  - OptiOra gap: we have alert/routing and remediation hooks, but no full policy authoring + action orchestration layer.
  - Roadmap action: introduce policy objects, rule simulation, manual approval steps, and action runners (stop/resize/tag/schedule).

- **Commitment execution orchestration (not only analysis)**
  - Competitor pattern: commitment management with automated or guided purchase execution and utilization guardrails.
  - OptiOra gap: commitment analytics are strong, but purchase/execution workflow is not implemented.
  - Roadmap action: add commitment action queue, approval workflow, and utilization drift alerts for purchased commitments.

- **Scheduled stakeholder reporting (email/subscription workflow)**
  - Competitor pattern: perspective/report schedules and recurring stakeholder delivery.
  - OptiOra gap: report generation exists; scheduled outbound delivery is still pending.
  - Roadmap action: deliver scheduled email digests with per-role templates and acknowledgment telemetry.

### P1 - Near-term enterprise parity

- **Cost planning workspace with fiscal calendars and delegated ownership**
  - Competitor pattern: budget + forecast planning workspaces with fiscal periods and delegated planners.
  - OptiOra gap: forecast/budget insights exist but no multi-owner planning workbook workflow.
  - Roadmap action: create planning entities (plan, owner, period, baseline, target), variance workflows, and approvals.

- **Advanced anomaly model governance and lookback recalculation**
  - Competitor pattern: anomaly reprocessing windows and severity reclassification as billing backfills land.
  - OptiOra gap: anomaly handling exists; formal lookback recalculation governance is limited.
  - Roadmap action: implement rolling anomaly recompute window, severity drift tracking, and anomaly SLA policy controls.

- **Engineering workflow integrations for actionability**
  - Competitor pattern: direct ticketing/action integration in optimization loops.
  - OptiOra gap: Jira token exists but no full bidirectional recommendation workflow.
  - Roadmap action: recommendation-to-ticket lifecycle with status sync (Jira/ServiceNow), owner reminders, and completion evidence.

### P2 - Differentiation opportunities

- **Data cloud optimization lane (Snowflake/Databricks)**
  - Competitor pattern: dedicated warehouse/query optimization and autonomous tuning recommendations.
  - OptiOra gap: no first-class data cloud cost model today.
  - Roadmap action: add connectors, query/warehouse efficiency metrics, and rightsizing recommendations for data cloud spend.

- **High-fidelity Kubernetes network/GPU cost attribution by default**
  - Competitor pattern: deep pod-level network and GPU allocation with stronger attribution controls.
  - OptiOra gap: Kubernetes analytics exist, but default attribution depth can be expanded.
  - Roadmap action: expand network/GPU allocation fidelity, add explicit confidence/coverage indicators, and surface tuning playbooks.

- **Unified cloud + SaaS cost observability**
  - Competitor pattern: unified cloud and SaaS spend attribution and governance.
  - OptiOra gap: cloud-first scope; SaaS cost lane is limited.
  - Roadmap action: add SaaS cost ingestion schema + allocation rules + FinOps reporting convergence.

## Consolidated Competitive Backlog Ownership

To avoid duplicate planning lanes, use these as the single sources of truth:

- `Competitive Gap Refresh (May 2026)` for parity and enterprise-evaluation deltas (`P0/P1/P2`)
- `Differentiation Priorities` for product-positioning bets
- `Enhancements` for implementation backlog slices that map to release milestones

## Differentiation Priorities

### 1. Become the best OCI-friendly FinOps platform

This is the clearest strategic differentiator.

- deepen OCI-specific cost intelligence beyond generic parity features
- add OCI-native views for compartments, budgets, tags, usage patterns, and recommendations
- create OCI optimization packs tailored to Oracle customers
- provide stronger OCI plus AWS, Azure, and GCP positioning
- add reporting tailored to Oracle-centric enterprise environments

### 2. Preserve explainability as a product principle

This should remain one of OptiOra's core product values.

- keep cost and savings logic deterministic and inspectable
- use AI for explanation, prioritization, and scenario planning
- expose rationale, expected impact, and confidence for every recommendation
- provide recommendation history and traceability
- maintain auditability for AI-assisted outputs

### 3. Win the mid-market and FinOps-as-a-Service segment

This is the best near-term commercial path.

- simplify onboarding for consultancies and MSPs
- support multi-customer operational views
- reduce setup complexity versus heavy enterprise suites
- enable white-label or partner-friendly operational modes
- provide customer-by-customer reporting and alert routing
- make deployment and administration efficient for smaller FinOps teams

## Security and Platform Hardening

### Authentication and session handling

- add CSRF protection for cookie-authenticated write endpoints
- enforce strict production cookie settings (`Secure`, `SameSite`, domain/path review)
- add session expiration management and device/session visibility
- support enterprise SSO via SAML and OIDC
- add stronger password, recovery, and account-protection flows

### Secrets and compliance

- adopt production-grade secrets handling beyond env-file patterns
- integrate vault-based secret retrieval where needed
- strengthen credential lifecycle visibility and rotation workflows
- add immutable audit log retention options
- improve compliance posture for enterprise reviews

### Scalability and performance

- introduce Redis caching for API response optimization
- add async task queue for long-running scans and report generation
- implement pagination for large result sets
- improve long-running scan orchestration and resilience
- optimize multi-provider aggregation for larger customer environments

## Enhancements

### Multi-account and multi-region support

- optional organization account hierarchy visualization for AWS OUs and Azure Management Group descendants
- account-level tagging policy drift report for missing owner and cost-center tags
- cross-provider normalized account inventory with owner, environment, and business-unit context
- region-level anomaly detection beyond total-cost alerts

### Scheduled background scans

- scheduler UI controls to override cadence per organization without direct API use
- retry and backoff policy for transient cloud API errors
- scheduler health alerts when scans are overdue

### Alerting and notifications

- budget threshold alerts with configurable percentages and absolute limits
- anomaly email, Slack, and webhook notifications
- cost spike alerting with configurable sensitivity per provider

### Cost optimization recommendations

- spot and preemptible instance recommendations with interruption-rate context
- reserved instance and savings plan purchase workflow beyond analysis
- idle resource auto-remediation with dry-run preview and approval step
- cross-region data-transfer cost analysis

### Reporting and exports

- expanded CSV and Excel exports for cost snapshots, anomalies, and recommendations
- scheduled PDF digest email for weekly and monthly reporting
- shareable cost report URLs with read-only tokens

### Developer and operations experience

- OpenAPI-generated TypeScript client for the dashboard
- stronger API documentation and endpoint examples
- improved local development bootstrap
- Terraform module for OCI load balancer fronting the application
- Ansible vault integration for production secret management
- better mobile responsiveness and dashboard usability
- admin views for health, diagnostics, and operational status

## Suggested Release Framing

### Release 0.9 - Public Dashboard Readiness

Goal: make the product deployable, demoable, and operationally credible with direct dashboard access.

Status: **readiness baseline (`0.9.0`) with current packaged maintenance release `0.9.1`**. See [RELEASE_NOTES.md](RELEASE_NOTES.md).

- keep dashboard access public by default
- preserve auth and RBAC only as optional hardening
- validate org-scoped credential, CSV import, scan, alert, and export flows
- add audit logging
- add scan history and snapshot diff views
- add CSV exports
- add CSV billing import
- add budget alerts and notification foundations
- prove repeatable OCI deployment with migrations

### Release 1.0 - Marketable FinOps Core

Goal: deliver a competitive FinOps core for multi-cloud customers.

Status: **feature-complete MVP; live OCI validation and evidence pack are the release gate**.

- deliver multi-account and multi-subscription aggregation
- deliver chargeback and showback foundations
- add business mapping and tag normalization
- add executive dashboards
- publish OCI-first product positioning
- strengthen reporting for finance and procurement teams

Implementation detail for this release is tracked in `NEXT_PHASE.md`.

### Release 1.5 - Optimization and Automation

Goal: move from visibility into guided cost action.

- add commitment purchase workflows beyond analysis
- deepen rightsizing workflow with approval, execution history, realized savings, and real cloud utilization metrics
- add idle-resource remediation previews tied to provider actions
- deepen approval-based auto-remediation from guardrail simulation into operator-controlled execution
- add advanced anomaly workflows, mute windows, escalation policies, and noise analytics
- add first OCI-specific optimization packs

### Release 2.0 - Advanced FinOps Platform

Goal: become a differentiated and scalable multi-cloud FinOps platform.

Status: **initial MVP implemented for Kubernetes depth, MSP portfolio, white-label configuration, and forecast model governance; keep deepening operational workflows**.

- deepen Kubernetes cost allocation with persisted OpenCost pod/workload history and allocation exports
- deepen unit economics views with benchmark history and product/workload trends
- deepen forecast governance with stored model diagnostics and approval snapshots
- add stronger cross-provider governance
- add advanced automation policies
- add partner and MSP operational modes
- add white-label readiness where appropriate

## Summary

OptiOra already has a strong technical base and a clear product direction.

The most important next move is to close the commercial readiness gap through:

- stable public deployment
- live multi-cloud validation
- enterprise hierarchy support
- stronger reporting and alerts
- explainable optimization at scale

The strongest strategic path is to position OptiOra as a modern, explainable, OCI-friendly multi-cloud FinOps platform for mid-market enterprise customers, Oracle-centric environments, and FinOps-as-a-Service delivery models.

## Contact / Pilot

Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot
