locals {
  name_prefix = "${var.project_code}-${var.environment}-${var.region_code}-${var.name_suffix}"
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
    destination       = var.laptop_cidr
    network_entity_id = oci_core_internet_gateway.main.id
  }
}

resource "oci_core_security_list" "public" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.main.id
  display_name   = "sl-public-${local.name_prefix}"

  egress_security_rules {
    protocol    = "all"
    destination = var.laptop_cidr
  }

  ingress_security_rules {
    protocol = "6"
    source   = var.laptop_cidr
    tcp_options {
      min = 22
      max = 22
    }
  }

  ingress_security_rules {
    protocol = "6"
    source   = var.laptop_cidr
    tcp_options {
      min = 3000
      max = 3000
    }
  }

  ingress_security_rules {
    protocol = "6"
    source   = var.laptop_cidr
    tcp_options {
      min = 8000
      max = 8000
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
