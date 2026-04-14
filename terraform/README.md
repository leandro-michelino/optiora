# Terraform (Plan-Only Baseline)

This folder contains an OCI network baseline designed for strict access control.

## Design Intent

- OCI naming pattern:
  - `vcn-<project>-<env>-<region>-<suffix>`
  - `igw-<project>-<env>-<region>-<suffix>`
  - `rt-public-<project>-<env>-<region>-<suffix>`
  - `sl-public-<project>-<env>-<region>-<suffix>`
  - `subnet-public-<project>-<env>-<region>-<suffix>`
- Ingress is restricted to `laptop_cidr` only.
- No `0.0.0.0/0` is used in ingress rules.

## Important Tradeoff

The current route and egress are also restricted to `laptop_cidr`. This is very restrictive and may block package downloads and normal outbound traffic from OCI instances.

If you need package installs or outbound updates during provisioning, you can relax egress and routing:

```hcl
resource "oci_core_route_table" "public" {
  # ...
  route_rules {
    destination       = "0.0.0.0/0"   # was laptop_cidr
    network_entity_id = oci_core_internet_gateway.main.id
  }
}

resource "oci_core_security_list" "public" {
  # ...
  egress_security_rules {
    protocol    = "all"
    destination = "0.0.0.0/0"        # was laptop_cidr
  }
}
```

Ingress should stay laptop-scoped (or VPN/allowlist) to avoid exposing API/UI.

## Usage

```bash
cd terraform
terraform init
terraform validate
terraform plan \
  -var="compartment_id=<your_compartment_ocid>" \
  -var="region=us-phoenix-1" \
  -var="laptop_cidr=<your_public_ip>/32"
```

`terraform apply` is intentionally not part of this workflow unless explicitly requested.

