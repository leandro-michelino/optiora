variable "compartment_id" {
  description = "Target OCI compartment OCID."
  type        = string
}

variable "region" {
  description = "OCI region."
  type        = string
  default     = "af-johannesburg-1"
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
  default     = "jnb"
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
