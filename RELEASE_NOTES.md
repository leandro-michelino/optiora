# Release Notes

## Unreleased - UIX and Navigation Polish (May 10, 2026)

### Added

- Searchable dashboard navigation so operators can jump to dense FinOps screens without scanning the full sidebar.
- Accessible skip-to-content link in the dashboard shell for keyboard and assistive-technology users.
- Playwright coverage for precise active navigation state and sidebar search behavior.

### Changed

- Dashboard navigation active-state matching now treats `/dashboard` as the Overview page only, avoiding false active highlights on every nested dashboard route.
- The duplicate Kubernetes namespace page was consolidated into the canonical Kubernetes page, with the old URL handled by a Next.js redirect.
- Credential setup and scan approval forms now use consistent shared form styling, stronger dark-mode support, lucide icons, and typed scan-frequency handling.
- Operations export tests now open the relevant expander before asserting controls, matching the lower-density UI.
- Playwright backend startup now explicitly sets `REQUIRE_LIVE_PROVIDER_DATA=false` so local `.env` live-provider requirements cannot break the CSV/import-mode e2e harness.
- OCI deployment configuration now rejects baked or placeholder compartment OCIDs, resolves the target from env/`TF_VAR_*`/`terraform.tfvars`, and keeps Terraform plus OCI CLI calls aligned during full deployments.
- Workspace cleanup now removes `.tmp` scratch databases and Playwright reports in addition to generated dashboard, Python, and Terraform cache artifacts.

### Fixed

- Scrubbed the live-looking OCI compartment OCID from examples, Ansible defaults, environment templates, and deployment docs.
- Fixed the guided Terraform + Ansible path so `OCI_COMPARTMENT_ID` is exported to Terraform as `TF_VAR_compartment_id` and written into `terraform/terraform.tfvars`.

### Validation

- `bash -n deploy/deploy-oci.sh scripts/cleanup-workspace.sh dashboard/scripts/playwright-backend.sh dashboard/scripts/playwright-frontend.sh`
- `python3 -m py_compile $(find ./finops_mcp -name '*.py')`
- `.venv/bin/python -m unittest discover -s tests -p 'test_*.py'` (`279` passing, `2` skipped)
- `terraform fmt -check` on tracked `.tf` files
- `terraform validate`
- `ansible-playbook --syntax-check -i ansible/inventory.example.yml ansible/playbooks/site.yml`
- `cd dashboard && npm audit --audit-level=high`
- `cd dashboard && npm run lint`
- `cd dashboard && npm run build`
- `cd dashboard && npm run type-check`
- `cd dashboard && npm run test:e2e`
- `./scripts/check-animated-svg-routes.sh`
- `./scripts/cleanup-workspace.sh`

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
