# Terraform Network Baseline

This folder contains the OCI network baseline used by OptiOra. It does not provision the application runtime; Ansible owns host setup and service configuration.

This module currently does not provision OCI databases. If you extend it with OCI managed database resources, use BYOL as the default license model where OCI offers that choice.

Preferred operator flow is the interactive root setup wizard:

```bash
./deploy/deploy-oci.sh menu
```

That flow manages Terraform variables and optional apply, then hands off to the same deploy script for compute creation, extra data volume attachment, and Ansible provisioning.

Deployment order is intentionally Terraform first, then compute/source upload, then Ansible runtime configuration, then smoke verification. Terraform should not be used to push application secrets; OCI config/key material is staged by `deploy/deploy-oci.sh` and installed by Ansible under `/opt/optiora/.oci`.

## Design Intent

- OCI naming convention:
  - `vcn-<project>-<env>-<region>-<suffix>`
  - `igw-<project>-<env>-<region>-<suffix>`
  - `rt-public-<project>-<env>-<region>-<suffix>`
  - `sl-public-<project>-<env>-<region>-<suffix>`
  - `subnet-public-<project>-<env>-<region>-<suffix>`
- ingress is restricted to `laptop_cidr` plus optional `allowed_public_ingress_cidrs`
- outbound traffic is controlled by `egress_cidr`
- compute bootstrap, packages, `.env`, builds, and systemd are handled by `../ansible` on Oracle Linux hosts

## Defaults

- `laptop_cidr`: required, used for SSH/UI/API ingress
- `allowed_public_ingress_cidrs`: optional additional ingress CIDRs
- `allow_direct_app_ingress`: controls exposure of ports `3000`/`8000`
- `allow_web_ingress`: controls exposure of ports `80`/`443`
- `egress_cidr`: defaults to `0.0.0.0/0`
- `extra_block_volume_enabled`: whether the deploy script creates and attaches the persistent data disk
- `extra_block_volume_size_gbs`: recommended default `200`
- `extra_block_volume_vpus_per_gb`: recommended default `10` (balanced)
- `extra_block_volume_device`: expected device path on the VM, default `/dev/oracleoci/oraclevdb`
- `resource_scheduler_enabled`: creates OCI Resource Scheduler schedules for selected resources
- `resource_scheduler_resource_ids`: resource OCIDs controlled by the schedules, normally the OptiOra compute instance OCID
- `resource_scheduler_start_cron`: UTC cron for weekday startup, default `0 7 * * 1-5`
- `resource_scheduler_stop_cron`: UTC cron for weekday shutdown, default `0 18 * * 1-5`
- `resource_scheduler_manage_instance_policy`: creates the IAM policy that lets the schedules manage compute instances

That default keeps the subnet usable for:

- package installation during provisioning
- OCI/API egress
- dashboard/backend dependency installation

If you want a more restrictive outbound policy, override `egress_cidr`.

## Usage

```bash
terraform init
terraform validate
terraform plan \
  -var="compartment_id=ocid1.compartment.oc1..aaaaaaaa3qjzj6affgfpcnioxmbz6vy2ksynl6h55k3zy5jk5qrnizoxbxya" \
  -var="region=uk-london-1" \
  -var="oci_object_storage_namespace=<your_object_storage_namespace>" \
  -var="laptop_cidr=<your_public_ip>/32"

# Add office/VPN CIDRs if needed:
# -var='allowed_public_ingress_cidrs=["203.0.113.0/24","198.51.100.8/32"]'

# Prefer web-only exposure when using nginx/TLS:
# -var='allow_direct_app_ingress=false' -var='allow_web_ingress=true'
```

Example with restricted egress:

```bash
terraform plan \
  -var="compartment_id=ocid1.compartment.oc1..aaaaaaaa3qjzj6affgfpcnioxmbz6vy2ksynl6h55k3zy5jk5qrnizoxbxya" \
  -var="oci_object_storage_namespace=<your_object_storage_namespace>" \
  -var="laptop_cidr=<your_public_ip>/32" \
  -var="egress_cidr=<trusted-egress-cidr>"
```

## OCI Resource Scheduler

The optional Resource Scheduler setup creates two active schedules:

- `START_RESOURCE` on Monday-Friday at `resource_scheduler_start_cron`
- `STOP_RESOURCE` on Monday-Friday at `resource_scheduler_stop_cron`

OCI evaluates Resource Scheduler cron expressions in UTC. The example defaults
use `0 7 * * 1-5` and `0 18 * * 1-5`, which map to 09:00 and 20:00 in
Europe/Madrid during CEST (UTC+2). During CET (UTC+1), use `0 8 * * 1-5`
and `0 19 * * 1-5` if exact local winter hours are required.

After the compute instance exists, get its OCID:

```bash
./deploy/deploy-oci.sh status
```

Then enable scheduling in `terraform/terraform.tfvars`:

```hcl
resource_scheduler_enabled = true
resource_scheduler_resource_ids = [
  "ocid1.instance.oc1..your_optiora_compute_instance_ocid",
]
```

Apply the scheduler resources:

```bash
terraform -chdir=terraform plan
terraform -chdir=terraform apply
```

`terraform apply` is intentionally not forced in the default guided flow; `menu` and `full` explicitly ask for confirmation before apply. After infrastructure exists, run the Ansible playbook from `../ansible` for application provisioning on Oracle Linux hosts. The Terraform apply output now ends with a next-step banner that points operators to the Ansible command, dashboard URL pattern, API URLs, and OCI GenAI endpoint for the chosen region.

## Topology

```text
VCN
└── Public Subnet
    ├── Ingress: 22 (+ optional 3000/8000 and 80/443) <- laptop_cidr + allowed_public_ingress_cidrs
    └── Egress: all -> egress_cidr
```
