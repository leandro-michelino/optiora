# Testing and Verification

## Backend

Static verification:

```bash
python3 -m py_compile $(find ./finops_* -name '*.py')
python3 -m compileall $(find ./finops_* -type d)
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
.venv/bin/python -m unittest discover -s tests
./scripts/check-animated-svg-routes.sh
```

Current backend coverage includes:

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
- Alembic upgrade/downgrade roundtrip (`base` → `head` → `base` → `head`)

**Platform hardening** (`tests/test_platform_hardening.py`):

- credential delete: success with list emptying, 404 for missing, role enforcement (readonly blocked)
- scan pause/resume: state transitions `approved` → `paused` → `running`
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

Smoke endpoints:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/api/v1/info
```

Auth smoke flow:

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"StrongPass1!","full_name":"Test User"}'
```

## Frontend

```bash
cd dashboard
npm run type-check
npm run lint
npm run build
npm run test:e2e
```

Browser E2E coverage now validates the public dashboard optional CSV fallback workflow:

- opens `/dashboard/settings` with auth disabled
- uploads `dashboard/e2e/fixtures/import-costs.csv`
- confirms the imported CSV becomes the active source on overview, costs, forecasting, AI insights, and recommendations pages
- confirms operations still exposes the export/report controls after the imported dataset becomes active

Playwright harness files:

- `dashboard/playwright.config.ts`
- `dashboard/scripts/playwright-backend.sh`
- `dashboard/scripts/playwright-frontend.sh`
- `dashboard/e2e/public-dashboard.spec.ts`

## Terraform

```bash
terraform -chdir=terraform validate
```

## Notes

- Backend tests require the Python dependencies from `pyproject.toml`.
- `tests/test_auth_flow.py` forces `ENABLE_AUTH=true` internally so auth-specific regressions remain covered even though the default deployment mode is public access.
- Alembic migrations require a single linear head before running the auth flow roundtrip migration test.
- Dashboard linting requires ESLint flat config (`eslint.config.mjs`) when using ESLint 9.
- If your existing `.venv` was created on Python `3.14`, recreate it on Python `3.12` or `3.13` before running the backend suite.
- `tests/smoke_test_0_9.sh` is the current end-to-end smoke script for a running public-dashboard deployment.
- `./deploy/deploy-oci.sh verify` wraps `tests/smoke_test_0_9.sh` against the currently deployed OCI instance.
- For Terraform + Ansible deployments, prefer `./setup.sh --interactive` to keep tfvars and inventory generation consistent before smoke checks.
- Epic 1 (platform hardening) and Epic 2 (multi-account hierarchy) are fully covered by `test_platform_hardening.py` and `test_epic2_multi_account.py` respectively.
- Frontend production build is a required deployment gate.
