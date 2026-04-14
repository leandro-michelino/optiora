# OptiOra Deployment Guide (OCI)

This project is deployed as two services on an OCI compute instance:

- `optiora-api.service` -> FastAPI backend (`:8000`)
- `optiora-dashboard.service` -> Next.js dashboard (`:3000`)

Deployment is laptop-driven: `deploy/deploy-oci.sh` packages your current local workspace and pushes it to OCI over SSH/SCP. It does not pull from Git or require CI/CD triggers.

## Prerequisites

- OCI CLI installed and configured (`oci setup config`)
- `OCI_COMPARTMENT_ID` exported
- SSH access allowed to created instance

## Local Preflight (Recommended)

```bash
python3 -m py_compile finops_mcp/*.py finops_mcp/tools/*.py
cd dashboard
npm run type-check
npm run lint
npm run build
```

## Quick Deploy

```bash
export OCI_COMPARTMENT_ID=ocid1.compartment.oc1...
./deploy/deploy-oci.sh compute
./deploy/deploy-oci.sh status
```

Re-run `./deploy/deploy-oci.sh compute` any time you change code locally; the script re-packages your current local files and redeploys them to the VM.

## Command Reference

```bash
./deploy/deploy-oci.sh compute     # Deploy / redeploy
./deploy/deploy-oci.sh status      # Show instance + public IP
./deploy/deploy-oci.sh logs        # Print SSH/log tail instructions
./deploy/deploy-oci.sh stop        # Stop compute instance
./deploy/deploy-oci.sh start       # Start compute instance
./deploy/deploy-oci.sh restart     # Reboot compute instance
./deploy/deploy-oci.sh destroy     # Terminate instance
```

## Environment Variables

```env
OCI_REGION=us-phoenix-1
OCI_COMPARTMENT_ID=ocid1.compartment.oc1...
OCI_INSTANCE_NAME=optiora-api
OCI_SHAPE=VM.Standard.E4.Flex
OCI_OCPU_COUNT=2
OCI_MEMORY_GB=8
OCI_SUBNET_ID=ocid1.subnet.oc1...
OCI_SSH_PRIVATE_KEY_PATH=~/.ssh/id_ed25519
OCI_SSH_PUBLIC_KEY_PATH=~/.ssh/id_ed25519.pub
```

Optional backend runtime variables:

```env
PORT=8000
UVICORN_RELOAD=false
FRONTEND_URL=http://<instance-ip>:3000
```

## Post-Deployment Validation

```bash
curl http://<instance-ip>:8000/health
curl http://<instance-ip>:8000/api/v1/info
```

Check services on host:

```bash
sudo systemctl status optiora-api
sudo systemctl status optiora-dashboard
sudo tail -f /var/log/optiora-api.log
sudo tail -f /var/log/optiora-dashboard.log
```

## Troubleshooting

### API unhealthy

1. `sudo journalctl -u optiora-api -n 100 --no-pager`
2. Confirm env file exists: `/opt/optiora/.env`
3. Validate Python deps in venv: `/opt/optiora/venv/bin/pip list`

### Dashboard unreachable

1. `sudo journalctl -u optiora-dashboard -n 100 --no-pager`
2. Ensure Node installed on instance (`node -v`, `npm -v`)
3. Confirm service starts from `/opt/optiora/dashboard`

### Credential validation failures

1. Re-check provider credentials and required permissions
2. Ensure outbound access to cloud provider APIs
3. Use `/api/v1/credentials/validate` response details for root cause

## Deployment Architecture (ASCII)

```text
OCI Compute VM
├── /opt/optiora
│   ├── finops_mcp (FastAPI app)
│   └── dashboard (Next.js app)
├── systemd
│   ├── optiora-api.service
│   └── optiora-dashboard.service
└── logs
    ├── /var/log/optiora-api.log
    ├── /var/log/optiora-dashboard.log
    └── /var/log/optiora-setup.log
```
