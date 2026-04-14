# OptiOra Deployment Guide (OCI)

This repository deploys two services onto one OCI compute instance:

- `optiora-api.service` -> FastAPI backend on `:8000`
- `optiora-dashboard.service` -> Next.js dashboard on `:3000`

Deployment can be done two ways:

- `deploy/deploy-oci.sh` for a single laptop-driven command that creates/starts compute, uploads code, installs dependencies, and restarts services.
- Terraform plus Ansible, where Terraform stays limited to OCI network infrastructure and Ansible provisions the host/runtime.

## Prerequisites

- OCI CLI installed and configured (`oci setup config`)
- `OCI_COMPARTMENT_ID` exported
- SSH keypair available locally
- outbound access from the VM to package registries and cloud APIs

## Local Preflight

```bash
python3 -m py_compile finops_mcp/*.py finops_mcp/tools/*.py
python3 -m compileall finops_mcp

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
  -var="region=af-johannesburg-1" \
  -var="laptop_cidr=<your_public_ip>/32"
```

Optional Ansible host provisioning:

```bash
cp ansible/inventory.example.yml ansible/inventory.yml
ansible-playbook -i ansible/inventory.yml ansible/playbooks/site.yml
```

## Quick Deploy

```bash
export OCI_COMPARTMENT_ID=ocid1.compartment.oc1...
./deploy/deploy-oci.sh compute
./deploy/deploy-oci.sh status
```

Re-run `./deploy/deploy-oci.sh compute` after local code changes. The script always redeploys the current local workspace snapshot.

## What The Deploy Script Fixes Automatically

- creates `.env` from `.env.example` if missing
- rewrites `FRONTEND_URL` to `http://<instance-ip>:3000`
- rewrites `NEXT_PUBLIC_API_URL` to `http://<instance-ip>:8000`
- replaces placeholder `SECRET_KEY` values with a generated secret
- builds the dashboard after the remote env has been corrected

Those rewrites matter because the dashboard is browser-executed; leaving `NEXT_PUBLIC_API_URL=http://localhost:8000` would break the deployed UI.

## Command Reference

```bash
./deploy/deploy-oci.sh compute
./deploy/deploy-oci.sh status
./deploy/deploy-oci.sh logs
./deploy/deploy-oci.sh stop
./deploy/deploy-oci.sh start
./deploy/deploy-oci.sh restart
./deploy/deploy-oci.sh destroy
```

## Environment Variables

```env
OCI_REGION=af-johannesburg-1
OCI_COMPARTMENT_ID=ocid1.compartment.oc1...
OCI_INSTANCE_NAME=optiora-api
OCI_SHAPE=VM.Standard.E4.Flex
OCI_OCPU_COUNT=2
OCI_MEMORY_GB=8
OCI_SUBNET_ID=ocid1.subnet.oc1...
OCI_SSH_PRIVATE_KEY_PATH=~/.ssh/id_ed25519
OCI_SSH_PUBLIC_KEY_PATH=~/.ssh/id_ed25519.pub
```

Optional runtime values copied into the remote `.env`:

```env
DATABASE_URL=
SECRET_KEY=
ANTHROPIC_API_KEY=
OCI_CONFIG_FILE=
ENVIRONMENT=production
PASSWORD_RESET_RETURN_TOKEN=false
PASSWORD_RESET_TOKEN_MINUTES=30
```

## Post-Deployment Validation

```bash
curl http://<instance-ip>:8000/health
curl http://<instance-ip>:8000/api/v1/info
curl http://<instance-ip>:3000
```

On the VM:

```bash
sudo systemctl status optiora-api
sudo systemctl status optiora-dashboard
sudo tail -f /var/log/optiora-api.log
sudo tail -f /var/log/optiora-dashboard.log
sudo tail -f /var/log/optiora-setup.log
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

### Credential validation failures

1. Re-check provider permissions and region/subscription/project values
2. Confirm outbound egress from the subnet to the cloud provider APIs
3. Use `/api/v1/credentials/validate` response details for root cause

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
│   ├── finops_mcp
│   ├── dashboard
│   ├── .env
│   └── venv
├── optiora-api.service
└── optiora-dashboard.service
```
