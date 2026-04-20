# OptiOra Deployment Guide (OCI)

This repository deploys two services onto one OCI compute instance:

- `optiora-api.service` -> FastAPI backend on `:8000`
- `optiora-dashboard.service` -> Next.js dashboard on `:3000`

Deployment can be done two ways:

- `deploy/deploy-oci.sh` for a single laptop-driven command that creates/starts compute, uploads code, installs dependencies, and restarts services on the latest Oracle Linux 9 platform image for the selected shape.
- Terraform plus Ansible, where Terraform stays limited to OCI network infrastructure and Ansible provisions the host/runtime on either Debian-family or Oracle Linux / RHEL hosts.

The quick deploy path now runs the application under the dedicated `optiora` system user instead of `root`.

Choose the path that matches your deployment style:

- `./deploy/deploy-oci.sh compute`: fast redeploy workflow for a single VM from your laptop.
- `./deploy/deploy-oci.sh full`: full end-to-end flow (Terraform + compute provisioning + extra block volume + Ansible + verify).
- `./deploy/deploy-oci.sh menu`: interactive operations menu with setup/review/CIDR management ideas.

By default, deployed dashboards are directly accessible with no login wall. Authentication and RBAC are optional hardening features for a later deployment phase and should only be enabled intentionally.

## Recommended End-to-End Setup (Interactive)

Use the deploy script menu to run Terraform + Ansible in one guided flow:

```bash
./deploy/deploy-oci.sh menu
```

What the deploy script does for a fresh environment:

- checks core tooling and local prerequisites
- prompts for required Terraform values (`compartment_id`, `laptop_cidr`, `oci_object_storage_namespace`)
- writes/updates `terraform/terraform.tfvars`
- runs `terraform init`, `terraform validate`, `terraform plan`
- optionally runs `terraform apply`
- creates or reuses the OCI compute instance
- creates and attaches an extra OCI block volume when enabled in `terraform.tfvars`
- uploads the source archive and runs Ansible provisioning automatically
- prints a deployment summary with dashboard/API URLs

Recommended extra block volume size: `200 GiB` with `10 VPUs/GB` (balanced). That is the default in the example tfvars and the recommended production baseline.

## Prerequisites

- OCI CLI installed and configured (`oci setup config`)
- `OCI_COMPARTMENT_ID` exported (required for `deploy/deploy-oci.sh` quick path)
- SSH keypair available locally
- outbound access from the VM to package registries and any cloud APIs you plan to call

## Local Preflight

```bash
python3 -m py_compile $(find ./finops_* -name '*.py')
python3 -m compileall $(find ./finops_* -type d)
./.venv/bin/python -m unittest discover -s tests -v

cd dashboard
npm run type-check
npm run lint
npm run build
```

Optional Terraform baseline:

```bash
terraform -chdir=../terraform init
terraform -chdir=../terraform validate
terraform -chdir=../terraform plan \
  -var="compartment_id=<your_compartment_ocid>" \
  -var="region=uk-london-1" \
  -var="laptop_cidr=<your_public_ip>/32"
```

Optional Ansible host provisioning:

```bash
cp ansible/inventory.example.yml ansible/inventory.yml
ansible-playbook -i ansible/inventory.yml ansible/playbooks/site.yml
```

## Quick Deploy

```bash
export OCI_REGION=uk-london-1
export OCI_COMPARTMENT_ID=ocid1.compartment.oc1...
./deploy/deploy-oci.sh compute
./deploy/deploy-oci.sh status
./deploy/deploy-oci.sh verify
```

### GenAI-ready deployment checklist

- Confirm OCI Generative AI is available in your chosen region and your tenancy has access. `uk-london-1` is the primary region for this repository.
- Ensure the following env vars are set before deploy: `OCI_GENAI_ENDPOINT`, `OCI_GENAI_MODEL`, `OCI_COMPARTMENT_OCID`, `OCI_TENANCY_OCID`, `OCI_USER_OCID`, `OCI_FINGERPRINT`, `OCI_REGION`, plus either `OCI_PRIVATE_KEY_PATH` or `OCI_PRIVATE_KEY`.
- Validate OCI CLI works locally: `oci iam region list` and `oci os ns get`.
- If using the deploy script, export the vars (or add to inventory/group_vars for Ansible) so they render into the remote `.env`.
- After deploy, test AI chat via the dashboard or with a JSON `POST` to `/api/ai/chat`.

Re-run `./deploy/deploy-oci.sh compute` after local code changes. The script always redeploys the current local workspace snapshot.

`./deploy/deploy-oci.sh verify` resolves the deployed instance IP and runs `tests/smoke_test_0_9.sh` against the live dashboard/API pair.

The same script also manages the extra block volume. It reads `extra_block_volume_enabled`, `extra_block_volume_size_gbs`, `extra_block_volume_vpus_per_gb`, and `extra_block_volume_device` from `terraform/terraform.tfvars` unless you override them with `OCI_EXTRA_VOLUME_*` environment variables.

Quick-deploy troubleshooting on the VM:

```bash
sudo tail -f /var/log/optiora-api.log
sudo tail -f /var/log/optiora-dashboard.log
sudo tail -f /var/log/optiora-setup.log
```

## What The Deploy Script Fixes Automatically

- creates `.env` from `.env.example` if missing
- rewrites `FRONTEND_URL` to `http://<instance-ip>:3000`
- rewrites `NEXT_PUBLIC_API_URL` to `http://<instance-ip>:8000`
- replaces placeholder `SECRET_KEY` values with a generated secret
- installs dependencies with `dnf` on Oracle Linux hosts while keeping `apt` fallback support for Debian-family hosts
- builds the dashboard after the remote env has been corrected

Those rewrites matter because the dashboard is browser-executed; leaving `NEXT_PUBLIC_API_URL=http://localhost:8000` would break the deployed UI.

The quick deploy path also runs `alembic upgrade head` on the VM before restarting services so schema changes from the current release are applied consistently.

## Command Reference

```bash
./deploy/deploy-oci.sh compute
./deploy/deploy-oci.sh full
./deploy/deploy-oci.sh menu
./deploy/deploy-oci.sh status
./deploy/deploy-oci.sh verify
./deploy/deploy-oci.sh logs
./deploy/deploy-oci.sh stop
./deploy/deploy-oci.sh start
./deploy/deploy-oci.sh restart
./deploy/deploy-oci.sh destroy
```

## Environment Variables

```env
OCI_REGION=uk-london-1
OCI_COMPARTMENT_ID=ocid1.compartment.oc1...
OCI_INSTANCE_NAME=optiora-api
OCI_SHAPE=VM.Standard.E4.Flex
OCI_OCPU_COUNT=2
OCI_MEMORY_GB=8
OCI_PROFILE=DEFAULT
OCI_IMAGE_COMPARTMENT_ID=
OCI_SUBNET_ID=ocid1.subnet.oc1...
OCI_SSH_PRIVATE_KEY_PATH=~/.ssh/id_ed25519
OCI_SSH_PUBLIC_KEY_PATH=~/.ssh/id_ed25519.pub
```

`OCI_IMAGE_COMPARTMENT_ID` is optional. If it is unset, the deploy script resolves the platform-image compartment from the tenancy configured in `OCI_PROFILE`.

Optional runtime values copied into the remote `.env`:

```env
DATABASE_URL=
SECRET_KEY=
ENABLE_AUTH=false
NEXT_PUBLIC_ENABLE_AUTH=false
PUBLIC_WORKSPACE_NAME=OptiOra Public Workspace
PUBLIC_WORKSPACE_EMAIL=public@optiora.local
OCI_GENAI_ENDPOINT=https://inference.generativeai.uk-london-1.oci.oraclecloud.com
OCI_GENAI_MODEL=ocid1.generativeaimodel.oc1..<model_ocid>
OCI_COMPARTMENT_OCID=ocid1.compartment.oc1..<compartment_ocid>
OCI_TENANCY_OCID=ocid1.tenancy.oc1..<tenancy_ocid>
OCI_USER_OCID=ocid1.user.oc1..<user_ocid>
OCI_FINGERPRINT=<api_key_fingerprint>
OCI_PRIVATE_KEY_PATH=~/.oci/oci_api_key.pem
# Optional alternative:
# OCI_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
OCI_REGION=<oci_region>
OCI_CONFIG_FILE=
ENVIRONMENT=production
PASSWORD_RESET_RETURN_TOKEN=false
PASSWORD_RESET_TOKEN_MINUTES=30
ENABLE_SCAN_SCHEDULER=false
SCAN_SCHEDULER_INTERVAL_MINUTES=60
```

`OCI_PRIVATE_KEY_PATH` is the preferred deployment option because it avoids fragile multiline env formatting.

- For `deploy/deploy-oci.sh`, the script will copy the referenced local key file onto the VM and rewrite `OCI_PRIVATE_KEY_PATH` to the deployed path automatically.
- For Ansible-only provisioning, point `optiora_private_key_path` at a file path that exists on the target host.
- Use `OCI_PRIVATE_KEY` only when you intentionally need to inject the PEM inline with literal `\n` escapes.

Optional hardened deployment later:

```env
ENABLE_AUTH=true
NEXT_PUBLIC_ENABLE_AUTH=true
SECRET_KEY=<strong-random-value>
```

## Post-Deployment Validation

```bash
curl http://<instance-ip>:8000/health
curl http://<instance-ip>:8000/api/v1/info
curl http://<instance-ip>:3000
curl -X POST http://<instance-ip>:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Summarize the main cost drivers in this workspace.","conversationHistory":[]}'
./deploy/deploy-oci.sh verify
```

Forecasting and analytics validation (budget-aware FinOps model):

```bash
curl "http://<instance-ip>:8000/api/v1/forecast" | jq '.model, .forecast_summary, .budget_guardrails'
curl "http://<instance-ip>:8000/api/v1/analytics" | jq '.risk_score, .maturity_score, .spend_at_risk_usd, .optimization_capacity_usd, .unit_metrics'
```

Optional scheduler smoke test (authenticated mode with owner/admin role):

```bash
curl -X POST http://<instance-ip>:8000/api/v1/scanning/scheduler/run-now
```

Manual product checks:

1. Open `http://<instance-ip>:3000/dashboard` and confirm the dashboard opens directly with no login wall.
2. Upload a UTF-8 billing CSV from the settings page and confirm the imported dataset summary updates.
3. Confirm the costs overview reflects the imported CSV totals.
4. If live provider validation is in scope, add one cloud credential, approve scanning, and start a scan.
5. Confirm history, diff, alerts, and CSV exports still work after deployment.

Optional live credential verification:

```bash
SMOKE_CREDENTIAL_JSON='{"provider":"aws","access_key_id":"...","secret_access_key":"...","region":"us-east-1"}' \
./deploy/deploy-oci.sh verify
```

When `SMOKE_CREDENTIAL_JSON` is provided, the verify flow also exercises credential validation, credential add, scan approval, scan start, history lookup, and diff export for that provider.

On the VM:

```bash
sudo systemctl status optiora-api
sudo systemctl status optiora-dashboard
sudo tail -f /var/log/optiora-api.log
sudo tail -f /var/log/optiora-dashboard.log
sudo tail -f /var/log/optiora-setup.log
```

Manual migration check if needed:

```bash
cd /opt/optiora
set -a
. ./.env
set +a
./venv/bin/alembic upgrade head
```

## Troubleshooting

### API unhealthy

1. `sudo journalctl -u optiora-api -n 100 --no-pager`
2. Confirm `/opt/optiora/.env` exists and has a non-placeholder `SECRET_KEY`
3. Confirm backend deps exist: `/opt/optiora/venv/bin/pip list`
4. Check DB config: `DATABASE_URL` or `OCI_DB_*`

### Dashboard unreachable

1. `sudo journalctl -u optiora-dashboard -n 100 --no-pager`
2. Confirm `NEXT_PUBLIC_API_URL` in `/opt/optiora/.env` points to the VM public IP
3. Ensure `node -v` and `npm -v` work on the instance

### Live provider credential validation failures

1. Re-check provider permissions and region/subscription/project values
2. Confirm outbound egress from the subnet to the cloud provider APIs
3. Use `/api/v1/credentials/validate` response details for root cause

### CSV import failures

1. Confirm the uploaded file is a UTF-8 `.csv`
2. Confirm the CSV header includes `provider` and `cost_usd`
3. Confirm `provider` values are limited to `aws`, `azure`, `gcp`, or `oci`
4. Confirm `currency` is omitted or set to `USD`

## Deployment Architecture

```text
Developer Laptop
   |
   | Terraform network baseline
   | Ansible host provisioning
   | or deploy/deploy-oci.sh compute
   v
OCI VM
├── /opt/optiora
│   ├── finops_mcp/ (internal backend package)
│   ├── dashboard
│   ├── .env
│   └── venv
├── optiora-api.service
└── optiora-dashboard.service
```
