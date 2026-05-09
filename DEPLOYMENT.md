# OptiOra Deployment Guide (OCI)

Current as of May 10, 2026.

This repository deploys two services onto one OCI compute instance:

- `optiora-api.service` -> FastAPI backend on `:8000`
- `optiora-dashboard.service` -> Next.js dashboard on `:3000`

Production/runtime policy: **OCI only**. On-premises execution is disabled until explicitly re-enabled in a future change. The deployed environment sets `DEPLOYMENT_TARGET=oci` and `OCI_RUNTIME_REQUIRED=true`; the API validates OCI instance metadata at startup, and both systemd units run an OCI metadata `ExecStartPre` check before starting.

Deployment can be done two ways:

- `deploy/deploy-oci.sh` for a single laptop-driven command that creates/starts compute, uploads code, installs dependencies, and restarts services on the latest Oracle Linux 9 platform image for the selected shape.
- Terraform plus Ansible, where Terraform stays limited to OCI network infrastructure and Ansible provisions the host/runtime on Oracle Linux hosts only.

The quick deploy path now runs the application under the dedicated `optiora` system user instead of `root`.

Choose the path that matches your deployment style:

- `./deploy/deploy-oci.sh compute`: fast redeploy workflow for a single VM from your laptop.
- `./deploy/deploy-oci.sh full`: full end-to-end flow (Terraform + compute provisioning + extra block volume + Ansible + verify).
- `./deploy/deploy-oci.sh menu`: interactive operations menu with setup/review/CIDR management ideas.

By default, deployed dashboards are directly accessible with no login wall. Authentication and RBAC are optional hardening features for a later deployment phase and should only be enabled intentionally.

Current packaged release metadata is tracked in [RELEASE_NOTES.md](RELEASE_NOTES.md). The deployed API `/health` and OpenAPI schema report the same backend version.

## Deployment Execution Order

For `./deploy/deploy-oci.sh full` (and menu option `1`), the execution order is:

1. Validate local prerequisites and OCI credentials.
2. Run Terraform `init`, `validate`, and `plan`.
3. Optionally run Terraform `apply` (prompted).
4. Read Terraform `public_subnet_id`/`vcn_id` outputs when available so compute is launched into the just-applied network baseline.
5. Create or reuse compute instance and ensure it is `RUNNING`.
6. Attach extra block volume when enabled.
7. Upload local source archive to the VM.
8. Run Ansible provisioning (packages, venv, dashboard build, `.env`, systemd units, migrations).
9. Run end-to-end verification (`tests/smoke_test_0_9.sh`).

For `./deploy/deploy-oci.sh compute`, Terraform execution is skipped, but existing Terraform outputs are still used for subnet/VCN resolution before falling back to OCI auto-discovery.

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
- wires the compute launch to Terraform `public_subnet_id`/`vcn_id` outputs when present
- creates or reuses the OCI compute instance
- creates and attaches an extra OCI block volume when enabled in `terraform.tfvars`
- uploads the source archive and runs Ansible provisioning automatically
- prints a deployment summary with dashboard/API URLs
- auto-selects direct-port (`:3000/:8000`) or front-door (`:80/:443`) targets when running `verify`

Recommended extra block volume size: `200 GiB` with `10 VPUs/GB` (balanced). That is the default in the example tfvars and the recommended production baseline.

## Prerequisites

- OCI CLI installed and configured (`oci setup config`)
- Node.js `20.9.0` or newer for dashboard dependency install/build. The
  Ansible default installs Node major `20`.
- Deployment default compartment is pinned to:
  `ocid1.compartment.oc1..aaaaaaaa3qjzj6affgfpcnioxmbz6vy2ksynl6h55k3zy5jk5qrnizoxbxya`
  (override only when needed with `OCI_COMPARTMENT_ID`)
- SSH keypair available locally — **must be passphrase-free** (the deploy script calls `ssh-keygen -y -f` to validate the key, which cannot use ssh-agent). Create one with:
  ```bash
  ssh-keygen -t ed25519 -f ~/.ssh/optiora-deploy -N '' -C 'optiora-deploy'
  ```
  Then pass it via:
  ```bash
  export OCI_SSH_PRIVATE_KEY_PATH=~/.ssh/optiora-deploy
  export OCI_SSH_PUBLIC_KEY_PATH=~/.ssh/optiora-deploy.pub
  ```
- outbound access from the VM to package registries and any cloud APIs you plan to call

## Network and Access Control

- Primary ingress control: OCI security list rules from Terraform (`laptop_cidr` + optional `allowed_public_ingress_cidrs`).
- Current default host profile: `firewalld` is managed by automation (`optiora_configure_firewall: true`).
- Current default exposure mode: nginx front door on `:80`/`:443` with direct app ports closed.
- Recommended Terraform posture: `allow_direct_app_ingress=false`, `allow_web_ingress=true`.
- Optional direct-service mode: expose `:3000` and `:8000` only when explicitly required.

Endpoint routing with nginx front-door mode:

- `GET /dashboard*` and general UI routes -> Next.js dashboard (`127.0.0.1:3000`)
- `POST /api/ai/chat` -> Next.js route handler (`127.0.0.1:3000`)
- `GET/POST /api/v1/*` -> FastAPI backend (`127.0.0.1:8000`)
- `POST /auth/*` -> FastAPI backend (`127.0.0.1:8000`)
- `/health`, `/docs`, `/redoc`, `/openapi.json` -> FastAPI backend (`127.0.0.1:8000`)

## Local Preflight

For a clean local bootstrap before preflight checks:

```bash
./setup.sh --clean
```

```bash
python3 -m py_compile $(find ./finops_* -name '*.py')
python3 -m compileall $(find ./finops_* -type d)
.venv/bin/python -m pytest -q

cd dashboard
npm run build
npm run type-check
npm run lint
```

`npm run build` is pinned to webpack mode (`next build --webpack`) for stable
builds across local and OCI runtime hosts.
Run build before standalone type-check after workspace cleanup so `.next/types`
exists before TypeScript reads generated Next.js route types.

Optional Terraform baseline:

```bash
terraform -chdir=../terraform init
terraform -chdir=../terraform validate
terraform -chdir=../terraform plan \
  -var="compartment_id=ocid1.compartment.oc1..aaaaaaaa3qjzj6affgfpcnioxmbz6vy2ksynl6h55k3zy5jk5qrnizoxbxya" \
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
export OCI_COMPARTMENT_ID=ocid1.compartment.oc1..aaaaaaaa3qjzj6affgfpcnioxmbz6vy2ksynl6h55k3zy5jk5qrnizoxbxya
./deploy/deploy-oci.sh compute
./deploy/deploy-oci.sh status
./deploy/deploy-oci.sh verify
```

### Full end-to-end deploy command

Replace the values below with your real credentials. `OCI_PRIVATE_KEY_PATH` is your OCI API signing key (not the SSH deploy key).

```bash
OCI_USER_OCID='ocid1.user.oc1..<user_ocid>' \
OCI_TENANCY_OCID='ocid1.tenancy.oc1..<tenancy_ocid>' \
OCI_FINGERPRINT='<api_key_fingerprint>' \
OCI_PRIVATE_KEY_PATH="$HOME/.oci/oci_api_key.pem" \
OCI_REGION='uk-london-1' \
OCI_COMPARTMENT_ID='ocid1.compartment.oc1..aaaaaaaa3qjzj6affgfpcnioxmbz6vy2ksynl6h55k3zy5jk5qrnizoxbxya' \
OCI_IMAGE_COMPARTMENT_ID='ocid1.tenancy.oc1..<tenancy_ocid>' \
OCI_SUBNET_ID='ocid1.subnet.oc1..<subnet_ocid>' \
OCI_SSH_PUBLIC_KEY_PATH="$HOME/.ssh/optiora-deploy.pub" \
OCI_SSH_PRIVATE_KEY_PATH="$HOME/.ssh/optiora-deploy" \
OCI_PROFILE='DEFAULT' \
./deploy/deploy-oci.sh full
```

`OCI_IMAGE_COMPARTMENT_ID` must be your **tenancy OCID** (not the compartment OCID). Oracle platform images (`Oracle Linux 9`) are published under the root tenancy, not under individual compartments. If this variable is unset, the script attempts to derive it from `OCI_PROFILE` in `~/.oci/config`. Set it explicitly to avoid lookup failures when using a non-DEFAULT profile name.

### GenAI-ready deployment checklist

- Confirm OCI Generative AI is available in your chosen region and your tenancy has access. `uk-london-1` is the primary region for this repository.
- Ensure the following env vars are set before deploy: `OCI_GENAI_ENDPOINT`, `OCI_GENAI_MODEL`, `OCI_COMPARTMENT_OCID`, `OCI_TENANCY_OCID`, `OCI_USER_OCID`, `OCI_FINGERPRINT`, `OCI_REGION`, plus either `OCI_PRIVATE_KEY_PATH` or `OCI_PRIVATE_KEY`.
- Validate OCI CLI works locally: `oci iam region list` and `oci os ns get`.
- If using the deploy script, export the vars (or add to inventory/group_vars for Ansible) so they render into the remote `.env`.
- After deploy, test AI chat via the dashboard or with a JSON `POST` to `/api/ai/chat`.

Re-run `./deploy/deploy-oci.sh compute` after local code changes. The script always redeploys the current local workspace snapshot.

`./deploy/deploy-oci.sh verify` resolves the deployed instance IP and runs `tests/smoke_test_0_9.sh` against the live dashboard/API pair.
By default the smoke test does not upload CSV data, so a live environment remains backed only by provider APIs, saved scan snapshots, or customer-imported files. Set `SMOKE_ENABLE_CSV_IMPORT=true` only when you intentionally want to exercise the CSV import path with temporary smoke data.
The verify flow now includes:

- release-critical live-data route/API gate (`tests/live_data_gate.sh`)
- export endpoint coverage for CSV/XLS/XLSX/PDF/FOCUS
- GenAI contracts in both configured and fallback modes
- auto-detection of direct-port (`:3000/:8000`) vs front-door (`:80/:443`) exposure

The same script also manages the extra block volume. It reads `extra_block_volume_enabled`, `extra_block_volume_size_gbs`, `extra_block_volume_vpus_per_gb`, and `extra_block_volume_device` from `terraform/terraform.tfvars` unless you override them with `OCI_EXTRA_VOLUME_*` environment variables.

### End-to-end deployment timing

The deploy script now prints total runtime at the end of each deployment run:

- `End-to-end compute deploy time: ...`
- `End-to-end full deploy time: ...`

Observed run on **May 1, 2026** (warm compute redeploy to an existing `RUNNING` VM, shape `VM.Standard.E4.Flex` with `1 OCPU / 4 GB`, no extra data volume):

- `End-to-end compute deploy time: 6m 20s`

First-time cold deployments that create a new instance are typically longer.

Quick-deploy troubleshooting on the VM:

```bash
# Service logs (written by systemd via StandardOutput/StandardError)
sudo tail -f /var/log/optiora-api.log
sudo tail -f /var/log/optiora-dashboard.log

# Or via journalctl (always works, even before log files are created)
sudo journalctl -u optiora-api -f
sudo journalctl -u optiora-dashboard -f

# Service status
sudo systemctl status optiora-api
sudo systemctl status optiora-dashboard
```

## What The Deploy Script Applies Automatically

- uploads your local workspace snapshot (no VM-side git clone)
- runs Ansible provisioning on Oracle Linux
- renders `/opt/optiora/.env` from Ansible template values (including `FRONTEND_URL`, `NEXT_PUBLIC_API_URL`, GenAI/runtime settings)
- renders `REQUIRE_LIVE_PROVIDER_DATA=true` by default unless an operator explicitly overrides it for CSV-only PoC mode
- installs/updates backend and dashboard dependencies
- builds the dashboard
- installs/updates systemd units and reloads daemon
- runs `alembic upgrade head`
- restarts services and performs health checks
- resolves GenAI credential/config inputs from exported env vars or local `.env` and injects runtime-safe values for backend narration

The Ansible-rendered `.env` values matter because the dashboard is browser-executed. A localhost API URL in deployed mode would break browser API calls.

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

## Dated Release Evidence Pack

Generate one dated artifact bundle that records the exact commands and outputs used for release-gate proof:

```bash
EVIDENCE_DEPLOY_CMD="./deploy/deploy-oci.sh compute" \
EVIDENCE_MIGRATION_CMD="cd /opt/optiora && ./venv/bin/alembic upgrade head" \
EVIDENCE_SMOKE_CMD="./deploy/deploy-oci.sh verify" \
EVIDENCE_LIVE_CREDENTIAL_CMD="SMOKE_CREDENTIAL_JSON='{\"provider\":\"aws\",\"access_key_id\":\"...\",\"secret_access_key\":\"...\",\"region\":\"us-east-1\"}' ./deploy/deploy-oci.sh verify" \
EVIDENCE_ROLLBACK_CMD="./deploy/deploy-oci.sh restart" \
./scripts/generate_evidence_pack.sh
```

Evidence packs are written under `artifacts/evidence/<UTC-timestamp>/` with:

- `SUMMARY.md` (step status table + exact command inputs)
- `metadata.env` (timestamp, git commit, base URLs, credential-flow flag)
- one `.command.txt` + `.log` pair per step (`deploy`, `migration`, `smoke`, `live_credential_flow`, `rollback`)

## Environment Variables

```env
OCI_REGION=uk-london-1
OCI_COMPARTMENT_ID=ocid1.compartment.oc1..aaaaaaaa3qjzj6affgfpcnioxmbz6vy2ksynl6h55k3zy5jk5qrnizoxbxya
OCI_IMAGE_COMPARTMENT_ID=ocid1.tenancy.oc1...   # set to your tenancy OCID
OCI_INSTANCE_NAME=optiora-api
OCI_SHAPE=VM.Standard.E4.Flex
OCI_OCPU_COUNT=2
OCI_MEMORY_GB=8
OCI_PROFILE=DEFAULT
OCI_SUBNET_ID=ocid1.subnet.oc1...               # run: terraform -chdir=terraform output public_subnet_id
OCI_SSH_PRIVATE_KEY_PATH=~/.ssh/optiora-deploy
OCI_SSH_PUBLIC_KEY_PATH=~/.ssh/optiora-deploy.pub
```

`OCI_IMAGE_COMPARTMENT_ID` is **required for reliable image lookup**. Set it to your tenancy OCID. If unset, the deploy script resolves the platform-image compartment from the tenancy configured in `OCI_PROFILE`. This auto-resolution fails when the profile name in `~/.oci/config` does not match the value of `OCI_PROFILE`.

Optional runtime values copied into the remote `.env`:

```env
# Leave blank for the small deployment profile (SQLite on the VM).
# Set for medium and enterprise deployments to point at PostgreSQL on OCI.
DATABASE_URL=
# License model policy for OCI managed DB services when a choice exists.
# Current default: BYOL.
OCI_DB_LICENSE_MODEL=BYOL
SECRET_KEY=
ENABLE_AUTH=false
NEXT_PUBLIC_ENABLE_AUTH=false
PUBLIC_WORKSPACE_NAME=OptiOra Public Workspace
PUBLIC_WORKSPACE_EMAIL=public@optiora.local
OCI_GENAI_ENDPOINT=https://inference.generativeai.uk-london-1.oci.oraclecloud.com
OCI_GENAI_MODEL=meta.llama-3.3-70b-instruct
OCI_COMPARTMENT_OCID=ocid1.compartment.oc1..aaaaaaaa3qjzj6affgfpcnioxmbz6vy2ksynl6h55k3zy5jk5qrnizoxbxya
# Optional GenAI-specific compartment; overrides OCI_COMPARTMENT_OCID for GenAI calls.
OCI_GENAI_COMPARTMENT_ID=ocid1.compartment.oc1..<genai_compartment_ocid>
OCI_TENANCY_OCID=ocid1.tenancy.oc1..<tenancy_ocid>
OCI_USER_OCID=ocid1.user.oc1..<user_ocid>
OCI_FINGERPRINT=<api_key_fingerprint>
OCI_PRIVATE_KEY_PATH=~/.oci/oci_api_key.pem
# Optional alternative:
# OCI_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
OCI_REGION=<oci_region>
OCI_CONFIG_FILE=
ENVIRONMENT=production
DEPLOYMENT_TARGET=oci
OCI_RUNTIME_REQUIRED=true
PASSWORD_RESET_RETURN_TOKEN=false
PASSWORD_RESET_TOKEN_MINUTES=30
ENABLE_SCAN_SCHEDULER=true
SCAN_SCHEDULER_INTERVAL_MINUTES=60
# Auto-remediation execution gate. Keep false unless explicitly approved.
ENABLE_AUTO_REMEDIATION=false
RETENTION_ENABLED=false
RETENTION_HOT_MONTHS=3
RETENTION_RUN_INTERVAL_HOURS=24
OCI_ARCHIVE_BUCKET=
OCI_ARCHIVE_NAMESPACE=
```

Database deployment policy:

- Small deployment: keep `DATABASE_URL` blank and run on the local SQLite file for the lowest-cost footprint.
- Medium and enterprise deployments: set `DATABASE_URL` to PostgreSQL on OCI.
- When using OCI managed database services that support license-model selection, use `BYOL` by default for now.
- `OCI_DB_*` compatibility fields remain supported if you prefer deriving `DATABASE_URL` instead of setting it explicitly.

Example medium / enterprise PostgreSQL connection string:

```env
DATABASE_URL=postgresql+psycopg2://optiora_user:your_secure_db_password@postgres-hostname.example.com:5432/optiora
```

`OCI_PRIVATE_KEY_PATH` is the preferred deployment option because it avoids fragile multiline env formatting.

- For `deploy/deploy-oci.sh`, export `OCI_CONFIG_FILE`, `OCI_PROFILE`, and `OCI_PRIVATE_KEY_PATH` before deployment, or keep them in local `.env`. The script stages the local OCI config/key to the VM and Ansible installs them under `/opt/optiora/.oci` as the `optiora` user with `0600` permissions.
- If `OCI_PRIVATE_KEY_PATH` is not set, the deploy script reads `key_file` from the selected local OCI profile.
- For Ansible-only provisioning, upload the files yourself and set `optiora_oci_config_file=/opt/optiora/.oci/config`, `optiora_oci_profile=<profile>`, and `optiora_private_key_path=/opt/optiora/.oci/oci_api_key.pem`.
- Use `OCI_PRIVATE_KEY` only when you intentionally need to inject the PEM inline with literal `\n` escapes.
- Enable `RETENTION_ENABLED` only after `OCI_ARCHIVE_BUCKET` and `OCI_ARCHIVE_NAMESPACE` point to the Object Storage archive bucket created by Terraform.

OCI credential file source policy:

- OptiOra validates OCI credentials from files that exist on the API host filesystem; browser-local paths are not readable by the backend.
- Preferred persistent path: provision `/opt/optiora/.oci/config` and `/opt/optiora/.oci/oci_api_key.pem` on the VM with owner `optiora` and mode `600`.
- Dashboard import path: use `POST /api/v1/credentials/oci/upload-files` from the dashboard OCI form to upload config/key files into the server runtime credential directory; then add the credential using the returned server `config_file` path.
- After a credential is inserted and validated, OptiOra stores the connection metadata, persists runtime credentials on the API host, approves the provider for scanning, and starts a scan immediately. The connection remains listed until the customer disconnects it manually; if provider APIs later reject or cannot reach the credential, OptiOra marks the connection invalid/inactive instead of showing fabricated data.
- Avoid committing OCI config/key files to git or embedding private keys in docs/scripts.

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

GenAI validation (works for small/default/enterprise profiles and for direct/nginx exposure):

```bash
curl "http://<instance-ip>:8000/api/v1/advisor/hybrid?narrative_type=optimization_roadmap" \
  | jq '.advisory.genai_configured, .advisory.fallback_mode, .advisory.prompt'
curl -X POST "http://<instance-ip>:8000/api/v1/genai/analyze" \
  -H "Content-Type: application/json" \
  -d '{"analysis_type":"spend","context":{"current_monthly_spend_usd":1000,"estimated_monthly_waste_usd":120,"identified_monthly_savings_usd":80,"risk_score":32}}' \
  | jq '.genai_configured, .fallback_mode, .prompt'
```

Optional scheduler smoke test (authenticated mode with owner/admin role):

```bash
curl -X POST http://<instance-ip>:8000/api/v1/scanning/scheduler/run-now
```

Manual product checks:

1. Open `http://<instance-ip>:3000/dashboard` and confirm the dashboard opens directly with no login wall.
2. Upload a UTF-8 billing CSV from the settings page and confirm the imported dataset summary updates.
3. Confirm the costs overview reflects the imported CSV totals.
4. If live provider validation is in scope, add one cloud provider credential and confirm the automatic scan starts.
5. Confirm history, diff, alerts, and CSV/XLS/XLSX/PDF/FOCUS exports still work after deployment.

Optional live credential verification:

```bash
SMOKE_CREDENTIAL_JSON='{"provider":"aws","access_key_id":"...","secret_access_key":"...","region":"us-east-1"}' \
./deploy/deploy-oci.sh verify
```

When `SMOKE_CREDENTIAL_JSON` is provided, the verify flow also exercises credential validation, credential add, scan approval, scan start, history lookup, and diff export for that provider.
Set `SMOKE_ENABLE_CSV_IMPORT=true` separately if you want the smoke test to replace the active imported-cost dataset with its temporary CSV fixture.

If you run nginx-only exposure (`allow_direct_app_ingress=false`, `allow_web_ingress=true`), verify using front-door overrides:

```bash
HOST=http://<instance-ip> API_BASE=http://<instance-ip> DASHBOARD_BASE=http://<instance-ip> ./deploy/deploy-oci.sh verify
```

If HTTPS uses a self-signed certificate, run verification with:

```bash
SMOKE_CURL_INSECURE=true ./deploy/deploy-oci.sh verify
```

On the VM:

```bash
sudo systemctl status optiora-api
sudo systemctl status optiora-dashboard
sudo journalctl -u optiora-api -n 100 --no-pager
sudo journalctl -u optiora-dashboard -n 100 --no-pager
sudo tail -f /var/log/optiora-api.log
sudo tail -f /var/log/optiora-dashboard.log
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
4. Check DB config: `DATABASE_URL` or `OCI_DB_*`, and confirm the intended profile matches the deployment size

### Dashboard unreachable

1. `sudo journalctl -u optiora-dashboard -n 100 --no-pager`
2. Confirm `NEXT_PUBLIC_API_URL` in `/opt/optiora/.env` points to a browser-reachable API URL (direct `:8000` or nginx front-door URL)
3. Ensure `node -v` and `npm -v` work on the instance

### Live provider credential validation failures

1. Re-check provider permissions and region/subscription/project/profile values
2. Confirm outbound egress from the subnet to the relevant cloud provider APIs
3. Use `/api/v1/credentials/validate` response details for root cause
4. For OCI:
   - `OCI_CONFIG_FILE` must exist on the backend host filesystem.
   - Profile names must be plain section names (`JNB`), not bracketed (`[JNB]`).
   - When needed for test workflows, use `POST /api/v1/credentials/oci/upload-files` and validate with the returned server path.
   - Usage API may require tenancy home-region routing; OptiOra now retries OCI usage validation against the home region automatically.
5. Run runtime connectivity checks from the backend host:

```bash
PYTHONPATH=. .venv/bin/python scripts/check_cloud_connectivity.py
```

### CSV import failures

1. Confirm the uploaded file is a UTF-8 `.csv`
2. Confirm the CSV header includes `provider` and `cost_usd`
3. Confirm `provider` values are limited to `aws`, `azure`, `gcp`, or `oci`
4. Confirm `currency` is omitted or set to `USD`

## Known Issues and Workarounds

### passlib + bcrypt ≥ 4.x incompatibility (fixed)

`passlib 1.7.4` (the last release, now unmaintained) cannot detect the `bcrypt` backend version when `bcrypt >= 4.0.0` is installed, because `bcrypt` removed its `__about__` module in that release. This causes a crash at API startup.

`pyproject.toml` pins `bcrypt = ">=3.2.0,<4.0.0"` to avoid this. Do not bump the bcrypt constraint until passlib is replaced.

### Python version on Oracle Linux 9 (resolved)

Oracle Linux 9 ships Python 3.9, which is below the `requires-python = ">=3.10"` floor in `pyproject.toml`. The Ansible playbook installs `python3.11` and `python3.11-devel` via `dnf` and creates the virtualenv with `python3.11` explicitly. The default `python3` symlink on OL9 is not used.

### SQLite DB owned by root after first deploy (fixed)

When `alembic upgrade head` runs under root (via the Ansible `command` module), it creates `optiora.db` owned by root. The `optiora` service user cannot write to it, causing a startup crash. The Ansible playbook includes a "Fix database file ownership" task that runs immediately after migrations, using the correct `optiora_app_user` variable.

### SSH key must be passphrase-free

The deploy script calls `ssh-keygen -y -f` to extract the public key from the private key file. This call does not use `ssh-agent` and will hang or fail if the key has a passphrase. Generate a dedicated deploy key without a passphrase:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/optiora-deploy -N '' -C 'optiora-deploy'
```

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

## Contact / Pilot

Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot
