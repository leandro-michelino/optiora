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

output "allowed_public_ingress_cidrs" {
  value       = var.allowed_public_ingress_cidrs
  description = "Optional additional public CIDRs allowed for ingress."
}

output "allow_direct_app_ingress" {
  value       = var.allow_direct_app_ingress
  description = "Whether direct app ports 3000/8000 are exposed in the security list."
}

output "allow_web_ingress" {
  value       = var.allow_web_ingress
  description = "Whether web ports 80/443 are exposed in the security list."
}

output "egress_cidr" {
  value       = var.egress_cidr
  description = "Outbound traffic destination CIDR for the public subnet."
}

output "cost_archive_bucket_name" {
  value       = oci_objectstorage_bucket.cost_archive.name
  description = "OCI Object Storage bucket used for cost data archival (warm tier, 1-year lifecycle)."
}

output "cost_archive_bucket_namespace" {
  value       = var.oci_object_storage_namespace
  description = "OCI Object Storage namespace for the archive bucket."
}

output "compute_enabled" {
  value       = var.compute_enabled
  description = "Whether Terraform manages the OptiOra compute instance."
}

output "instance_id" {
  value       = try(oci_core_instance.optiora[0].id, null)
  description = "OCID of the Terraform-managed OptiOra compute instance."
}

output "instance_name" {
  value       = var.instance_name
  description = "Display name of the OptiOra compute instance."
}

output "instance_availability_domain" {
  value       = try(oci_core_instance.optiora[0].availability_domain, null)
  description = "Availability domain of the OptiOra compute instance."
}

output "instance_public_ip" {
  value       = try(oci_core_instance.optiora[0].public_ip, null)
  description = "Public IP of the OptiOra compute instance."
}

output "instance_private_ip" {
  value       = try(oci_core_instance.optiora[0].private_ip, null)
  description = "Private IP of the OptiOra compute instance."
}

output "compute_image_id" {
  value       = var.compute_enabled ? local.compute_image_id : null
  description = "Oracle Linux image OCID selected for the OptiOra compute instance."
}

output "ansible_inventory" {
  value       = <<-EOT
    all:
      children:
        optiora:
          hosts:
            optiora-prod:
              ansible_host: ${try(oci_core_instance.optiora[0].public_ip, "")}
              ansible_user: opc
              ansible_ssh_private_key_file: ~/.ssh/optiora-deploy
              optiora_data_device: ${var.extra_block_volume_enabled ? var.extra_block_volume_device : ""}
  EOT
  description = "Ready-to-copy Ansible inventory skeleton for the Terraform-managed OptiOra host."
}

output "extra_block_volume_enabled" {
  value       = var.extra_block_volume_enabled
  description = "Whether the deployment flow will create and attach an extra OCI block volume."
}

output "extra_block_volume_size_gbs" {
  value       = var.extra_block_volume_size_gbs
  description = "Configured size for the extra OCI block volume in GiB."
}

output "extra_block_volume_device" {
  value       = var.extra_block_volume_device
  description = "Expected device path for the extra OCI block volume on the VM."
}

output "extra_block_volume_id" {
  value       = try(oci_core_volume.optiora_data[0].id, null)
  description = "OCID of the Terraform-managed OptiOra data volume."
}

output "extra_block_volume_attachment_id" {
  value       = try(oci_core_volume_attachment.optiora_data[0].id, null)
  description = "OCID of the Terraform-managed OptiOra data volume attachment."
}

output "resource_scheduler_enabled" {
  value       = var.resource_scheduler_enabled
  description = "Whether OCI Resource Scheduler start/stop schedules are enabled."
}

output "resource_scheduler_target_resource_ids" {
  value       = local.resource_scheduler_target_resource_ids
  description = "Resource OCIDs targeted by OCI Resource Scheduler."
}

output "resource_scheduler_weekday_start_schedule_id" {
  value       = try(oci_resource_scheduler_schedule.weekday_start[0].id, null)
  description = "OCID of the weekday Resource Scheduler start schedule."
}

output "resource_scheduler_weekday_stop_schedule_id" {
  value       = try(oci_resource_scheduler_schedule.weekday_stop[0].id, null)
  description = "OCID of the weekday Resource Scheduler stop schedule."
}

output "resource_scheduler_instance_policy_id" {
  value       = try(oci_identity_policy.resource_scheduler_instance_control[0].id, null)
  description = "OCID of the IAM policy allowing Resource Scheduler to manage compute instances."
}

output "next_step_banner" {
  value       = <<-EOT

    ============================================================
    OptiOra OCI Terraform baseline is ready
    ============================================================

    VCN:               ${oci_core_vcn.main.id}
    Public subnet:     ${oci_core_subnet.public.id}
    Primary region:    ${var.region}
    Compute managed:   ${var.compute_enabled}
    Instance:          ${try(oci_core_instance.optiora[0].id, "not created by Terraform")}
    Public IP:         ${try(oci_core_instance.optiora[0].public_ip, "not assigned yet")}
    Allowed ingress:   ${join(", ", distinct(concat([var.laptop_cidr], var.allowed_public_ingress_cidrs)))}
    Direct app ports:  ${var.allow_direct_app_ingress}
    Web ports 80/443:  ${var.allow_web_ingress}
    Extra data volume: ${var.extra_block_volume_enabled} (${var.extra_block_volume_size_gbs} GiB @ ${var.extra_block_volume_device})
    Resource schedule: ${var.resource_scheduler_enabled ? "enabled for ${length(local.resource_scheduler_target_resource_ids)} resource(s)" : "disabled"}
    Egress:            ${var.egress_cidr}

    Next:
      1. Run ./deploy/deploy-oci.sh full to apply Terraform and run Ansible end to end
      2. Use ./deploy/deploy-oci.sh verify after provisioning completes
      3. Use ./deploy/deploy-oci.sh compute only for legacy OCI-CLI VM redeploys

    After Ansible finishes:
      Dashboard:       ${var.allow_web_ingress ? "http://${try(oci_core_instance.optiora[0].public_ip, "<instance-ip>")}/dashboard" : "http://${try(oci_core_instance.optiora[0].public_ip, "<instance-ip>")}:3000/dashboard"}
      AI hub:          ${var.allow_web_ingress ? "http://${try(oci_core_instance.optiora[0].public_ip, "<instance-ip>")}/dashboard/ai-insights" : "http://${try(oci_core_instance.optiora[0].public_ip, "<instance-ip>")}:3000/dashboard/ai-insights"}
      Cost advisor:    ${var.allow_web_ingress ? "http://${try(oci_core_instance.optiora[0].public_ip, "<instance-ip>")}/dashboard/cost-advisor" : "http://${try(oci_core_instance.optiora[0].public_ip, "<instance-ip>")}:3000/dashboard/cost-advisor"}
      API health:      ${var.allow_web_ingress ? "http://${try(oci_core_instance.optiora[0].public_ip, "<instance-ip>")}/health" : "http://${try(oci_core_instance.optiora[0].public_ip, "<instance-ip>")}:8000/health"}
      API info:        ${var.allow_web_ingress ? "http://${try(oci_core_instance.optiora[0].public_ip, "<instance-ip>")}/api/v1/info" : "http://${try(oci_core_instance.optiora[0].public_ip, "<instance-ip>")}:8000/api/v1/info"}
      OCI GenAI:       https://inference.generativeai.${var.region}.oci.oraclecloud.com

  EOT
  description = "Friendly next-step banner shown after Terraform apply."
}
