# Release Notes

## Unreleased - Repository Hygiene and OCI VM Naming (May 11, 2026)

### Changed

- Documented the Action Ledger provider resource naming boundary so the OCI VM table only shows real OCI Compute instance display names, while account, tenancy, and service aggregates remain in broader recommendation context.
- Standardized Terraform validation guidance on tracked `.tf` files plus `terraform -chdir=terraform validate`, avoiding local `terraform.tfvars` formatting noise.
- Cleanup scanning now skips Terraform provider cache directories before deleting generated infrastructure cache.

### Fixed

- Removed the last tracked non-OCI deployment target fixture from configuration tests; negative validation now uses a generic unsupported cloud target while preserving the OCI VM-only runtime policy.
- Fixed order-sensitive backend regression tests by force-refreshing cached reads after direct DB seeding and resolving the active organization id from the auth API instead of assuming `1`.

### Validation

- `python3 -m py_compile $(find ./finops_mcp -name '*.py')`
- `.venv/bin/python -m unittest discover -s tests -p 'test_*.py'` (`301` passing)
- `npm run build --prefix dashboard`
- `npm run type-check --prefix dashboard`
- `npm run lint --prefix dashboard`
- `terraform fmt -check terraform/*.tf`
- `terraform -chdir=terraform init -backend=false`
- `terraform -chdir=terraform validate`
- `ansible-playbook --syntax-check -i ansible/inventory.example.yml ansible/playbooks/site.yml`
- `./scripts/check-animated-svg-routes.sh`

## 0.9.2 - Advisor, Scorecards, Control Tower, and UIX Polish (May 10, 2026)

Repository release metadata:

- Current package version: `0.9.2`
- Current git tag: `v0.9.2`
- Current documentation baseline: May 11, 2026
- GitHub release notes source of truth: this file

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
- Repeatable operator walkthrough Playwright coverage for every main dashboard screen, active navigation state, consolidated Kubernetes routing, and broken UI state detection.
- `E2E_WALKTHROUGH_NOTES.md` with the human-style process log, fixes applied during the path, live OCI verification snapshot, and repeatable commands.
- Realized savings scorecards in `GET /api/v1/analytics/scorecards`, grouped by provider, owner, business unit, and realized month from recommendation ledger data.
- Page-by-page `UIX_REVIEW.md` covering every dashboard screen, applied improvements, cross-page standards, and a prioritized UX backlog.
- Live OCI Kubernetes/container inventory in `GET /api/v1/analytics/kubernetes/summary`, covering OKE clusters, OCI Container Instances, and OCIR repositories before billing rows are available.
- Focused Kubernetes E2E fixture resources in OCI: one OKE Basic cluster and one small Docker-backed OCI Container Instance for live page validation. These temporary resources were deleted after validation.
- Inventory Explorer cockpit for provider resource inventory and action rows, including provider share, type/region/account rollups, top resources, local search/sort, expandable rows, and a resource details drawer.
- Bounded API response cache for dashboard JSON `GET /api/v1/*` calls, with default `5` minute TTL, active-entry background warming every `5` minutes, and cache status headers.
- Unified FinOps Control Tower endpoint, `GET /api/v1/analytics/control-tower`, combining forecast risk, waste, commitment, governance, decision frontier, RAG evidence, and GenAI advisory prompts.
- FinOps Control Tower panel that surfaces the consolidated posture score, lane status, and RAG-backed action queue before specialist drill-down sections.
- Real OCI GenAI + RAG wiring for Cost Advisor chat and backend GenAI narratives: server-side OCI GenAI calls, backend RAG retrieval, and retrieved guidance injection into prompts.
- Terraform-managed compute/data-volume deployment flow with Ansible runtime provisioning driven from Terraform outputs.
- Optimization Advisor table for provider-native findings, showing Cloud Advisor-style recommendation type, count, service, category, estimated savings, importance, status, scope, and provider-console action.
- Provider API capability envelopes for AWS, Azure, GCP, and OCI, exposed through diagnostics and used to bound provider-native recommendation collection by scope, page size, parallelism, timeout, retryable errors, and throttling signals.

### Changed

- OCI deployment archives now align with repository hygiene rules by excluding local env files, virtualenvs, dashboard build output, `node_modules`, test reports, Terraform state/tfvars, local databases, logs, and scratch/evidence folders.
- Ansible source deployments now remove stale generated dashboard/cache/Terraform artifacts from earlier deployments before unpacking fresh source, while preserving runtime `.env`, `.oci`, `venv`, and `optiora.db`.
- Rightsizing navigation and page copy now use Optimization Advisor language, with live provider advisor scan enabled by default and storage cleanup called out first-class.
- OCI Cloud Advisor metadata is preserved through the rightsizing API response, including unattached volume recommendation counts, category, importance, and active status.
- Rightsizing live refresh now allows up to `120s` in the dashboard client. The deployed OCI live scan has been observed returning in about `50s`, which exceeded the previous `45s` client timeout.
- Optimization Advisor overview sections were reorganized behind expanders to reduce first-screen density while keeping live scan status, provider-native findings, and action summaries discoverable.
- API and dashboard systemd units now bound stop behavior so redeploys cannot hang indefinitely on multi-process worker shutdown.
- Dashboard dependency install and build now run as the runtime application user under Ansible, preventing partial or root-owned Next.js artifacts from producing deployed `_next/static` 500 errors.
- FinOps Scorecards now show finance-first realized savings summaries and expandable provider, owner, business-unit, and monthly scorecard tables.
- Kubernetes page language now distinguishes live resource inventory from metered spend and labels run-rate estimates clearly.
- Billing & Allocation now owns finance spend, chargeback, mapping, and export workflows, while Inventory Explorer owns resource-level investigation and explicitly labels whether the current rows come from live provider resource actions, account snapshots, or imported cost data.
- The former Cloud Resources page is renamed to Inventory Explorer and now prefers real OCI tenancy-level Optimizer resource/action rows instead of showing only a single tenancy aggregate when live resource data is available.
- Dashboard navigation now uses a job-based primary IA: Workspace, Intelligence, Optimize, and Operate carry the core workflows, while specialist screens are searchable and grouped under "More workflows" to reduce duplicate-feeling menu choices.
- Removed legacy Kubernetes namespace route wiring so `/dashboard/kubernetes` is the only Kubernetes, container, Docker, namespace, and OpenCost page.
- Cost Advisor chat auto-scroll now scrolls only the conversation panel, preventing page-level scroll jumps and sticky-header overlap.
- Cost Advisor offline/backend-unreachable states now show operator-friendly guidance instead of raw `Failed to fetch` text.
- Dashboard Refresh buttons now send `force_refresh=true`, `Cache-Control: no-cache`, and `X-OptiOra-Force-Refresh: true` so customer-initiated refreshes always bypass and repopulate the response cache.
- CORS now allows the force-refresh request header and exposes `X-OptiOra-Cache`, `X-OptiOra-Cache-Age`, and `X-OptiOra-Cache-TTL` for browser diagnostics.
- Successful mutating API calls now invalidate cached reads so imports, approvals, alert lifecycle actions, credentials, virtual tags, and finance updates are visible immediately.
- UIX review now documents the page-consolidation decision: keep specialized workflow pages, but unify dense executive intelligence inside FinOps Control Tower and rename the generic Recommendations surface to Action Ledger.
- Cleanup documentation now treats `/dashboard/kubernetes` as the only Kubernetes/container/Docker route, with no stale legacy redirect expectation.
- Workspace cleanup now removes broader duplicate-copy, editor leftover, and OS metadata artifacts while preserving runtime state and local dependency caches.
- README, cost estimate, testing notes, deployment notes, architecture diagrams, walkthrough notes, UIX review, and next-phase planning were refreshed to match the current deployed state.

### Fixed

- Fixed the live Rightsizing scan user experience where the backend completed successfully after roughly `50s`, but the frontend timed out at `45s` and incorrectly showed a fallback warning.
- Fixed stale go-live documentation that still described live OCI evidence as pending after the deployment verify gate had passed.
- Fixed the Kubernetes page blind spot where newly launched OCI container resources could be running but invisible until provider billing/cost APIs reported service spend.
- Fixed Kubernetes summary latency by prioritizing configured OCI compartments and bounding slower billing lookups, so live inventory rows reach the page before the dashboard fallback path.
- Removed generated local cache directories with `scripts/cleanup-workspace.sh`.
- Rebuilt the local backend virtualenv with supported Python `3.13` after the operator walkthrough found an unsupported Python `3.14` virtualenv.
- Reinitialized Terraform providers locally before validation after the walkthrough found a missing cached OCI provider package.
- Ignored Playwright `test-results` and `playwright-report` artifacts in the ESLint flat config so lint cannot race against E2E report creation or cleanup.

### Validation

- `npm run lint --prefix dashboard`
- `npm run type-check --prefix dashboard`
- `npm run build --prefix dashboard`
- `npm audit --audit-level=high --prefix dashboard`
- `npm run test:e2e --prefix dashboard`
- `cd dashboard && npx playwright test e2e/operator-walkthrough.spec.ts`
- `.venv/bin/python -m unittest discover -s tests -p 'test_*.py'` (`281` passing, `2` skipped)
- `.venv/bin/python -m pytest -q` (`287` passing)
- `.venv/bin/python -m pytest tests/test_scorecards.py -q` (`7` passing)
- `.venv/bin/python -m pytest tests/test_response_cache.py tests/test_config.py -q` (`17` passing)
- `.venv/bin/python -m pytest tests/test_genai_rag_wiring.py tests/test_genai_scope.py tests/test_config.py -q` (`36` passing)
- `.venv/bin/python -m pytest tests/test_kubernetes.py -q` (`17` passing)
- `.venv/bin/python -m pytest tests/test_rightsizing.py tests/test_rightsizing_oci_storage.py tests/test_deep_finops_analytics.py` (`35` passing)
- `terraform fmt -check` for tracked Terraform files and `terraform -chdir=terraform validate`
- `ansible-playbook --syntax-check -i ansible/inventory.example.yml ansible/playbooks/site.yml`
- Live recommendation ledger contracts: `GET /api/v1/recommendations/ledger`, `GET /api/v1/recommendations/ledger.csv`, and `GET /api/v1/analytics/finops-intelligence`.
- Live RAG guidance contract: `POST /api/v1/genai/rag-guidance`.
- Public live Rightsizing API: `GET /api/v1/recommendations/rightsizing?provider=oci&min_savings=0&limit=1000&refresh_live=true` returned in about `50s` with `730` OCI recommendations.
- Public browser live-toggle check on `/dashboard/rightsizing`: rendered `730` cards with no console errors and no horizontal overflow.
- Public browser check on `/dashboard/kubernetes`: rendered `optiora-e2e-oke`, `optiora-e2e-container-instance`, and `Live resource inventory` with no console errors and no horizontal overflow.
- OCI cleanup after Kubernetes validation: deleted `optiora-e2e-container-instance` and `optiora-e2e-oke`; final states were `DELETED`.
- Public live Kubernetes API: `GET /api/v1/analytics/kubernetes/summary` returned `container_service_count=2`, `clusters_configured=1`, `data_source=live_resource_inventory`, and `$19.71` estimated container run rate in about `12s`.
- `./deploy/deploy-oci.sh full` (Terraform + Ansible redeploy from the local workspace)
- `./deploy/deploy-oci.sh verify` (`48` passing, `0` failed, `3` skipped)

## 0.9.1 - UIX and Navigation Polish (May 10, 2026)

### Added

- Searchable dashboard navigation so operators can jump to dense FinOps screens without scanning the full sidebar.
- Accessible skip-to-content link in the dashboard shell for keyboard and assistive-technology users.
- Playwright coverage for precise active navigation state and sidebar search behavior.

### Changed

- Dashboard navigation active-state matching now treats `/dashboard` as the Overview page only, avoiding false active highlights on every nested dashboard route.
- The duplicate Kubernetes namespace page was consolidated into the canonical Kubernetes page; later cleanup removed the legacy route wiring entirely.
- Credential setup now starts the live provider fetch immediately after valid credentials are saved, scanning every configured provider in the workspace and showing the scan id in Settings.
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
