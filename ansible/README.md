# OptiOra Ansible Provisioning

Terraform stays limited to OCI infrastructure primitives: VCN, subnet, route table, internet gateway, and security list. Ansible owns host provisioning and application runtime configuration.

Primary OCI region defaults to `uk-london-1` so the deployed stack can lean on OCI GenAI by default.
Ansible-driven runtime compartment values are intentionally blank in versioned defaults. The deploy script passes the resolved `OCI_COMPARTMENT_ID` into the temporary Ansible vars file, and manual runs should provide real OCIDs through inventory, vault, or extra vars.

Preferred end-to-end path:

```bash
./deploy/deploy-oci.sh menu
```

The single deploy script generates the temporary inventory, applies Terraform when requested, creates/attaches the extra OCI data volume when enabled, uploads the source archive, and then runs this playbook automatically.

Provisioning is Oracle Linux-only by policy. The playbook asserts `ansible_distribution == OracleLinux` before installing packages.
Production service runtime is OCI-only by policy. The role renders `DEPLOYMENT_TARGET=oci` and `OCI_RUNTIME_REQUIRED=true`, and the API/dashboard systemd units include an OCI instance metadata `ExecStartPre` guard so they do not run on on-premises hosts.

## First Run

1. Apply or otherwise create the OCI compute host.
2. Copy the inventory example and set the host IP if you are running Ansible manually:

```bash
cp ansible/inventory.example.yml ansible/inventory.yml
```

`ansible/inventory.yml` is intentionally gitignored so host/IP/key changes remain local.

3. Run the playbook:

```bash
ansible-playbook -i ansible/inventory.yml ansible/playbooks/site.yml
```

The playbook prints two operator-facing summaries:

- a provisioning plan before changes begin, covering target host, runtime, ports, auth posture, data policy, scheduler/retention, and storage mode
- a completion summary with dashboard/API/doc URLs, local health checks, service active/enabled state, runtime versions, storage usage, GenAI settings, verification commands, log commands, restart/migration commands, next steps, and reachability troubleshooting hints

Recommended data disk sizing: `200 GiB` at `10 VPUs/GB` (balanced). That is enough headroom for the database, imported billing files, exports, and dashboard build artifacts without wasting money on a very large boot disk.

When an OCI managed database service is used and licensing model selection is available, keep `optiora_oci_db_license_model: "BYOL"` (current default policy).

## Source Deployment

By default, `optiora_manage_source` is `false`, so Ansible expects the app source to already exist on the host at `/opt/optiora`. Set it to `true` after uploading an archive to `/tmp/optiora-deploy.tar.gz`:

```bash
tar -czf /tmp/optiora-deploy.tar.gz \
  --exclude=.git \
  --exclude=.env \
  --exclude=.venv \
  --exclude=dashboard/node_modules \
  --exclude=dashboard/.next \
  --exclude=terraform/terraform.tfvars \
  --exclude=terraform/*.tfstate \
  --exclude=optiora.db \
  .
scp /tmp/optiora-deploy.tar.gz opc@<host>:/tmp/optiora-deploy.tar.gz
ansible-playbook -i ansible/inventory.yml ansible/playbooks/site.yml \
  -e optiora_manage_source=true
```

When `optiora_manage_source=true`, the role removes local-only generated artifacts from earlier deployments before unpacking the new archive. This keeps stale dashboard builds, `node_modules`, cache folders, Terraform state/tfvars, and test reports out of `/opt/optiora` while preserving runtime files such as `.env`, `.oci`, `venv`, and `optiora.db`.

## Runtime Credentials And Secrets

Pass sensitive values through Ansible Vault or environment-specific extra vars, not committed files:

```bash
ansible-playbook -i ansible/inventory.yml ansible/playbooks/site.yml \
  -e optiora_secret_key="$(openssl rand -hex 32)" \
  -e optiora_oci_config_file="/opt/optiora/.oci/config" \
  -e optiora_private_key_path="/opt/optiora/.oci/oci_api_key.pem" \
  -e optiora_genai_model="ocid1.generativeaimodel.oc1..<model_ocid>"
```

The root `deploy/deploy-oci.sh` flow stages the local OCI config/key in `/tmp` and lets this role install them under `/opt/optiora/.oci` with `0600` permissions. For Ansible-only runs, upload those files yourself before running the playbook, then point `optiora_oci_config_file` and `optiora_private_key_path` at the target-host paths.

The Ansible path deploys the public dashboard mode by default:

- `optiora_enable_auth: false`
- `optiora_require_live_provider_data: true`
- direct dashboard access with no login wall
- live provider credentials are required for production API startup unless explicitly overridden for CSV-only PoC mode
- RBAC/auth left available only as optional hardening later

Migrations are applied before the health checks so schema-changing releases come up cleanly.

## VM Best-Practice Hardening

The playbook now applies host-level hardening defaults suitable for production VMs:

- automatic security updates with `dnf-automatic`
- optional host firewall policy (disabled by default in the current deploy profile; OCI security lists remain the primary ingress control)
- SSH daemon hardening that keeps source-IP access control out of `sshd`; SSH ingress is controlled by OCI security lists/network security groups
- kernel safety defaults (`tcp_syncookies`, reverse path filtering, swappiness)
- elevated file descriptor limits for high-concurrency API/UI workloads
- stricter systemd service confinement for API and dashboard

These are controlled via `ansible/group_vars/all.yml`:

- `optiora_vm_hardening`
- `optiora_auto_security_updates`
- `optiora_configure_firewall`
- `optiora_ssh_port`
- `optiora_firewall_expose_direct_services`
- `optiora_sysctl_vm_swappiness`
- `optiora_limits_nofile_soft`
- `optiora_limits_nofile_hard`

Current defaults in `ansible/group_vars/all.yml`:

- `optiora_install_nginx: true` (nginx front-door mode)
- `optiora_configure_firewall: true` (firewalld managed/enforced)
- `optiora_firewall_expose_direct_services: false` (keep direct app ports closed by default)

## Contact / Pilot

Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot
