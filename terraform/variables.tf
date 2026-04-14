variable "compartment_id" {
  description = "Target OCI compartment OCID."
  type        = string
}

variable "region" {
  description = "OCI region."
  type        = string
  default     = "us-phoenix-1"
}

variable "oci_tenancy_ocid" {
  description = "OCI tenancy OCID used by the Terraform provider."
  type        = string
}

variable "oci_user_ocid" {
  description = "OCI user OCID used by the Terraform provider."
  type        = string
}

variable "oci_fingerprint" {
  description = "Fingerprint for the OCI API signing key."
  type        = string
}

variable "oci_private_key_path" {
  description = "Local path to the OCI API private key matching oci_fingerprint."
  type        = string
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
  default     = "phx"
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

variable "egress_cidr" {
  description = "Destination CIDR for outbound traffic from the public subnet."
  type        = string
  default     = "0.0.0.0/0"
}
