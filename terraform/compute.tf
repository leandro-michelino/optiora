data "oci_identity_availability_domains" "available" {
  count = var.compute_enabled ? 1 : 0

  compartment_id = var.image_compartment_id != "" ? var.image_compartment_id : var.compartment_id
}

data "oci_core_images" "oracle_linux" {
  count = var.compute_enabled ? 1 : 0

  compartment_id           = var.image_compartment_id != "" ? var.image_compartment_id : var.compartment_id
  operating_system         = var.image_operating_system
  operating_system_version = var.image_operating_system_version
  shape                    = var.compute_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
  state                    = "AVAILABLE"
}

locals {
  compute_availability_domain = var.compute_availability_domain != "" ? var.compute_availability_domain : try(data.oci_identity_availability_domains.available[0].availability_domains[0].name, "")
  compute_image_id            = try(data.oci_core_images.oracle_linux[0].images[0].id, "")
  compute_hostname_base       = replace(substr(lower(var.instance_name), 0, 15), "/[^a-z0-9]/", "")
  compute_hostname_label      = can(regex("^[a-z]", local.compute_hostname_base)) ? local.compute_hostname_base : "optiora"
}

resource "oci_core_instance" "optiora" {
  count = var.compute_enabled ? 1 : 0

  availability_domain = local.compute_availability_domain
  compartment_id      = var.compartment_id
  display_name        = var.instance_name
  shape               = var.compute_shape
  state               = "RUNNING"

  create_vnic_details {
    assign_public_ip = var.assign_public_ip
    display_name     = "${var.instance_name}-vnic"
    hostname_label   = local.compute_hostname_label != "" ? local.compute_hostname_label : "optiora"
    subnet_id        = oci_core_subnet.public.id
  }

  metadata = {
    ssh_authorized_keys = trimspace(var.ssh_public_key)
  }

  shape_config {
    memory_in_gbs = var.compute_memory_gb
    ocpus         = var.compute_ocpus
  }

  source_details {
    source_id   = local.compute_image_id
    source_type = "image"
  }

  freeform_tags = {
    project     = var.project_code
    environment = var.environment
    purpose     = "optiora-app-host"
  }

  lifecycle {
    precondition {
      condition     = can(regex("^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521) [A-Za-z0-9+/=]+", trimspace(var.ssh_public_key)))
      error_message = "Set ssh_public_key to a real OpenSSH public key before enabling compute provisioning."
    }

    precondition {
      condition     = local.compute_availability_domain != ""
      error_message = "Could not resolve an OCI availability domain. Set compute_availability_domain explicitly."
    }

    precondition {
      condition     = local.compute_image_id != ""
      error_message = "Could not resolve a compatible Oracle Linux image. Set image_compartment_id to your tenancy OCID or adjust image_operating_system/image_operating_system_version."
    }
  }
}

resource "oci_core_volume" "optiora_data" {
  count = var.compute_enabled && var.extra_block_volume_enabled ? 1 : 0

  availability_domain = local.compute_availability_domain
  compartment_id      = var.compartment_id
  display_name        = "${var.instance_name}-data"
  size_in_gbs         = var.extra_block_volume_size_gbs
  vpus_per_gb         = var.extra_block_volume_vpus_per_gb

  freeform_tags = {
    project     = var.project_code
    environment = var.environment
    purpose     = "optiora-app-data"
  }
}

resource "oci_core_volume_attachment" "optiora_data" {
  count = var.compute_enabled && var.extra_block_volume_enabled ? 1 : 0

  attachment_type = "paravirtualized"
  display_name    = "${var.instance_name}-data"
  device          = var.extra_block_volume_device
  instance_id     = oci_core_instance.optiora[0].id
  volume_id       = oci_core_volume.optiora_data[0].id
}
