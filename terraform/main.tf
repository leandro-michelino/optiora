locals {
  name_prefix             = "${var.project_code}-${var.environment}-${var.region_code}-${var.name_suffix}"
  allowed_ingress_sources = distinct(concat([var.laptop_cidr], var.allowed_public_ingress_cidrs))
}

# ---------------------------------------------------------------------------
# OCI Object Storage — cost archive bucket
# Warm tier: rows older than 3 months are written here by the retention job.
# Lifecycle rule deletes objects automatically after 365 days (1 year).
# ---------------------------------------------------------------------------
resource "oci_objectstorage_bucket" "cost_archive" {
  compartment_id = var.compartment_id
  namespace      = var.oci_object_storage_namespace
  name           = "optiora-cost-archive-${var.environment}"
  access_type    = "NoPublicAccess"
  storage_tier   = "Standard"

  versioning = "Disabled"

  freeform_tags = {
    project     = var.project_code
    environment = var.environment
    purpose     = "cost-data-archive"
  }
}

resource "oci_objectstorage_object_lifecycle_policy" "cost_archive" {
  namespace = var.oci_object_storage_namespace
  bucket    = oci_objectstorage_bucket.cost_archive.name

  rules {
    name        = "delete-after-1-year"
    action      = "DELETE"
    is_enabled  = true
    time_amount = 365
    time_unit   = "DAYS"

    object_name_filter {
      inclusion_prefixes = ["archive/"]
    }
  }
}

resource "oci_core_vcn" "main" {
  compartment_id = var.compartment_id
  cidr_blocks    = [var.vcn_cidr]
  display_name   = "vcn-${local.name_prefix}"
  dns_label      = "vcn${var.region_code}${var.name_suffix}"
}

resource "oci_core_internet_gateway" "main" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.main.id
  display_name   = "igw-${local.name_prefix}"
  enabled        = true
}

resource "oci_core_route_table" "public" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.main.id
  display_name   = "rt-public-${local.name_prefix}"

  route_rules {
    destination       = var.egress_cidr
    network_entity_id = oci_core_internet_gateway.main.id
  }
}

resource "oci_core_security_list" "public" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.main.id
  display_name   = "sl-public-${local.name_prefix}"

  egress_security_rules {
    protocol    = "all"
    destination = var.egress_cidr
  }

  dynamic "ingress_security_rules" {
    for_each = toset(local.allowed_ingress_sources)
    content {
      protocol = "6"
      source   = ingress_security_rules.value
      tcp_options {
        min = 22
        max = 22
      }
    }
  }

  dynamic "ingress_security_rules" {
    for_each = var.allow_direct_app_ingress ? toset(local.allowed_ingress_sources) : []
    content {
      protocol = "6"
      source   = ingress_security_rules.value
      tcp_options {
        min = 3000
        max = 3000
      }
    }
  }

  dynamic "ingress_security_rules" {
    for_each = var.allow_direct_app_ingress ? toset(local.allowed_ingress_sources) : []
    content {
      protocol = "6"
      source   = ingress_security_rules.value
      tcp_options {
        min = 8000
        max = 8000
      }
    }
  }

  dynamic "ingress_security_rules" {
    for_each = var.allow_web_ingress ? toset(local.allowed_ingress_sources) : []
    content {
      protocol = "6"
      source   = ingress_security_rules.value
      tcp_options {
        min = 80
        max = 80
      }
    }
  }

  dynamic "ingress_security_rules" {
    for_each = var.allow_web_ingress ? toset(local.allowed_ingress_sources) : []
    content {
      protocol = "6"
      source   = ingress_security_rules.value
      tcp_options {
        min = 443
        max = 443
      }
    }
  }
}

resource "oci_core_subnet" "public" {
  compartment_id             = var.compartment_id
  vcn_id                     = oci_core_vcn.main.id
  cidr_block                 = var.public_subnet_cidr
  display_name               = "subnet-public-${local.name_prefix}"
  dns_label                  = "pub${var.name_suffix}"
  prohibit_public_ip_on_vnic = false
  route_table_id             = oci_core_route_table.public.id
  security_list_ids          = [oci_core_security_list.public.id]
}
