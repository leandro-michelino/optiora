# Next Phase Checklist

This file turns the current `Release 0.9` state into a concrete go-live gate and defines what must be true before work is considered ready to move into `1.0`.

## Current Release Position

`Release 0.9` is now centered on deployable product readiness:

- dashboard opens directly by default with no login wall
- authentication and RBAC are deferred as optional deployment hardening
- organization-scoped persistence is in place for credentials, imported CSV cost data, scan runs, alerts, audit logs, and exports
- scan history, scan diff, alerts, audit logs, and CSV exports are available
- customer-managed CSV cost upload is available as a billing input path
- OCI deployment paths exist through `deploy/deploy-oci.sh` and Terraform plus Ansible

## Release 0.9 Exit Gate

Before declaring `0.9` complete in an environment, all of the following should be done.

### 1. Local validation

```bash
python3 -m py_compile finops_mcp/*.py tests/test_auth_flow.py

cd dashboard
npm run type-check
cd ..

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
4. If live provider testing is in scope, add one cloud provider credential, approve scanning, and start a scan.
5. Confirm the operations page shows recent scan activity.
6. Confirm history and diff views return real data after at least two scans.
7. Confirm alerts load and acknowledgement works.
8. Confirm CSV exports download successfully.
9. Confirm forecasting, anomalies, recommendations, and AI insights render without hardcoded placeholder data.

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

Work should move into `1.0` only after these are true:

- at least one deployed environment has passed the full `0.9` smoke test
- at least one real customer data path has been validated end to end through either provider credentials and scans or CSV upload
- scan history, diff, alerts, and exports are confirmed in the deployed environment
- deployment runbook is accurate enough for repeatable redeploys
- known release blockers are limited to product expansion, not base deployment stability

## Proposed 1.0 Focus

`1.0` should expand product value rather than reopen access-control work by default.

- multi-account and multi-subscription aggregation
- stronger reporting for finance and procurement users
- executive dashboards and customer-friendly exports
- business mapping, tag normalization, and chargeback/showback foundations
- production polish, test coverage, and operational observability

Concrete implementation planning now lives in `RELEASE_1_0_BACKLOG.md`.

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
