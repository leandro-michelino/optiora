# OptiOra Ansible Provisioning

Terraform stays limited to OCI infrastructure primitives: VCN, subnet, route table, internet gateway, and security list. Ansible owns host provisioning and application runtime configuration.

Primary OCI region defaults to `uk-london-1` so the deployed stack can lean on OCI GenAI by default.

Preferred end-to-end path:

```bash
./deploy/deploy-oci.sh full
```

The single deploy script generates the temporary inventory, applies Terraform when requested, creates/attaches the extra OCI data volume when enabled, uploads the source archive, and then runs this playbook automatically.

## First Run

1. Apply or otherwise create the OCI compute host.
2. Copy the inventory example and set the host IP if you are running Ansible manually:

```bash
cp ansible/inventory.example.yml ansible/inventory.yml
```

3. Run the playbook:

```bash
ansible-playbook -i ansible/inventory.yml ansible/playbooks/site.yml
```

When the playbook finishes successfully it now prints a deployment summary with the dashboard URL, AI insights URL, cost advisor URL, API endpoints, SSH command, log commands, and the active OCI GenAI region/endpoint.

Recommended data disk sizing: `200 GiB` at `10 VPUs/GB` (balanced). That is enough headroom for the database, imported billing files, exports, and dashboard build artifacts without wasting money on a very large boot disk.

## Source Deployment

By default, `optiora_manage_source` is `false`, so Ansible expects the app source to already exist on the host at `/opt/optiora`. Set it to `true` after uploading an archive to `/tmp/optiora-deploy.tar.gz`:

```bash
tar -czf /tmp/optiora-deploy.tar.gz \
  --exclude=.git \
  --exclude=.venv \
  --exclude=dashboard/node_modules \
  --exclude=dashboard/.next \
  .
scp /tmp/optiora-deploy.tar.gz opc@<host>:/tmp/optiora-deploy.tar.gz
ansible-playbook -i ansible/inventory.yml ansible/playbooks/site.yml \
  -e optiora_manage_source=true
```

## Secrets

Pass sensitive values through Ansible Vault or environment-specific extra vars, not committed files:

```bash
ansible-playbook -i ansible/inventory.yml ansible/playbooks/site.yml \
  -e optiora_secret_key="$(openssl rand -hex 32)" \
  -e optiora_private_key_path="~/.oci/oci_api_key.pem" \
  -e optiora_genai_model="ocid1.generativeaimodel.oc1..<model_ocid>"
```

The Ansible path deploys the public dashboard mode by default:

- `optiora_enable_auth: false`
- direct dashboard access with no login wall
- RBAC/auth left available only as optional hardening later

Migrations are applied before the health checks so schema-changing releases come up cleanly.

## VM Best-Practice Hardening

The playbook now applies host-level hardening defaults suitable for production VMs:

- automatic security updates (`unattended-upgrades` on Debian/Ubuntu, `dnf-automatic` on Oracle Linux/RHEL)
- baseline firewall policy (SSH + web ports, or API/UI direct ports when nginx is disabled)
- fail2ban on Debian/Ubuntu
- kernel safety defaults (`tcp_syncookies`, reverse path filtering, swappiness)
- elevated file descriptor limits for high-concurrency API/UI workloads
- stricter systemd service confinement for API and dashboard

These are controlled via `ansible/group_vars/all.yml`:

- `optiora_vm_hardening`
- `optiora_auto_security_updates`
- `optiora_enable_fail2ban`
- `optiora_configure_firewall`
- `optiora_ssh_port`
- `optiora_firewall_expose_direct_services`
- `optiora_sysctl_vm_swappiness`
- `optiora_limits_nofile_soft`
- `optiora_limits_nofile_hard`
