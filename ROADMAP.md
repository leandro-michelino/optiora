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

- deploy the current public-dashboard build onto OCI
- validate CSV upload, imported dataset activation, and cost page correctness
- validate credential add, scan approval, scan start, and live provider reads where live billing access is in scope
- confirm scan history, diff, alerts, and CSV exports in the deployed environment
- verify dashboard pages are using live backend data paths rather than placeholders
- finalize the operational runbook for repeatable redeploys

### 2. Expand automated regression coverage

- add public-mode dashboard regression coverage
- add API tests for role-based authorization boundaries
- add integration tests for org-switch isolation across credentials, scans, imports, and analytics
- add migration round-trip tests for Alembic upgrades and downgrades
- add deeper CSV import validation cases for malformed headers, bad encodings, and multi-provider datasets
- add endpoint contract tests for dashboard-critical APIs

### 3. Add enterprise account hierarchy support

This closes one of the biggest gaps versus more mature FinOps platforms.

- AWS Organizations support with multi-account scan orchestration
- Azure Management Groups support across multiple subscriptions
- GCP folder and organization-level billing aggregation
- OCI multi-compartment and multi-tenant aggregation where relevant
- consolidated account, subscription, project, and compartment views
- region-level and account-level breakdown by provider

### 4. Improve reporting and operational visibility

- cost trend views by provider, region, service, and account
- richer CSV import validation previews, mapping feedback, and reconciliation guidance
- multi-sheet Excel workbooks for finance-friendly reporting
- scheduled PDF digest for weekly and monthly summaries
- tokenized read-only report sharing

### 5. Add alerts and notifications

- alert routing by organization and team
- mute windows, escalation policies, and acknowledgement SLAs
- cost spike alerts with configurable sensitivity
- daily and weekly executive summaries
- acknowledgement history and noise-reduction analytics

## Competitive Gap Closure

## Enterprise FinOps maturity

These initiatives close the main gap versus platforms such as Cloudability, Flexera One, and CloudHealth.

- chargeback and showback by business unit, application, team, environment, and owner
- customizable business mapping and tag normalization
- budget management by organization, account, subscription, project, and cost center
- executive dashboards for finance, procurement, and leadership
- organization-scoped audit trail for credential changes, approvals, and policy actions
- stronger governance views for anomaly resolution and optimization tracking

## Commitment and savings automation

These initiatives close the main gap versus Spot by NetApp, Harness CCM, and other optimization-focused products.

- reserved instance and savings plan coverage analysis
- commitment recommendation engine by provider
- rightsizing workflow with approval, execution history, and rationale
- idle resource cleanup recommendations with dry-run preview
- auto-remediation flows with approval gates
- spot and preemptible recommendations with risk and interruption context
- cross-region data transfer optimization analysis

## Containers and Kubernetes economics

These initiatives close the main gap versus Kubecost and container-cost-focused platforms.

- Kubernetes cost allocation by cluster, namespace, workload, and team
- cost views for shared clusters
- idle namespace and underutilized workload detection
- request and limit right-sizing recommendations
- node pool optimization suggestions
- unit economics for container-backed applications

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

- deliver multi-account and multi-subscription aggregation
- deliver chargeback and showback foundations
- add business mapping and tag normalization
- add executive dashboards
- publish OCI-first product positioning
- strengthen reporting for finance and procurement teams

Implementation detail for this release is tracked in `RELEASE_1_0_BACKLOG.md`.

### Release 1.5 - Optimization and Automation

Goal: move from visibility into guided cost action.

- add commitment analysis and recommendation workflows
- add rightsizing workflow and recommendation tracking
- add idle-resource remediation previews
- add approval-based auto-remediation
- add advanced anomaly workflows
- add first OCI-specific optimization packs

### Release 2.0 - Advanced FinOps Platform

Goal: become a differentiated and scalable multi-cloud FinOps platform.

- add Kubernetes cost allocation
- add unit economics views
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
