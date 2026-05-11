locals {
  resource_scheduler_tags = {
    project     = var.project_code
    environment = var.environment
    purpose     = "weekday-start-stop"
    timezone    = "Europe/Madrid"
  }
  resource_scheduler_target_resource_ids = distinct(compact(concat(
    var.resource_scheduler_resource_ids,
    var.compute_enabled ? [oci_core_instance.optiora[0].id] : []
  )))
}

resource "oci_resource_scheduler_schedule" "weekday_start" {
  count = var.resource_scheduler_enabled ? 1 : 0

  action             = "START_RESOURCE"
  compartment_id     = var.compartment_id
  display_name       = "rs-${local.name_prefix}-weekday-start"
  description        = "Start selected OptiOra compute resources at 09:00 Madrid time, Monday-Friday. OCI Resource Scheduler cron is configured in UTC."
  recurrence_type    = "CRON"
  recurrence_details = var.resource_scheduler_start_cron
  state              = "ACTIVE"
  time_starts        = var.resource_scheduler_time_starts
  time_ends          = var.resource_scheduler_time_ends
  freeform_tags      = local.resource_scheduler_tags

  dynamic "resources" {
    for_each = toset(local.resource_scheduler_target_resource_ids)
    content {
      id = resources.value
    }
  }

  lifecycle {
    precondition {
      condition     = length(local.resource_scheduler_target_resource_ids) > 0
      error_message = "Set resource_scheduler_resource_ids to one or more target resource OCIDs, or enable Terraform-managed compute, before enabling Resource Scheduler."
    }
  }
}

resource "oci_resource_scheduler_schedule" "weekday_stop" {
  count = var.resource_scheduler_enabled ? 1 : 0

  action             = "STOP_RESOURCE"
  compartment_id     = var.compartment_id
  display_name       = "rs-${local.name_prefix}-weekday-stop"
  description        = "Stop selected OptiOra compute resources at 20:00 Madrid time, Monday-Friday. OCI Resource Scheduler cron is configured in UTC."
  recurrence_type    = "CRON"
  recurrence_details = var.resource_scheduler_stop_cron
  state              = "ACTIVE"
  time_starts        = var.resource_scheduler_time_starts
  time_ends          = var.resource_scheduler_time_ends
  freeform_tags      = local.resource_scheduler_tags

  dynamic "resources" {
    for_each = toset(local.resource_scheduler_target_resource_ids)
    content {
      id = resources.value
    }
  }

  lifecycle {
    precondition {
      condition     = length(local.resource_scheduler_target_resource_ids) > 0
      error_message = "Set resource_scheduler_resource_ids to one or more target resource OCIDs, or enable Terraform-managed compute, before enabling Resource Scheduler."
    }
  }
}

resource "oci_identity_policy" "resource_scheduler_instance_control" {
  count = var.resource_scheduler_enabled && var.resource_scheduler_manage_instance_policy ? 1 : 0

  compartment_id = var.compartment_id
  name           = "rs-${local.name_prefix}-instance-control"
  description    = "Allows OptiOra Resource Scheduler schedules to start and stop compute instances."
  statements = [
    "Allow any-user to manage instance in compartment id ${var.compartment_id} where all {request.principal.type='resourceschedule',request.principal.id='${oci_resource_scheduler_schedule.weekday_start[0].id}'}",
    "Allow any-user to manage instance in compartment id ${var.compartment_id} where all {request.principal.type='resourceschedule',request.principal.id='${oci_resource_scheduler_schedule.weekday_stop[0].id}'}",
  ]
}
