# Terraform OCI Baseline

This folder contains the OCI infrastructure baseline used by OptiOra: network, security list, Object Storage archive bucket, Terraform-managed compute, optional data volume attachment, and optional Resource Scheduler resources. Ansible owns host setup and service configuration after Terraform returns the instance outputs.

This module currently does not provision OCI databases. If you extend it with OCI managed database resources, use BYOL as the default license model where OCI offers that choice.

Preferred operator flow is the interactive root setup wizard:

```bash
./deploy/deploy-oci.sh menu
```

That flow manages Terraform variables and optional apply, then hands the Terraform-managed instance to Ansible for provisioning.
The guided flow rejects placeholder values, writes the resolved `compartment_id`, `laptop_cidr`, `oci_object_storage_namespace`, compute, image, SSH public key, and data-volume settings into `terraform/terraform.tfvars`, and exports matching `TF_VAR_*` values for the run.

Deployment order is intentionally Terraform first, then source upload, then Ansible runtime configuration, then smoke verification. Terraform should not be used to push application secrets; OCI config/key material is staged by `deploy/deploy-oci.sh` and installed by Ansible under `/opt/optiora/.oci`.

Terraform remains infrastructure-only. Application packages, `.env`, migrations, dashboard builds, systemd services, nginx, and health checks stay in Ansible.

## Design Intent

- OCI naming convention:
  - `vcn-<project>-<env>-<region>-<suffix>`
  - `igw-<project>-<env>-<region>-<suffix>`
  - `rt-public-<project>-<env>-<region>-<suffix>`
  - `sl-public-<project>-<env>-<region>-<suffix>`
  - `subnet-public-<project>-<env>-<region>-<suffix>`
- ingress is restricted to `laptop_cidr` plus optional `allowed_public_ingress_cidrs`
- outbound traffic is controlled by `egress_cidr`
- compute instance and data volume are Terraform-managed when `compute_enabled=true`
- compute bootstrap, packages, `.env`, builds, nginx, and systemd are handled by `../ansible` on Oracle Linux hosts

## Defaults

- `laptop_cidr`: required, used for SSH/UI/API ingress
- `allowed_public_ingress_cidrs`: optional additional ingress CIDRs
- `allow_direct_app_ingress`: controls exposure of ports `3000`/`8000`
- `allow_web_ingress`: controls exposure of ports `80`/`443`
- `egress_cidr`: defaults to `0.0.0.0/0`
- `compute_enabled`: controls whether Terraform creates the OptiOra VM
- `instance_name`, `compute_shape`, `compute_ocpus`, `compute_memory_gb`: VM identity and sizing
- `ssh_public_key`: public key inserted into instance metadata
- `image_compartment_id`: tenancy OCID used for Oracle platform image lookup
- `extra_block_volume_enabled`: whether Terraform creates and attaches the persistent data disk
- `extra_block_volume_size_gbs`: recommended default `200`
- `extra_block_volume_vpus_per_gb`: recommended default `10` (balanced)
- `extra_block_volume_device`: expected device path on the VM, default `/dev/oracleoci/oraclevdb`
- `resource_scheduler_enabled`: creates OCI Resource Scheduler schedules for selected resources
- `resource_scheduler_resource_ids`: extra resource OCIDs controlled by the schedules; the Terraform-managed instance is included automatically when compute is enabled
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
terraform fmt -check *.tf
terraform init
terraform validate
terraform plan \
  -var="compartment_id=ocid1.compartment.oc1..<compartment_ocid>" \
  -var="region=uk-london-1" \
  -var="oci_object_storage_namespace=<your_object_storage_namespace>" \
  -var="laptop_cidr=<your_public_ip>/32" \
  -var="compute_enabled=true" \
  -var="ssh_public_key=$(cat ~/.ssh/optiora-deploy.pub)" \
  -var="image_compartment_id=ocid1.tenancy.oc1..<tenancy_ocid>"

# Add office/VPN CIDRs if needed:
# -var='allowed_public_ingress_cidrs=["203.0.113.0/24","198.51.100.8/32"]'

# Prefer web-only exposure when using nginx/TLS:
# -var='allow_direct_app_ingress=false' -var='allow_web_ingress=true'
```

Example with restricted egress:

```bash
terraform plan \
  -var="compartment_id=ocid1.compartment.oc1..<compartment_ocid>" \
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

When Terraform manages the OptiOra instance, enabling scheduling automatically targets that instance. To schedule additional resources, add them in `terraform/terraform.tfvars`:

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

`terraform apply` is intentionally not forced in the default guided flow; `menu` and `full` explicitly ask for confirmation before apply. After infrastructure exists, `deploy/deploy-oci.sh full` reads Terraform `instance_id`, `instance_public_ip`, and data-volume outputs, then hands that host to Ansible. The Terraform apply output ends with a next-step banner that points operators to the Ansible flow, dashboard URL pattern, API URLs, and OCI GenAI endpoint for the chosen region.

## Topology

```text
VCN
└── Public Subnet
    ├── Ingress: 22 (+ optional 3000/8000 and 80/443) <- laptop_cidr + allowed_public_ingress_cidrs
    └── Egress: all -> egress_cidr
```

## Contact / Pilot

Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot
