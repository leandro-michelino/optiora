# OptiOra Roadmap

## Implemented

- FastAPI backend with credential metadata storage and scan-state tracking
- organization membership endpoints for the tenant context
- provider diagnostics endpoint for cloud readiness checks without leaking secrets
- backend regression tests covering organization membership, customer scoping, and credential flows
- Next.js dashboard (opens directly, no login required) with credential/scanning setup and operations readiness checks
- laptop-driven OCI compute deployment
- Terraform OCI network baseline
- Ansible host provisioning for runtime packages, environment, systemd services, dashboard build, and health checks
- dashboard credential form with inline per-provider setup guidance (what credentials to obtain and where)
- animated SVG dashboard preview in README
- split credential form into separate "Test Connection" and "Save Credentials" steps
- ~~Replace remaining provider fallback logic~~ — real API calls for AWS, Azure, GCP, OCI; deeper permission probes
- ~~reverse-proxy / TLS front door~~ — nginx Ansible role with Let's Encrypt certbot + renewal cron
- ~~managed database migration path~~ — Alembic with initial schema migration covering all tables
- ~~persisted historical cost models~~ — CostSnapshot ORM table; snapshots captured after each scan run

## High-Priority Next Steps

### 1. Complete multi-tenant behavior

- switch dashboard data endpoints from demo data to org-scoped live data
- expose organization switcher and team-management flows
- align credential ownership with organization boundaries where needed

### 2. Expand automated tests

- add credential CRUD tests with mocked provider validators
- add scan approval/progress tests
- add Alembic migration round-trip tests (upgrade + downgrade)

## Enhancements

### Multi-account and multi-region support

- AWS Organizations: scan across all member accounts via assume-role
- Azure Management Groups: aggregate costs across multiple subscriptions
- GCP folder / org-level billing aggregation
- region-level cost breakdown for each provider

### Scheduled background scans

- cron-triggered scan runner (configurable daily/weekly cadence)
- per-scan diff view showing cost changes since the previous snapshot
- scan history browser in the dashboard

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

### Developer and operations experience

- OpenAPI-generated TypeScript client for the dashboard
- Terraform module for OCI load balancer fronting the nginx instance
- Ansible vault integration for secret management in production
- mobile-responsive dashboard improvements
- organization-scoped audit log for credential changes and scan approvals
