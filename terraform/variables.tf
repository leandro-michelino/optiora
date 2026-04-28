variable "compartment_id" {
  description = "Target OCI compartment OCID."
  type        = string
}

variable "region" {
  description = "OCI region."
  type        = string
  default     = "uk-london-1"
}

variable "project_code" {
  description = "Short project code used in names."
  type        = string
  default     = "optiora"
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "prod"
}

variable "region_code" {
  description = "Short region code used in naming."
  type        = string
  default     = "lhr"
}

variable "name_suffix" {
  description = "Numeric/name suffix for OCI naming convention."
  type        = string
  default     = "001"
}

variable "vcn_cidr" {
  description = "CIDR for VCN."
  type        = string
  default     = "10.50.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR for public subnet."
  type        = string
  default     = "10.50.1.0/24"
}

variable "laptop_cidr" {
  description = "Laptop public IP in CIDR format, e.g. 79.112.21.102/32."
  type        = string
}

variable "allowed_public_ingress_cidrs" {
  description = "Optional additional public CIDRs allowed for ingress (e.g. office/VPN egress ranges)."
  type        = list(string)
  default     = []
}

variable "allow_direct_app_ingress" {
  description = "Expose direct app ports (3000/8000) from allowed ingress CIDRs. Disable when using nginx/TLS front door only."
  type        = bool
  default     = true
}

variable "allow_web_ingress" {
  description = "Expose web ports (80/443) from allowed ingress CIDRs. Enable when placing nginx on the VM."
  type        = bool
  default     = false
}

variable "egress_cidr" {
  description = "Destination CIDR for outbound traffic from the public subnet."
  type        = string
  default     = "0.0.0.0/0"
}

variable "oci_object_storage_namespace" {
  description = "OCI Object Storage namespace (tenancy namespace, not the tenancy OCID). Find it with: oci os ns get"
  type        = string
}

variable "extra_block_volume_enabled" {
  description = "Whether the single deploy script should create and attach an extra OCI block volume for app and database data."
  type        = bool
  default     = true
}

variable "extra_block_volume_size_gbs" {
  description = "Size in GiB for the extra OCI block volume used for application and database data."
  type        = number
  default     = 200
}

variable "extra_block_volume_vpus_per_gb" {
  description = "Performance tier for the extra OCI block volume. 10 is the balanced default."
  type        = number
  default     = 10
}

variable "extra_block_volume_device" {
  description = "Device path expected by the host/Ansible when the extra block volume is attached."
  type        = string
  default     = "/dev/oracleoci/oraclevdb"
}

variable "resource_scheduler_enabled" {
  description = "Create OCI Resource Scheduler schedules to start and stop selected resources during weekday business hours."
  type        = bool
  default     = false
}

variable "resource_scheduler_resource_ids" {
  description = "OCIDs of resources controlled by Resource Scheduler. Use the deployed compute instance OCID for OptiOra."
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.resource_scheduler_resource_ids) <= 200
    error_message = "Resource Scheduler supports up to 200 explicitly selected resources per schedule."
  }

  validation {
    condition     = alltrue([for resource_id in var.resource_scheduler_resource_ids : can(regex("^ocid1\\.", resource_id))])
    error_message = "Each Resource Scheduler resource ID must be an OCI OCID."
  }
}

variable "resource_scheduler_start_cron" {
  description = "UTC cron expression for the weekday start schedule. Default is 09:00 Europe/Madrid during CEST, Monday-Friday."
  type        = string
  default     = "0 7 * * 1-5"
}

variable "resource_scheduler_stop_cron" {
  description = "UTC cron expression for the weekday stop schedule. Default is 20:00 Europe/Madrid during CEST, Monday-Friday."
  type        = string
  default     = "0 18 * * 1-5"
}

variable "resource_scheduler_time_starts" {
  description = "Optional UTC RFC3339 timestamp when the Resource Scheduler schedules become active."
  type        = string
  default     = null
}

variable "resource_scheduler_time_ends" {
  description = "Optional UTC RFC3339 timestamp when the Resource Scheduler schedules expire."
  type        = string
  default     = null
}

variable "resource_scheduler_manage_instance_policy" {
  description = "Create an IAM policy that lets the Resource Scheduler schedules manage compute instances in the target compartment."
  type        = bool
  default     = true
}
