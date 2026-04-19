# Terraform Network Baseline

This folder contains the OCI network baseline used by OptiOra. It does not provision the application runtime; Ansible owns host setup and service configuration.

Preferred operator flow is the interactive root setup wizard:

```bash
./setup.sh --interactive
```

That flow manages Terraform variables and optional apply, then hands off to Ansible.

## Design Intent

- OCI naming convention:
  - `vcn-<project>-<env>-<region>-<suffix>`
  - `igw-<project>-<env>-<region>-<suffix>`
  - `rt-public-<project>-<env>-<region>-<suffix>`
  - `sl-public-<project>-<env>-<region>-<suffix>`
  - `subnet-public-<project>-<env>-<region>-<suffix>`
- ingress is restricted to `laptop_cidr` plus optional `allowed_public_ingress_cidrs`
- outbound traffic is controlled by `egress_cidr`
- compute bootstrap, packages, `.env`, builds, and systemd are handled by `../ansible`, including Oracle Linux / RHEL hosts

## Defaults

- `laptop_cidr`: required, used for SSH/UI/API ingress
- `allowed_public_ingress_cidrs`: optional additional ingress CIDRs
- `allow_direct_app_ingress`: controls exposure of ports `3000`/`8000`
- `allow_web_ingress`: controls exposure of ports `80`/`443`
- `egress_cidr`: defaults to `0.0.0.0/0`

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
  -var="compartment_id=<your_compartment_ocid>" \
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
  -var="compartment_id=<your_compartment_ocid>" \
  -var="oci_object_storage_namespace=<your_object_storage_namespace>" \
  -var="laptop_cidr=<your_public_ip>/32" \
  -var="egress_cidr=<trusted-egress-cidr>"
```

`terraform apply` is intentionally not part of the default workflow unless explicitly requested. After infrastructure exists, run the Ansible playbook from `../ansible` for application provisioning on either Debian-family or Oracle Linux / RHEL images. The Terraform apply output now ends with a next-step banner that points operators to the Ansible command, dashboard URL pattern, API URLs, and OCI GenAI endpoint for the chosen region.

## Topology

```text
VCN
└── Public Subnet
    ├── Ingress: 22 (+ optional 3000/8000 and 80/443) <- laptop_cidr + allowed_public_ingress_cidrs
    └── Egress: all -> egress_cidr
```
