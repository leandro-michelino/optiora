# Terraform Network Baseline

This folder contains the OCI network baseline used by OptiOra. It does not provision the application runtime; Ansible owns host setup and service configuration.

## Design Intent

- OCI naming convention:
  - `vcn-<project>-<env>-<region>-<suffix>`
  - `igw-<project>-<env>-<region>-<suffix>`
  - `rt-public-<project>-<env>-<region>-<suffix>`
  - `sl-public-<project>-<env>-<region>-<suffix>`
  - `subnet-public-<project>-<env>-<region>-<suffix>`
- ingress is restricted to `laptop_cidr`
- outbound traffic is controlled by `egress_cidr`
- compute bootstrap, packages, `.env`, builds, and systemd are handled by `../ansible`, including Oracle Linux / RHEL hosts

## Defaults

- `laptop_cidr`: required, used for SSH/UI/API ingress
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
  -var="laptop_cidr=<your_public_ip>/32"
```

Example with restricted egress:

```bash
terraform plan \
  -var="compartment_id=<your_compartment_ocid>" \
  -var="laptop_cidr=<your_public_ip>/32" \
  -var="egress_cidr=<trusted-egress-cidr>"
```

`terraform apply` is intentionally not part of the default workflow unless explicitly requested. After infrastructure exists, run the Ansible playbook from `../ansible` for application provisioning on either Debian-family or Oracle Linux / RHEL images. The Terraform apply output now ends with a next-step banner that points operators to the Ansible command, dashboard URL pattern, API URLs, and OCI GenAI endpoint for the chosen region.

## Topology

```text
VCN
└── Public Subnet
    ├── Ingress: 22, 3000, 8000 <- laptop_cidr
    └── Egress: all -> egress_cidr
```
