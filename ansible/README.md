# OptiOra Ansible Provisioning

Terraform stays limited to OCI infrastructure primitives: VCN, subnet, route table, internet gateway, and security list. Ansible owns host provisioning and application runtime configuration.

## First Run

1. Apply or otherwise create the OCI compute host.
2. Copy the inventory example and set the host IP:

```bash
cp ansible/inventory.example.yml ansible/inventory.yml
```

3. Run the playbook:

```bash
ansible-playbook -i ansible/inventory.yml ansible/playbooks/site.yml
```

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
  -e optiora_anthropic_api_key="$ANTHROPIC_API_KEY"
```
