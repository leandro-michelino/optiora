# Release Notes

## 0.9.0 - Public Dashboard Readiness (May 9, 2026)

This release frames OptiOra as an OCI-hosted multi-cloud FinOps platform with a public dashboard posture by default, optional auth/RBAC hardening, real-data-only analytics, and repeatable Terraform + Ansible deployment flow.

### Added

- Provider-native and stored-snapshot recommendation paths for AWS, Azure, GCP, and OCI.
- Rightsizing dashboard behavior that defaults to stored scan/import data and can opt into live refresh when operators request it.
- Snapshot fallback for recommendation cost context when live provider context has no current data but persisted live scan snapshots exist.
- Regression coverage for recommendation fallback behavior and copied-placeholder provider configuration.
- ASCII architecture diagrams for data-source policy, configuration wiring, and release gate flow.

### Changed

- Backend, dashboard, package metadata, and generated OpenAPI schema now report version `0.9.0`.
- `.env.example` now leaves provider credentials blank and uses `REQUIRE_LIVE_PROVIDER_DATA=false` for local quick start / CSV-only PoC mode.
- Production deployment remains live-provider-required by default because Ansible renders `REQUIRE_LIVE_PROVIDER_DATA=true`.
- Cost estimates now call out stored-snapshot reuse, live-refresh cadence, scheduler usage, nginx front-door mode, and optional PostgreSQL/ADB choices.

### Fixed

- Example provider placeholder values such as `your_aws_access_key` no longer satisfy live-provider readiness validation.
- Live rightsizing requests in the dashboard now show stored scan results when live provider refresh fails, instead of leaving the page in a hard failure state.
- Recommendation generation can use persisted scan snapshots when current live provider context returns `no_data_available`.
- Documentation now consistently links release notes, testing gates, architecture diagrams, deployment flow, and data-source policy.

### Validation

- Backend syntax gate: `python3 -m py_compile $(find ./finops_* -name '*.py')`.
- Backend regression suite: `278` tests passing via `unittest discover` (`2` skipped).
- Dashboard gates: `npm run type-check`, `npm run lint`, and `npm run build`.
- Infrastructure and hygiene gates: `terraform -chdir=terraform validate`, `./scripts/check-animated-svg-routes.sh`, and `./scripts/cleanup-workspace.sh`.
- Full release-gate commands are documented in [TESTING.md](TESTING.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

### Upgrade Notes

- Local developers using `.env.example` should copy the updated blank provider defaults and set real cloud credentials only when needed.
- Operators who require live-provider-only startup should leave `REQUIRE_LIVE_PROVIDER_DATA` unset or set it to `true`.
- Public dashboard mode remains the default deployment posture; enable `ENABLE_AUTH=true` and `NEXT_PUBLIC_ENABLE_AUTH=true` only for hardened deployments.
