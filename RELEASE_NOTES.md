# Release Notes

## 0.9.1 - Dashboard Wiring and Repository Hygiene (May 10, 2026)

This maintenance release tightens the animated dashboard experience, production
error handling, validation order, documentation, and local cleanup behavior.

### Added

- Pause-aware animated dashboard preview with scene metadata for overview,
  resource inventory, and Kubernetes namespace views.
- Reduced-motion handling for both the public dashboard preview and the
  animated SVG asset used in the README.
- Production smoke wiring checks for the animated SVG asset, desktop dashboard,
  mobile dashboard, and backend-unavailable dashboard state.
- ASCII architecture notes for dashboard asset/API wiring, validation order, and
  workspace cleanup boundaries.

### Changed

- API error handling now strips framework HTML/Next.js 404 payloads before
  surfacing messages in dashboard alerts.
- Shared alert layout now aligns title and description content correctly on
  narrow screens.
- Workspace cleanup now removes generated dashboard build/test artifacts and
  Terraform plugin/plan cache while preserving virtualenvs, installed
  dependencies, local databases, and Terraform state.
- Cost estimates now call out the current shape-only compute basis, extra block
  volume performance basis, and GenAI character-metered cost driver.
- Dashboard dependency metadata now matches the Next.js runtime requirement
  (`node >=20.9.0`) and pins the PostCSS audit override used by Next.

### Fixed

- Animated SVG scene navigation highlights now match the active scene.
- Static/reduced-motion SVG rendering no longer stacks all dashboard scenes on
  top of each other.
- Public dashboard warning alerts no longer leak raw HTML error pages when the
  backend is unavailable or API paths return 404.
- End-to-end OCI deployment now resolves Terraform `public_subnet_id`/`vcn_id`
  outputs before compute launch, so `full` mode provisions into the network
  baseline it just applied.
- Live-provider cost trends now emit a current-period trend point when live
  costs are available but historical scan snapshots have not been captured yet.

### Validation

- `./scripts/check-animated-svg-routes.sh`
- `cd dashboard && npm run build`
- `cd dashboard && npm run type-check`
- `cd dashboard && npm run lint`
- `cd dashboard && npm audit --audit-level=high`
- `python3 -m py_compile $(find ./finops_mcp -name '*.py')`
- `python -m unittest discover -s tests -p 'test_*.py'` (`278` passing, `2` skipped)
- tracked Terraform `fmt -check` + `validate`
- `ansible-playbook --syntax-check -i ansible/inventory.example.yml ansible/playbooks/site.yml`
- Live OCI `./deploy/deploy-oci.sh full`, follow-up `compute`, and
  `./deploy/deploy-oci.sh verify` (`48` passing, `0` failed, `3` skipped)
- Production browser smoke: `/optiora-animated.svg`, desktop `/dashboard`,
  mobile `/dashboard`, and friendly backend error state.

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

## Contact / Pilot

Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot
