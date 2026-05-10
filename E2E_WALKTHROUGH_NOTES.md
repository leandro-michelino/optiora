# End-to-End Walkthrough Notes

Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot

Current walkthrough date: May 10, 2026.

## Human Operator Path

These notes capture the complete operator-style pass through OptiOra using the repository documentation as the runbook. The goal was to act like a first-time human operator: bootstrap the local environment, run the documented checks, browse the dashboard screens, verify the live OCI deployment, and fix issues found on the way.

## Process Notes

| Process | What I Did | Result | Notes / Fixes |
|---|---|---|---|
| Git and deployment recovery | Confirmed previous remote push and checked the in-flight OCI deployment. | Pass | Prior push landed on `origin/main`. The VM deployment continued and completed successfully. |
| Local Python setup | Followed README/TESTING bootstrap expectations. | Fixed then pass | Existing `.venv` was tied to Python `3.14`, which the project explicitly does not support. Recreated `.venv` with `python3.13` and installed the app/dev tools through `setup.sh`. |
| Backend static checks | Ran Python compile checks across `finops_*`. | Pass | No syntax errors. |
| Backend regression suite | Ran the complete pytest suite. | Pass | `287 passed`. |
| Terraform validation | Ran the documented Terraform validation path. | Fixed then pass | Initial `terraform validate` failed because the OCI provider package was not cached locally. Ran `terraform -chdir=terraform init -input=false`, then validation passed. |
| Ansible syntax | Ran playbook syntax check against the example inventory. | Pass | `ansible/playbooks/site.yml` syntax check passed. |
| Dashboard audit | Ran high-severity npm audit. | Pass | `0 vulnerabilities`. |
| Dashboard production build | Built the Next.js dashboard. | Pass | Build completed and generated all dashboard routes. |
| Dashboard type-check and lint | Ran TypeScript and ESLint. | Pass | Both completed with no errors. |
| Existing Playwright journey | Ran documented public dashboard E2E tests. | Pass | CSV import fallback, export controls, navigation search, and Kubernetes route merge checks passed. |
| Operator screen walkthrough | Added and ran `dashboard/e2e/operator-walkthrough.spec.ts`. | Fixed then pass | First run exposed test expectation mismatches with actual UI headings and duplicate breadcrumb/content heading scope. Updated the test to assert the real main-content headings across all screens. |
| Lint/test artifact handling | Ran lint while Playwright was creating/removing report artifacts. | Fixed then pass | ESLint hit an `ENOENT` race on `dashboard/test-results`. Added `test-results/**` and `playwright-report/**` to the ESLint flat-config ignores, then lint passed. |
| OCI VM deployment | Allowed `deploy/deploy-oci.sh compute` to finish. | Pass | VM came up at `140.238.90.95`; API, dashboard, and nginx were active/enabled. |
| OCI verification | Ran `./deploy/deploy-oci.sh verify`. | Pass | `48 passed, 0 failed, 3 skipped`. Skips were intentional live-environment safeguards for temporary CSV upload and optional live credential scan. |
| New capability contracts | Called the live rightsizing, recommendation ledger, ledger CSV, FinOps intelligence, and RAG guidance endpoints. | Pass | Rightsizing returned live OCI-backed recommendations, ledger exports included planned/realized/variance fields, FinOps intelligence returned deterministic risk/execution data, and RAG guidance returned retrieved guidance. |

## Screens Walked

The new operator walkthrough covers every main dashboard route:

```text
/dashboard
/dashboard/my-dashboards
/dashboard/costs
/dashboard/accounts
/dashboard/portfolio
/dashboard/ai-insights
/dashboard/cost-advisor
/dashboard/forecasting
/dashboard/unit-economics
/dashboard/scorecards
/dashboard/advanced-finops
/dashboard/inventory
/dashboard/kubernetes
/dashboard/virtual-tags
/dashboard/rightsizing
/dashboard/operations
/dashboard/admin
/dashboard/anomalies
/dashboard/recommendations
/dashboard/settings
```

It also verifies that the old `/dashboard/k8s-namespaces` path redirects to `/dashboard/kubernetes` and that the sidebar no longer shows a separate `K8s Namespaces` entry.

## Live OCI Results

```text
Dashboard: http://140.238.90.95/dashboard
API:       http://140.238.90.95
Health:   HTTP 200, version 0.9.2 after the release metadata bump is deployed
Services: optiora-api active/enabled, optiora-dashboard active/enabled, nginx active/enabled
Deploy:   End-to-end compute deploy time 7m 18s
Verify:   48 passed, 0 failed, 3 skipped
```

The live rightsizing and ledger checks confirmed finance-ready fields:

```text
planned_monthly_savings_usd
realized_monthly_savings_usd
variance_monthly_usd
planned_annual_savings_usd
realized_annual_savings_usd
variance_annual_usd
variance_percent
recommendation_source
recommendation_fingerprint
```

The latest dashboard scorecards implementation also confirms realized savings rollups by:

```text
provider
owner
business_unit
realized_month
```

The UIX shell pass confirms every page has searchable navigation metadata and active-page helper text. The detailed page-by-page findings are in `UIX_REVIEW.md`.

## Repeatable Commands

```bash
./setup.sh --skip-dashboard
.venv/bin/python -m py_compile $(find ./finops_* -name '*.py')
.venv/bin/python -m pytest -q
terraform -chdir=terraform init -input=false
terraform -chdir=terraform validate
ansible-playbook -i ansible/inventory.example.yml ansible/playbooks/site.yml --syntax-check

cd dashboard
npm audit --audit-level=high
npm run build
npm run type-check
npm run lint
npm run test:e2e
npx playwright test e2e/operator-walkthrough.spec.ts

cd ..
./deploy/deploy-oci.sh verify
```

## Follow-Up Watch Items

- Keep `.venv` on Python `3.10` through `3.13`; Python `3.14` should continue to be rejected until the test/runtime stack supports it.
- Run `terraform init` before `terraform validate` on a fresh laptop or after provider cache cleanup.
- The optional live credential scan remains intentionally skipped unless `SMOKE_CREDENTIAL_JSON` is provided.
- The live CSV upload smoke remains intentionally skipped unless `SMOKE_ENABLE_CSV_IMPORT=true` is set.
