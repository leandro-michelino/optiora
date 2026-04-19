# Next Phase Checklist

This file turns the current public-dashboard build into a concrete go-live gate and defines what must be true before work is considered ready to move into `1.0`.

## Current Go-Live Position (April 2026 — Feature-Complete)

Release 1.0 FinOps features are fully implemented:

- **Core**: multi-cloud cost overview, anomaly detection, forecasting, recommendations
- **Analytics**: cloud waste, efficiency score, commitment gap, attribution, maturity
- **FinOps Intelligence**: unit economics, scorecards, resource inventory, Kubernetes cost allocation
- **Virtual Tag Engine**: CRUD rule builder + dry-run coverage preview (`/api/v1/virtual-tags/*`)
- **Resource-Level Rightsizing**: per-instance/volume recommendations (`/api/v1/recommendations/rightsizing`)
- **Hybrid Advisor**: deterministic + GenAI overlay (`/api/v1/advisor/hybrid`)
- **Exports**: FOCUS format, CSV, XLS executive summary, audit logs
- **Business Mapping + Chargeback**: tag-based allocation, chargeback endpoints
- **Auth (optional)**: JWT/RBAC (`OWNER / ADMIN / ANALYST / READONLY`) when `ENABLE_AUTH=true`

Dashboard now has 17 pages across 3 nav sections — all routes verified in production build.

## Validation Snapshot (19 Apr 2026)

Local validation has been re-run end to end:

- `python3 -m py_compile $(find ./finops_mcp -maxdepth 1 -name '*.py')` ✅
- `.venv/bin/python -m unittest discover -s tests -v` ✅ (154 passed)
- `cd dashboard && npm run type-check && npm run lint && npm run build` ✅
- `DATABASE_URL=sqlite:////tmp/optiora_fresh_alembic.db .venv/bin/alembic upgrade head` ✅ (0001 → 0011)
- `terraform -chdir=terraform init -backend=false && terraform -chdir=terraform validate` ✅
- `bash -n deploy/deploy-oci.sh` ✅

Notes:

- Virtual Tag CRUD roundtrip is covered in automated API tests (`tests/test_virtual_tag_rules.py`) and currently passing.
- A real-data path was validated through the UTF-8 billing CSV import flow used by tests (import → summary/cost APIs).

## Go-Live Exit Gate

Before declaring an environment ready, all of the following should be done.

### 1. Local validation

```bash
python3 -m py_compile $(find ./finops_* -maxdepth 1 -name '*.py')
./.venv*/bin/python -m unittest discover -s tests -v

cd dashboard
npm run type-check
npm run lint
npm run build
cd ..

alembic upgrade head
terraform -chdir=terraform validate
bash -n deploy/deploy-oci.sh
```

### 2. Environment configuration

Use public dashboard mode unless you are intentionally testing hardened access:

```env
ENABLE_AUTH=false
NEXT_PUBLIC_ENABLE_AUTH=false
PUBLIC_WORKSPACE_NAME=OptiOra Public Workspace
PUBLIC_WORKSPACE_EMAIL=public@optiora.local
```

Required deployment inputs:

- `OCI_COMPARTMENT_ID`
- subnet or VCN selection for the compute host
- SSH key pair for the instance
- outbound egress to package registries and any cloud APIs you plan to call
- either valid provider credentials for at least one target cloud or a customer billing CSV ready for upload

### 3. Deploy

Quick OCI deploy:

```bash
export OCI_COMPARTMENT_ID=ocid1.compartment.oc1...
./deploy/deploy-oci.sh compute
./deploy/deploy-oci.sh status
```

The quick deploy path now applies `alembic upgrade head` on the VM before services restart.

### 4. Smoke test in the live environment

Backend and UI:

```bash
curl http://<instance-ip>:8000/health
curl http://<instance-ip>:8000/api/v1/info
curl http://<instance-ip>:3000
```

Manual product checks:

1. Open `http://<instance-ip>:3000/dashboard` directly and confirm no login prompt appears.
2. Upload one UTF-8 billing CSV from the dashboard settings page and confirm the imported dataset summary updates.
3. Confirm the costs overview reflects the imported CSV totals.
4. Navigate to FinOps Analytics pages: Unit Economics, Scorecards, Inventory, Kubernetes, Virtual Tags, Rightsizing.
5. Create and delete a virtual tag rule; confirm coverage preview updates.
6. If live provider testing is in scope, add one cloud provider credential, approve scanning, and start a scan.
7. Confirm the operations page shows recent scan activity.
8. Confirm history and diff views return real data after at least two scans.
9. Confirm alerts load and acknowledgement works.
10. Confirm CSV exports download successfully.
11. Confirm forecasting, anomalies, recommendations, and AI insights render without hardcoded placeholder data.

### 5. Operational checks

On the VM:

```bash
sudo systemctl status optiora-api
sudo systemctl status optiora-dashboard
sudo tail -n 100 /var/log/optiora-api.log
sudo tail -n 100 /var/log/optiora-dashboard.log
sudo tail -n 100 /var/log/optiora-setup.log
```

If a manual migration rerun is needed:

```bash
cd /opt/optiora
set -a
. ./.env
set +a
./venv/bin/alembic upgrade head
```

## Release 1.0 Entry Criteria

Work should move into post-1.0 only after these are true:

- all 17 dashboard pages render without errors in a deployed environment
- virtual tag CRUD roundtrip (create → list → preview → delete) passes in a live environment
- rightsizing endpoint returns recommendations (or empty state with correct data_source label)
- at least one deployed environment has passed the full smoke test (including new analytics section 6)
- at least one real customer data path has been validated end to end
- deployment runbook is accurate enough for repeatable redeploys
- all Alembic migrations (0001–0011) apply cleanly on a fresh database

## Post-1.0 Focus

`post-1.0` should expand product depth and enterprise readiness:

- Redis-backed rate limiting (replace process-local buckets in `auth_routes.py`)
- Alembic migration test coverage (upgrade/downgrade chain validated in CI)
- SMTP notification integration with real email templates
- SAML / OIDC / SSO authentication path
- Vault-backed secret orchestration for credential storage
- Real Kubernetes metrics integration (Prometheus, cost-model)
- Real cloud utilization signals for rightsizing (CloudWatch, Azure Monitor, Cloud Monitoring)
- FOCUS 1.0 export certification
- Scheduled report delivery (weekly/monthly)
- Multi-tenancy isolation hardening for SaaS deployment

## Deferred Optional Hardening

These items remain intentionally out of the default deployment path for now:

- login wall
- RBAC enforcement as a required feature
- secure cookie sessions
- SSO / SAML / OIDC
- vault-backed secret management

If a hardened deployment is requested later, enable:

```env
ENABLE_AUTH=true
NEXT_PUBLIC_ENABLE_AUTH=true
```
