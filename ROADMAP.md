# OptiOra Roadmap

## Implemented

- FastAPI backend with credential metadata storage and scan-state tracking
- organization membership endpoints for tenant context
- provider diagnostics endpoint for cloud readiness checks without leaking secrets
- backend regression tests covering organization membership, customer scoping, and credential flows
- Next.js dashboard with credential setup, scanning setup, forecasting, recommendations, and operations readiness views
- laptop-driven OCI compute deployment
- Terraform OCI network baseline
- Ansible host provisioning for runtime packages, environment rendering, systemd services, dashboard build, and health checks
- dashboard credential form with inline per-provider setup guidance
- split credential form into separate "Test Connection" and "Save Credentials" steps
- real API calls for AWS, Azure, GCP, and OCI with deeper permission probes
- nginx reverse proxy with TLS via Let's Encrypt automation
- Alembic-managed database migration path
- persisted historical cost models through snapshot storage after each scan run

## Product Positioning

OptiOra is a modern multi-cloud FinOps platform focused on clear cost visibility, deterministic forecasting, explainable optimization, and a strong OCI-friendly deployment path.

The product is already well positioned to serve customers operating across AWS, Azure, GCP, and OCI, especially where a simpler and more transparent alternative is preferred over heavier enterprise FinOps platforms.

The next phase should not try to out-feature every competitor immediately. Instead, OptiOra should aim to become:

- the strongest OCI-friendly multi-cloud FinOps platform
- a highly explainable FinOps platform for engineering and finance teams
- a strong mid-market and FinOps-as-a-Service platform with lower complexity than traditional enterprise suites

## Current Strengths

### 1. Clean multi-cloud architecture

- single platform across AWS, Azure, GCP, and OCI
- clean backend and dashboard separation
- practical deployment path with OCI, Terraform, and Ansible
- modern and maintainable application stack

### 2. Explainable FinOps logic

- deterministic forecasting
- inspectable recommendation logic
- AI used as advisor and explanation layer rather than black-box decision maker
- transparent operational model for engineering and finance stakeholders

### 3. Strong OCI differentiation potential

- OCI-native deployment path already exists
- natural fit for Oracle customers with hybrid or multi-cloud strategies
- room to build stronger OCI-specific optimization and reporting than most competing tools

## High-Priority Next Steps

### 1. Complete multi-tenant behavior

This is the most important product milestone for commercial readiness.

- switch dashboard data endpoints from demo data to org-scoped live data
- expose organization switcher and team-management flows
- align credential ownership with organization boundaries
- introduce role-based access for admin, finance, engineering, and read-only personas
- enforce organization isolation in all data access paths
- add automated tenant-isolation regression tests

### 2. Expand automated test coverage

- add credential CRUD tests with mocked provider validators
- add scan approval and scan progress tests
- add migration round-trip tests for Alembic upgrades and downgrades
- add RBAC coverage tests
- add regression tests for tenant isolation and scoped reporting
- add endpoint contract tests for dashboard-critical APIs

### 3. Add enterprise account hierarchy support

This closes one of the biggest gaps versus more mature FinOps platforms.

- AWS Organizations support with multi-account scan orchestration
- Azure Management Groups support across multiple subscriptions
- GCP folder and organization-level billing aggregation
- OCI multi-compartment and multi-tenant aggregation where relevant
- consolidated account / subscription / project / compartment views
- region-level and account-level breakdown by provider

### 4. Improve reporting and operational visibility

- scan history browser in the dashboard
- per-scan diff view showing cost deltas versus previous snapshots
- cost trend views by provider, region, service, and account
- CSV export for cost, anomaly, forecast, and recommendation data
- Excel export for customer-friendly and finance-friendly reporting
- scheduled PDF digest for weekly and monthly summaries
- tokenized read-only report sharing

### 5. Add alerts and notifications

- budget threshold alerts with percentage and absolute value support
- anomaly notifications via email, Slack, and webhooks
- cost spike alerts with configurable sensitivity
- daily and weekly executive summaries
- alert routing by organization and team
- acknowledgement and mute options for noisy alerts

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
- spot / preemptible recommendations with risk and interruption context
- cross-region data transfer optimization analysis

## Containers and Kubernetes economics

These initiatives close the main gap versus Kubecost and container-cost-focused platforms.

- Kubernetes cost allocation by cluster, namespace, workload, and team
- cost views for shared clusters
- idle namespace and underutilized workload detection
- request / limit right-sizing recommendations
- node pool optimization suggestions
- unit economics for container-backed applications

## Differentiation Priorities

### 1. Become the best OCI-friendly FinOps platform

This is the clearest strategic differentiator.

- deepen OCI-specific cost intelligence beyond generic parity features
- add OCI-native views for compartments, budgets, tags, usage patterns, and recommendations
- create OCI optimization packs tailored to Oracle customers
- provide stronger OCI plus AWS / Azure / GCP positioning
- add reporting tailored to Oracle-centric enterprise environments

### 2. Preserve explainability as a product principle

This should remain one of OptiOra’s core product values.

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

- move access and refresh tokens from localStorage to secure HTTP-only cookies
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

### Scheduled background scans

- configurable daily and weekly scan schedules
- automatic scan retry policies
- scan window controls per provider or organization
- scheduled snapshot creation
- scan calendar / execution timeline view

### Reporting and exports

- CSV and Excel exports for all major datasets
- monthly PDF executive summary
- board-ready summary format
- engineering operations summary format
- budget variance and recommendation realization reports

### Developer and operations experience

- OpenAPI-generated TypeScript client for the dashboard
- stronger API documentation and endpoint examples
- improved local development bootstrap
- Terraform module for OCI load balancer fronting the application
- Ansible vault integration for production secret management
- better mobile responsiveness and dashboard usability
- admin views for health, diagnostics, and operational status

## Suggested Release Framing

### Release 0.9 — Enterprise Readiness

Goal: make the product commercially credible for real tenant-based usage.

- complete multi-tenant behavior
- add RBAC
- add tenant isolation testing
- add audit logging
- add scan history and snapshot diff views
- add CSV / Excel exports
- add budget alerts and Slack / email notifications

### Release 1.0 — Marketable FinOps Core

Goal: deliver a competitive FinOps core for multi-cloud customers.

- deliver multi-account and multi-subscription aggregation
- deliver chargeback / showback foundations
- add business mapping and tag normalization
- add executive dashboards
- publish OCI-first product positioning
- strengthen reporting for finance and procurement teams

### Release 1.5 — Optimization and Automation

Goal: move from visibility into guided cost action.

- add commitment analysis and recommendation workflows
- add rightsizing workflow and recommendation tracking
- add idle-resource remediation previews
- add approval-based auto-remediation
- add advanced anomaly workflows
- add first OCI-specific optimization packs

### Release 2.0 — Advanced FinOps Platform

Goal: become a differentiated and scalable multi-cloud FinOps platform.

- add Kubernetes cost allocation
- add unit economics views
- add stronger cross-provider governance
- add advanced automation policies
- add partner / MSP operational modes
- add white-label readiness where appropriate

## Summary

OptiOra already has a strong technical base and a clear product direction.

The most important next move is to close the commercial readiness gap through:

- complete multi-tenancy
- enterprise hierarchy support
- reporting and alerts
- stronger governance
- explainable optimization at scale

The strongest strategic path is to position OptiOra as:

A modern, explainable, OCI-friendly multi-cloud FinOps platform for mid-market enterprise customers, Oracle-centric environments, and FinOps-as-a-Service delivery models.
