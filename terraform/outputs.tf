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

output "next_step_banner" {
  value = <<-EOT

    ============================================================
    OptiOra OCI network baseline is ready
    ============================================================

    VCN:               ${oci_core_vcn.main.id}
    Public subnet:     ${oci_core_subnet.public.id}
    Primary region:    ${var.region}
    Allowed ingress:   ${var.laptop_cidr}
    Egress:            ${var.egress_cidr}

    Next:
      1. Launch or identify an OCI compute instance in the public subnet.
      2. Point ansible inventory at the instance public IP.
      3. Run:
         ansible-playbook -i ansible/inventory.yml ansible/playbooks/site.yml

    After Ansible finishes:
      Dashboard:       http://<instance-ip>:3000/dashboard
      AI hub:          http://<instance-ip>:3000/dashboard/ai-insights
      Cost advisor:    http://<instance-ip>:3000/dashboard/cost-advisor
      API health:      http://<instance-ip>:8000/health
      API info:        http://<instance-ip>:8000/api/v1/info
      OCI GenAI:       https://inference.generativeai.${var.region}.oci.oraclecloud.com

  EOT
  description = "Friendly next-step banner shown after Terraform apply."
}
