# OptiOra Roadmap

## Implemented

- FastAPI backend with credential metadata storage and scan-state tracking
- organization membership endpoints for the tenant context
- provider diagnostics endpoint for cloud readiness checks without leaking secrets
- backend regression tests covering organization membership, customer scoping, and credential flows
- Next.js dashboard with authenticated routing, credential/scanning setup, and operations readiness checks
- laptop-driven OCI compute deployment
- Terraform OCI network baseline
- Ansible host provisioning for runtime packages, environment, systemd services, dashboard build, and health checks
- dashboard credential form with inline per-provider setup guidance (what credentials to obtain and where)
- animated SVG dashboard preview in README
- split credential form into separate "Test Connection" and "Save Credentials" steps
- secure session flow with HTTP-only auth cookies + refresh rotation
- active organization switcher in dashboard + `/auth/organization/select` backend endpoint
- org-scoped credential and scan ownership (`org-<id>` customer scope) enforced server-side
- authenticated dashboard data endpoints (`/costs`, `/anomalies`, `/recommendations`, `/forecast`, `/analytics`)
- expanded backend tests: credential CRUD, scan flow, org-switch flow, and Alembic upgrade/downgrade round-trip
- ~~Replace remaining provider fallback logic~~ — real API calls for AWS, Azure, GCP, OCI; deeper permission probes
- ~~reverse-proxy / TLS front door~~ — nginx Ansible role with Let's Encrypt certbot + renewal cron
- ~~managed database migration path~~ — Alembic with initial schema migration covering all tables
- ~~persisted historical cost models~~ — CostSnapshot ORM table; snapshots captured after each scan run
- ~~AWS Organizations member-account scanning~~ — optional `AWS_ORGANIZATION_ROLE_ARNS` assume-role aggregation with per-account rollups
- ~~Azure Management Group / multi-subscription aggregation~~ — supports `AZURE_MANAGEMENT_GROUP_ID` and `AZURE_SUBSCRIPTION_IDS`
- ~~GCP multi-project + folder/org context~~ — supports `GCP_PROJECT_IDS` with folder/org metadata context in scans
- ~~region-level cost breakdown~~ — cost summaries now expose `region_breakdown` per provider and aggregated dashboard `regionBreakdown`
- ~~scheduled scan runner~~ — background scheduler loop with approval-based cadence checks (`daily` / `weekly` / `hourly`)
- ~~per-scan diff view~~ — `/scanning/{scan_id}/diff` and CSV export for delta vs previous scan
- ~~scan history browser~~ — operations dashboard + `/scanning/history` API + CSV export

## High-Priority Next Steps

### 1. Team management and org administration

- invite/remove teammates
- role changes (`owner`, `admin`, `analyst`, `readonly`) with backend authorization checks
- org settings page (name/plan/status) and membership audit trail

### 2. Session hardening and auth security

- CSRF protection for cookie-authenticated write endpoints
- strict cookie policy in production (`Secure`, `SameSite`, domain/path review)
- optional session timeout + device/session listing and revocation UX

### 3. Automated test coverage expansion

- API tests for role-based authorization boundaries
- integration tests for org-switch isolation across credentials/scans/analytics
- frontend auth + organization switch flow tests

## Enhancements

### Multi-account and multi-region support

- optional organization account hierarchy visualization (parent/child) for AWS OUs and Azure MG descendants
- account-level tagging policy drift report (missing owner/cost-center tags)
- cross-provider normalized account inventory (owner, env, business unit)
- region-level anomaly detection (not just cost totals)

### Scheduled background scans

- scheduler UI controls (override cadence per organization without API call)
- scheduler SLO dashboard (last run, success/failure rate, next run ETA)
- retry/backoff policy for transient cloud API errors
- scheduler health alerts when scans are overdue

### Alerting and notifications

- budget threshold alerts with configurable % and absolute limits
- anomaly email/Slack webhook notifications
- cost spike alerting with configurable sensitivity per provider

### Cost optimization recommendations

- spot / preemptible instance recommendations with interruption-rate context
- reserved instance and savings plan purchase workflow (beyond analysis)
- idle resource auto-remediation with dry-run preview and approval step
- cross-region data-transfer cost analysis

### Reporting and exports

- CSV / Excel export for cost snapshots, anomalies, and recommendations
- scheduled PDF digest email (weekly / monthly)
- shareable cost report URLs with read-only token

### Performance and scalability

- Redis API response caching to reduce cloud provider API calls
- async background task queue (Celery or ARQ) for long-running scans
- pagination on cost and recommendation endpoints for large data sets
- provider API rate-limit aware batching and back-pressure controls

### Developer and operations experience

- OpenAPI-generated TypeScript client for the dashboard
- Terraform module for OCI load balancer fronting the nginx instance
- Ansible vault integration for secret management in production
- mobile-responsive dashboard improvements
- organization-scoped audit log for credential changes and scan approvals
