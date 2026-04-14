output "vcn_id" {
  value       = oci_core_vcn.main.id
  description = "Planned VCN OCID."
}

output "public_subnet_id" {
  value       = oci_core_subnet.public.id
  description = "Planned public subnet OCID."
}

output "allowed_ingress_cidr" {
  value       = var.laptop_cidr
  description = "Ingress is restricted to this laptop CIDR."
}

output "egress_cidr" {
  value       = var.egress_cidr
  description = "Outbound traffic destination CIDR for the public subnet."
}
