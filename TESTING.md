# Testing and Verification

Validation snapshot (May 10, 2026): backend regression suite passing (`281` unittest cases, `2` skipped), targeted rightsizing/ledger and deep analytics tests passing (`35` via pytest), dashboard build/type-check/lint passing when run serially, high-severity npm audit clean, animated SVG route integrity passing, tracked Terraform format/validate passing, Ansible playbook syntax passing, production browser smoke passing, live Rightsizing browser toggle passing, and OCI deploy verification passing (`48` passed, `0` failed, `3` skipped).

## Backend

Bootstrap first (recommended):

```bash
./setup.sh
```

Static verification:

```bash
python3 -m py_compile $(find ./finops_* -name '*.py')
```

Once backend dependencies are installed:

```bash
source .venv/bin/activate
optiora
```

Developer override example:

```bash
optiora --port 8001 --reload
```

If `python3` resolves to `3.14`, create your virtualenv with `python3.13` (or `python3.12`) first.

Use Python `3.10` to `3.13` for backend runtime/setup.
Avoid using a Python `3.14` virtualenv for the backend test environment until the upstream `httpx/httpcore` test stack fully stabilizes there.

Regression tests:

```bash
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
# Optional (if pytest is installed)
.venv/bin/python -m pytest -q
./scripts/check-animated-svg-routes.sh
```

Current backend coverage includes:

**Configuration and release wiring** (`tests/test_config.py`):

- environment-derived configuration refresh at instantiation time
- OCI-only runtime guardrails and metadata preflight behavior
- live-provider readiness with copied example placeholders treated as unset
- CSV/import mode allowance when `REQUIRE_LIVE_PROVIDER_DATA=false`

**Auth and organization flows** (`tests/test_auth_flow.py`):

- registration, login, refresh-token rotation, and organization membership reads
- password reset request/completion with one-time reset tokens
- refresh-token revocation after password reset
- customer scope rejection for mismatched `customer_id`
- login rate limiting after repeated failures
- organization-scoped credential CRUD, scan history, alert, and export flows
- CSV cost import replacement behavior, validation, and owner/admin role enforcement
- imported cost hierarchy rollups and finance report exports (CSV and Excel)
- scheduler status timeline and external AWS anomaly ingestion
- export job create/run/history APIs and scheduled run records
- external GCP budget Pub/Sub ingestion into normalized alert events
- public-mode info contract and dashboard data endpoints
- forecast/analytics response contract checks for deeper FinOps fields (`forecast_summary`, `genai_context`, `provider_concentration_hhi`, `spend_at_risk_usd`, `optimization_capacity_usd`, `budget_utilization_percent`)
- Alembic upgrade/downgrade roundtrip (`base` -> `head` -> `base` -> `head`)

**Platform hardening** (`tests/test_platform_hardening.py`):

- credential delete: success with list emptying, 404 for missing, role enforcement (readonly blocked)
- scan pause/resume: state transitions `approved` -> `paused` -> `running`
- scheduler run-now endpoint returns status payload
- public-mode CSV upload: upload succeeds without auth, summary and costs reflect import
- ORM column schema: `imported_cost_records` hierarchy columns, `provider_accounts` table, `audit_logs` columns
- analyst role: read access allowed for credentials and costs; delete and CSV upload blocked

**Multi-account hierarchy** (`tests/test_epic2_multi_account.py`):

- `cost_allocation_snapshots` table and column presence (`organization_id`, `scan_id`, `provider_account_id`, `region`, `cost_usd`, etc.)
- `provider_accounts` table has hierarchy columns (`parent_account_id`, `depth`, `native_region`, `is_active`)
- account inventory endpoint returns org-scoped accounts, supports `?provider=` filter, returns empty for unknown provider
- account region breakdown endpoint returns seeded regions, correct total cost, and 404 for unknown account
- rollup response contains `top_regions` field populated from CSV import with region column
- inventory org scoping: Org A cannot see Org B's accounts and vice versa

**Notifications** (`tests/test_notifications.py`):

- budget alert event creation with email/Slack/Teams channel tracking
- alert skip conditions for disabled notifications and below-threshold spend

**Competitive operations** (`tests/test_competitive_ops.py`):

- alert lifecycle transitions (`acknowledge`, `dismiss`, `reactivate`) and list-state projection
- routing policy dry-run simulator contract
- operations data freshness endpoint contract (`/api/v1/operations/data-freshness`)

**Forecast stress and portfolio analytics** (`tests/test_forecast_stress_and_portfolio.py`):

- deterministic stress envelope endpoint contract (`POST /api/v1/forecast/stress-test`)
- optimization portfolio ranking endpoint contract (`GET /api/v1/analytics/optimization-portfolio`)
- API feature flags include `forecast_stress_test` and `optimization_portfolio`

**Deep FinOps analytics and GenAI** (`tests/test_deep_finops_analytics.py`):

- forecast quality and downside-risk contract
- what-if timeline simulation
- champion/challenger model diagnostics (`GET /api/v1/forecast/model-diagnostics`)
- forecast diagnostics contract (`GET /api/v1/analytics/forecast-diagnostics`)
- RAG guidance retrieval contract (`POST /api/v1/genai/rag-guidance`)
- combined intelligence contract (`GET /api/v1/analytics/finops-intelligence`)
- decision-intelligence frontier contract (`GET /api/v1/analytics/decision-intelligence`)
- decision-intelligence narrative contract (`POST /api/v1/genai/analyze` with `analysis_type=decision_intelligence`)
- GenAI copilot pack prompts for non-forecast use cases such as tagging, sustainability, vendor negotiation, and operating reviews

**Rightsizing and recommendation ledger** (`tests/test_rightsizing.py`, `tests/test_rightsizing_oci_storage.py`):

- stored/imported rightsizing response contract and provider filters
- OCI storage and provider recommendation row normalization
- ledger upsert from `GET /api/v1/recommendations/rightsizing`
- finance ledger JSON/CSV fields for planned savings, realized savings, and variance
- finance update flow via `PATCH /api/v1/recommendations/ledger/{ledger_id}`

**Kubernetes and partner portfolio** (`tests/test_kubernetes.py`, `tests/test_partner_portfolio.py`):

- Kubernetes namespace, workload, team, node pool, and recommendation contract
- live OCI OKE, Container Instance, and OCIR inventory rows in `GET /api/v1/analytics/kubernetes/summary` before billing data catches up
- MSP/partner customer portfolio aggregation across accessible organizations
- white-label response configuration

**Scorecards** (`tests/test_scorecards.py`):

- organization/team FinOps maturity scorecard response shape
- realized savings scorecards grouped by provider, owner, business unit, and realized month
- recommendation ledger planned, realized, variance, score, grade, verified, and open-count rollups

Smoke endpoints:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/api/v1/info
```

Cloud connectivity probe (from the backend runtime host):

```bash
PYTHONPATH=. .venv/bin/python scripts/check_cloud_connectivity.py
```

Notes:

- The script reports configured/missing state for AWS, Azure, GCP, and OCI.
- OCI validation normalizes bracketed profiles (`[JNB]` -> `JNB`) and auto-retries Usage API calls in tenancy home region when needed.
- OCI test-only server file upload can be exercised with `POST /api/v1/credentials/oci/upload-files` (multipart form: `profile`, `config_file`, optional `private_key_file`), then validated through `POST /api/v1/credentials/validate`.

Auth smoke flow:

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"StrongPass1!","full_name":"Test User"}'
```

## Frontend

```bash
cd dashboard
npm audit --audit-level=high
npm run build
npm run type-check
npm run lint
npm run test:e2e
```

Run `npm run build` before standalone `npm run type-check` after a cleanup
because Next.js owns `.next/types`. Running `type-check` concurrently with
`next build` can race while the generated `.next/types` tree is being refreshed.

Browser E2E coverage now validates the public dashboard optional CSV fallback workflow:

- opens `/dashboard/settings` with auth disabled
- uploads `dashboard/e2e/fixtures/import-costs.csv`
- confirms the imported CSV becomes the active source on overview, costs, forecasting, AI insights, and recommendations pages
- confirms operations still exposes the export/report controls after the imported dataset becomes active
- walks every main dashboard screen as an operator, confirms each main content heading renders, verifies there is exactly one active navigation target, and checks that the legacy Kubernetes namespace route redirects into the single consolidated Kubernetes page

Playwright harness files:

- `dashboard/playwright.config.ts`
- `dashboard/scripts/playwright-backend.sh`
- `dashboard/scripts/playwright-frontend.sh`
- `dashboard/e2e/public-dashboard.spec.ts`
- `dashboard/e2e/operator-walkthrough.spec.ts`

Operator walkthrough notes:

- `E2E_WALKTHROUGH_NOTES.md`

Current live Rightsizing smoke:

```bash
curl --max-time 130 \
  "http://<instance-ip>/api/v1/recommendations/rightsizing?provider=oci&min_savings=0&limit=1000&refresh_live=true"
```

The deployed May 10, 2026 run returned in roughly `50s` with about `730` OCI recommendations. The dashboard client allows `120s` for this live path and keeps the default stored-signal path fast for normal browsing.

## Terraform

```bash
terraform -chdir=terraform validate
```

## Notes

- Backend tests require the Python dependencies from `pyproject.toml`.
- `./setup.sh` installs pytest/ruff/mypy/black by default; use `--no-dev-tools` only when you intentionally want a minimal runtime-only environment.
- `tests/test_auth_flow.py` forces `ENABLE_AUTH=true` internally so auth-specific regressions remain covered even though the default deployment mode is public access.
- Alembic migrations require a single linear head before running the auth flow roundtrip migration test.
- The backend suite is `unittest`-compatible. If pytest is unavailable locally, run the canonical `unittest discover` command.
- Run `./scripts/cleanup-workspace.sh` to remove redundant duplicate-copy artifacts, `.tmp` scratch databases, Playwright reports, dashboard build output, Terraform plugin/plan cache, and Python cache folders before packaging or handoff. It intentionally preserves `.venv`, `dashboard/node_modules`, `optiora.db`, `terraform/*.tfstate`, and `terraform/terraform.tfvars`.
- Dashboard linting requires ESLint flat config (`eslint.config.mjs`) when using ESLint 9.
- If your existing `.venv` was created on Python `3.14`, recreate it on Python `3.12` or `3.13` before running the backend suite.
- `tests/smoke_test_0_9.sh` is the current end-to-end smoke script for a running public-dashboard deployment.
- `./deploy/deploy-oci.sh verify` wraps `tests/smoke_test_0_9.sh` against the currently deployed OCI instance.
- CSV import smoke is opt-in with `SMOKE_ENABLE_CSV_IMPORT=true`; leave it disabled for live customer environments so the dashboard remains backed by provider APIs, saved live scan snapshots, or customer-provided imports only.
- `tests/live_data_gate.sh` is the strict release-critical route/API data-source gate (fails on fallback/placeholder sources).
- `./scripts/generate_evidence_pack.sh` creates dated deploy/migration/smoke/live-credential-flow/rollback artifacts for release evidence.
- For Terraform + Ansible deployments, prefer `./deploy/deploy-oci.sh full` or menu option `1` so the extra block volume attach, inventory generation, and source upload stay consistent before smoke checks.
- Epic 1 (platform hardening) and Epic 2 (multi-account hierarchy) are fully covered by `test_platform_hardening.py` and `test_epic2_multi_account.py` respectively.
- Frontend production build is a required deployment gate.

## Contact / Pilot

Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot
