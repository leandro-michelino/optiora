# End-to-End Walkthrough Notes

Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot

Current walkthrough date: May 11, 2026.

## Human Operator Path

These notes capture the complete operator-style pass through OptiOra using the repository documentation as the runbook. The goal was to act like a first-time human operator: bootstrap the local environment, run the documented checks, browse the dashboard screens, verify the live OCI deployment, and fix issues found on the way.

## Process Notes

| Process | What I Did | Result | Notes / Fixes |
|---|---|---|---|
| Git and deployment recovery | Confirmed previous remote push and checked the in-flight OCI deployment. | Pass | Prior push landed on `origin/main`. The VM deployment continued and completed successfully. |
| Local Python setup | Followed README/TESTING bootstrap expectations. | Fixed then pass | Existing `.venv` was tied to Python `3.14`, which the project explicitly does not support. Recreated `.venv` with `python3.13` and installed the app/dev tools through `setup.sh`. |
| Backend static checks | Ran Python compile checks across `optiora_backend`. | Pass | No syntax errors. |
| Backend regression suite | Ran the complete pytest suite. | Pass | `287 passed`. |
| Terraform validation | Ran the documented Terraform validation path. | Fixed then pass | Initial `terraform validate` failed because the OCI provider package was not cached locally. Ran `terraform -chdir=terraform init -input=false`, then validation passed. |
| Ansible syntax | Ran playbook syntax check against the example inventory. | Pass | `ansible/playbooks/site.yml` syntax check passed. |
| Dashboard audit | Ran high-severity npm audit. | Pass | `0 vulnerabilities`. |
| Dashboard production build | Built the Next.js dashboard. | Pass | Build completed and generated all dashboard routes. |
| Dashboard type-check and lint | Ran TypeScript and ESLint. | Pass | Both completed with no errors. |
| Existing Playwright journey | Ran documented public dashboard E2E tests. | Pass | CSV import fallback, export controls, navigation search, and Kubernetes route merge checks passed. |
| Operator screen walkthrough | Added and ran `dashboard/e2e/operator-walkthrough.spec.ts`. | Fixed then pass | First run exposed test expectation mismatches with actual UI headings and duplicate breadcrumb/content heading scope. Updated the test to assert the real main-content headings across all screens. |
| Lint/test artifact handling | Ran lint while Playwright was creating/removing report artifacts. | Fixed then pass | ESLint hit an `ENOENT` race on `dashboard/test-results`. Added `test-results/**` and `playwright-report/**` to the ESLint flat-config ignores, then lint passed. |
| OCI VM deployment | Allowed the Terraform + Ansible deploy flow to finish. | Pass | VM came up at `140.238.90.95`; API, dashboard, nginx, and OCI GenAI runtime config were active/enabled. |
| OCI verification | Ran `./deploy/deploy-oci.sh verify`. | Pass | `48 passed, 0 failed, 3 skipped`. Skips were intentional live-environment safeguards for temporary CSV upload and optional live credential scan. |
| New capability contracts | Called the live rightsizing, recommendation ledger, ledger CSV, FinOps intelligence, and RAG guidance endpoints. | Pass | Rightsizing returned live OCI-backed recommendations, ledger exports included planned/realized/variance fields, FinOps intelligence returned deterministic risk/execution data, and RAG guidance returned retrieved guidance. |
| Advisor Conversation grounding | Called `/api/ai/chat` on the OCI VM with German prior chat history and the prompt `Which services are over-provisioned?`. | Pass | Response stayed in English and returned the correct provider-backed rightsizing empty-state instead of promoting tenancy, account, segment, imported, or service aggregate rows as actionable resources. |

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

It verifies that `/dashboard/kubernetes` is the only Kubernetes, containers, Docker, namespaces, and OpenCost screen, and that the sidebar no longer shows a separate `K8s Namespaces` entry.

## Live OCI Results

```text
Dashboard: http://140.238.90.95/dashboard
API:       http://140.238.90.95
Health:   HTTP 200, version 0.9.3 after the release metadata bump is deployed
Services: optiora-api active/enabled, optiora-dashboard active/enabled, nginx active/enabled
Deploy:   Terraform + Ansible redeploy completed from the local workspace
Verify:   48 passed, 0 failed, 3 skipped
GenAI:    OCI GenAI configured in uk-london-1 with RAG-backed advisor wiring
Chat:     Advisor Conversation English-only for now; over-provisioning scoped to real AWS/Azure/GCP/OCI resource rightsizing candidates
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

## Kubernetes / Containers / Docker Focused Run

Date: May 10, 2026.

Goal: make the Kubernetes page show real OCI Kubernetes/container/Docker signals instead of saying there are no services running.

| Step | Human Operator Action | Result | Notes / Fixes |
|---|---|---|---|
| OCI context check | Used the repository deployment docs and Terraform outputs to target `uk-london-1`, the existing VCN, and the public subnet. | Pass | The default OCI CLI profile region was not trusted implicitly; commands were run with explicit `--region uk-london-1`. |
| OKE launch | Created one OKE Basic cluster named `optiora-e2e-oke`. | Pass | Cluster OCID: `ocid1.cluster.oc1.uk-london-1.aaaaaaaahlpc245e5pjju2hvvrdgi33jqemffbi2w7vcacrlocd7dr7hjoaq`; Kubernetes `v1.34.2`; lifecycle `ACTIVE`; public endpoint enabled. |
| Container service launch | Created one OCI Container Instance named `optiora-e2e-container-instance`. | Pass | Container Instance OCID: `ocid1.computecontainerinstance.oc1.uk-london-1.anwgiljro4rzpdiakef6tagwx2wzosb6qnmcvakhcxzd6vwxbt6iqekypbxq`; image `docker.io/library/nginx:alpine`; lifecycle `ACTIVE`; container status `CONTAINER_RUNNING`. |
| Page data wiring | Called the same live OCI inventory path used by the Kubernetes summary endpoint. | Fixed then pass | Initial page logic only read billing/service-cost rows, so new OCI resources could be invisible until cost data arrived. Added live OCI inventory for OKE, Container Instances, and OCIR. |
| Run-rate estimate | Reviewed cost estimate behavior for resources with no billing rows yet. | Fixed then pass | The active `1 OCPU / 1 GiB` Container Instance is estimated at about `$19.71/month`; OKE Basic control plane is shown as `$0` incremental in this planning model until worker nodes or metered costs appear. |
| Duplicate credential handling | Re-ran the live endpoint after VM deployment. | Fixed then pass | The VM discovered the same OCI credential source twice and initially doubled the Container Instance estimate. Added resource-ID de-duplication and regression coverage. |
| API validation | Called `GET /api/v1/analytics/kubernetes/summary` on the live VM. | Fixed then pass | First pass was too slow for the dashboard fallback path, so live inventory was prioritized ahead of slower billing lookups. Final live response returned in about `12s` with `kubernetes_enabled=true`, `clusters_configured=1`, `container_service_count=2`, `estimated_k8s_cost_usd=19.71`, and `data_source=live_resource_inventory`. |
| Allocation calculator validation | Posted a modeled OKE allocation to `POST /api/v1/analytics/kubernetes/cluster-cost`. | Pass | Live API returned `4` namespaces, `4` workloads, `2` teams, `1` node pool, and `2` recommendations for `optiora-e2e-oke`. |
| UI validation | Opened `/dashboard/kubernetes` after deployment. | Pass | Browser check confirmed `optiora-e2e-oke`, `optiora-e2e-container-instance`, and `Live resource inventory` are visible with no console errors and no horizontal overflow. |
| Temporary resource cleanup | Deleted the focused OCI validation resources after the walkthrough. | Pass | `optiora-e2e-container-instance` reached `DELETED`; `optiora-e2e-oke` reached `DELETED` with deletion timestamp `2026-05-10T16:05:40+00:00`. |

Focused validation commands:

```bash
OCI_CLI_SUPPRESS_FILE_PERMISSIONS_WARNING=True SUPPRESS_LABEL_WARNING=True \
  oci ce cluster get --region uk-london-1 \
  --cluster-id ocid1.cluster.oc1.uk-london-1.aaaaaaaahlpc245e5pjju2hvvrdgi33jqemffbi2w7vcacrlocd7dr7hjoaq

OCI_CLI_SUPPRESS_FILE_PERMISSIONS_WARNING=True SUPPRESS_LABEL_WARNING=True \
  oci container-instances container get --region uk-london-1 \
  --container-id ocid1.computecontainer.oc1.uk-london-1.anwgiljro4rzpdiacjzqzuwjp4tkwm52fbp6uzxzppmxtzg4njcff7djvikq

.venv/bin/python -m pytest tests/test_kubernetes.py -q
npm run type-check --prefix dashboard
npm run lint --prefix dashboard
npm run build --prefix dashboard
curl -fsS http://140.238.90.95/api/v1/analytics/kubernetes/summary
```

## Repeatable Commands

```bash
./setup.sh --skip-dashboard
.venv/bin/python -m py_compile $(find ./optiora_backend -name '*.py')
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
