# Release Notes

## Unreleased - Advisor and Rightsizing Live-Scan Polish (May 10, 2026)

### Added

- Cost Advisor decision snapshot with expandable quick wins, efficiency, evidence, provider-signal, and prompt-shortcut sections.
- Cost Advisor narrative selector now exposes every backend-supported advisory mode: roadmap, waste insights, tagging plan, operating review, executive summary, and sustainability.
- Recommendation ledger persistence for rightsizing recommendations, keyed by organization, provider, resource, recommendation source, and recommendation fingerprint.
- Finance-facing recommendation ledger endpoints: `GET /api/v1/recommendations/ledger`, `PATCH /api/v1/recommendations/ledger/{ledger_id}`, and `GET /api/v1/recommendations/ledger.csv`.
- Finance workbook `Recommendation Ledger` sheet with planned savings, realized savings, and variance columns.
- Rightsizing scan-status cockpit with scan mode, evidence source, provider scope, visible card count, live-scan running state, and fallback guidance.
- Rightsizing resource search across resource name, OCID, account, region, evidence source, action, and recommendation reason.
- Inline expandable execution details for each rightsizing card, including rationale, validation steps, rollout checks, and rollback plan.
- Public browser verification for the Rightsizing live provider scan path.

### Changed

- OCI deployment archives now align with repository hygiene rules by excluding local env files, virtualenvs, dashboard build output, `node_modules`, test reports, Terraform state/tfvars, local databases, logs, and scratch/evidence folders.
- Ansible source deployments now remove stale generated dashboard/cache/Terraform artifacts from earlier deployments before unpacking fresh source, while preserving runtime `.env`, `.oci`, `venv`, and `optiora.db`.
- Rightsizing live refresh now allows up to `120s` in the dashboard client. The deployed OCI live scan has been observed returning in about `50s`, which exceeded the previous `45s` client timeout.
- Rightsizing overview sections were reorganized behind expanders to reduce first-screen density while keeping live scan status and action summaries discoverable.
- Cost Advisor chat auto-scroll now scrolls only the conversation panel, preventing page-level scroll jumps and sticky-header overlap.
- Cost Advisor offline/backend-unreachable states now show operator-friendly guidance instead of raw `Failed to fetch` text.
- README, cost estimate, testing notes, deployment notes, architecture diagrams, and next-phase planning were refreshed to match the current deployed state.

### Fixed

- Fixed the live Rightsizing scan user experience where the backend completed successfully after roughly `50s`, but the frontend timed out at `45s` and incorrectly showed a fallback warning.
- Fixed stale go-live documentation that still described live OCI evidence as pending after the deployment verify gate had passed.
- Removed generated local cache directories with `scripts/cleanup-workspace.sh`.

### Validation

- `npm run lint --prefix dashboard`
- `npm run type-check --prefix dashboard`
- `npm run build --prefix dashboard`
- `npm audit --audit-level=high --prefix dashboard`
- `.venv/bin/python -m unittest discover -s tests -p 'test_*.py'` (`281` passing, `2` skipped)
- `.venv/bin/python -m pytest tests/test_rightsizing.py tests/test_rightsizing_oci_storage.py tests/test_deep_finops_analytics.py` (`35` passing)
- `terraform fmt -check` for tracked Terraform files and `terraform -chdir=terraform validate`
- `ansible-playbook --syntax-check -i ansible/inventory.example.yml ansible/playbooks/site.yml`
- Public live Rightsizing API: `GET /api/v1/recommendations/rightsizing?provider=oci&min_savings=0&limit=1000&refresh_live=true` returned in about `50s` with `730` OCI recommendations.
- Public browser live-toggle check on `/dashboard/rightsizing`: rendered `730` cards with no console errors and no horizontal overflow.
- `./deploy/deploy-oci.sh compute` (`6m 25s`)
- `./deploy/deploy-oci.sh verify` (`48` passing, `0` failed, `3` skipped)

## 0.9.1 - UIX and Navigation Polish (May 10, 2026)

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
- `.venv/bin/python -m unittest discover -s tests -p 'test_*.py'` (`281` passing, `2` skipped)
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
