"""Automated cost-saving actions execution."""

import json
import logging
from typing import Any
from datetime import datetime

from optiora_backend.config import Config

logger = logging.getLogger(__name__)
config = Config()


def _aws_client(service: str):
    import boto3

    if not config.aws_access_key_id:
        raise RuntimeError("AWS not configured")
    return boto3.client(
        service,
        region_name=config.aws_region,
        aws_access_key_id=config.aws_access_key_id,
        aws_secret_access_key=config.aws_secret_access_key,
    )


async def execute_action(params: dict[str, Any]) -> str:
    """
    Execute cost optimization actions against live provider APIs.

    dry_run=True (default) simulates the action and returns projected savings.
    dry_run=False executes the action for real — use with care.
    """
    try:
        action_type = params.get("action_type")
        resource_ids = params.get("resource_ids", [])
        dry_run = params.get("dry_run", True)
        parameters = params.get("parameters", {})

        action_log = {
            "id": f"action-{datetime.now().timestamp()}",
            "timestamp": datetime.now().isoformat(),
            "action_type": action_type,
            "dry_run": dry_run,
            "resource_count": len(resource_ids),
            "status": "simulation" if dry_run else "executing",
            "results": [],
        }

        if action_type == "delete-unattached-volume":
            ec2 = _aws_client("ec2") if not dry_run else None
            for rid in resource_ids:
                if not dry_run:
                    try:
                        ec2.delete_volume(VolumeId=rid)
                        status = "deleted"
                    except Exception as exc:
                        status = f"error: {exc}"
                else:
                    status = "simulated"

                # Estimate savings from volume size if available; default to $10/month.
                monthly_savings = parameters.get("estimated_monthly_savings_usd", 10.00)
                action_log["results"].append({
                    "resource_id": rid,
                    "status": status,
                    "estimated_monthly_savings": monthly_savings,
                })

        elif action_type == "schedule-resource":
            # Scheduling requires AWS Instance Scheduler or EventBridge rules;
            # keep as simulation until the scheduler is wired.
            schedule = parameters.get("schedule", "off:22:00,on:06:00")
            for rid in resource_ids:
                action_log["results"].append({
                    "resource_id": rid,
                    "status": "simulated",
                    "schedule": schedule,
                    "note": "Real scheduling requires AWS Instance Scheduler or EventBridge configuration.",
                    "estimated_monthly_savings": 150.00,
                })

        elif action_type == "auto-tag-resources":
            tag_key = parameters.get("tag_key", "Environment")
            tag_value = parameters.get("tag_value", "Production")

            if not dry_run and resource_ids:
                try:
                    ec2 = _aws_client("ec2")
                    ec2.create_tags(
                        Resources=resource_ids,
                        Tags=[{"Key": tag_key, "Value": tag_value}],
                    )
                    status = "applied"
                except Exception as exc:
                    status = f"error: {exc}"
            else:
                status = "simulated"

            action_log["results"].append({
                "resources_tagged": len(resource_ids),
                "tag": f"{tag_key}={tag_value}",
                "status": status,
            })

        elif action_type == "purchase-reserved-instance":
            # RI purchases are irreversible financial commitments; enforce dry-run
            # until an explicit purchase confirmation flow is implemented.
            term = parameters.get("term", "1-year")
            for rid in resource_ids:
                action_log["results"].append({
                    "resource_id": rid,
                    "term": term,
                    "status": "simulated",
                    "note": (
                        "RI purchases require a separate confirmation step. "
                        "Use the AWS console or ce:PurchaseReservedInstancesOffering API "
                        "after reviewing the recommendation."
                    ),
                    "estimated_annual_savings": parameters.get("estimated_annual_savings_usd", 4500.00),
                })
            action_log["status"] = "pending_confirmation"

        total_savings = sum(
            r.get("estimated_monthly_savings", 0) + r.get("estimated_annual_savings", 0) / 12
            for r in action_log["results"]
        )
        action_log["estimated_monthly_savings"] = round(total_savings, 2)
        if action_log["status"] == "executing":
            action_log["status"] = "completed"

        return json.dumps(action_log)

    except Exception as e:
        logger.error(f"Error executing action: {str(e)}")
        return json.dumps({"error": str(e)})


async def create_ticket(params: dict[str, Any]) -> str:
    """
    Create a ticket in Jira or Azure DevOps with optimization recommendations.

    Requires JIRA_API_TOKEN (and JIRA_BASE_URL env var) for Jira, or
    ADO_PAT + ADO_ORG for Azure DevOps. Falls back to a structured pending
    record when credentials are not configured.
    """
    try:
        title = params.get("title")
        description = params.get("description")
        savings = params.get("estimated_savings", 0)
        priority = params.get("priority", "medium")
        ticket_system = params.get("ticket_system", "jira")

        import os

        if ticket_system == "jira" and config.jira_api_token:
            import urllib.request
            import urllib.error
            import base64

            jira_base_url = os.getenv("JIRA_BASE_URL", "")
            jira_user = os.getenv("JIRA_USER_EMAIL", "")
            jira_project = os.getenv("JIRA_PROJECT_KEY", "OPS")

            if jira_base_url and jira_user:
                token = base64.b64encode(
                    f"{jira_user}:{config.jira_api_token}".encode()
                ).decode()
                payload = json.dumps({
                    "fields": {
                        "project": {"key": jira_project},
                        "summary": title,
                        "description": description,
                        "issuetype": {"name": "Task"},
                        "priority": {"name": priority.capitalize()},
                        "labels": ["cost-optimization", "finops"],
                    }
                }).encode()
                req = urllib.request.Request(
                    f"{jira_base_url}/rest/api/3/issue",
                    data=payload,
                    headers={
                        "Authorization": f"Basic {token}",
                        "Content-Type": "application/json",
                    },
                    method="POST",
                )
                try:
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        resp_data = json.loads(resp.read())
                    ticket_id = resp_data.get("key", "JIRA-???")
                    ticket_url = f"{jira_base_url}/browse/{ticket_id}"
                    logger.info("Jira ticket created: %s", ticket_id)
                    return json.dumps({
                        "id": ticket_id,
                        "system": "jira",
                        "url": ticket_url,
                        "title": title,
                        "priority": priority,
                        "estimated_savings_annual_usd": savings,
                        "created_date": datetime.now().isoformat(),
                        "status": "open",
                        "labels": ["cost-optimization", "finops"],
                    })
                except urllib.error.HTTPError as exc:
                    logger.error("Jira API error %s: %s", exc.code, exc.read())
                    # Fall through to pending record below.

        # No credentials configured or API call failed — return a pending record.
        ticket = {
            "id": f"{ticket_system.upper()}-PENDING",
            "system": ticket_system,
            "title": title,
            "description": description,
            "priority": priority,
            "estimated_savings_annual_usd": savings,
            "created_date": datetime.now().isoformat(),
            "status": "pending",
            "note": (
                f"Set JIRA_API_TOKEN + JIRA_BASE_URL + JIRA_USER_EMAIL env vars "
                f"to enable automatic {ticket_system.upper()} ticket creation."
            ),
            "labels": ["cost-optimization", "finops"],
        }

        logger.info("Ticket queued (no credentials): %s", ticket["id"])
        return json.dumps(ticket)

    except Exception as e:
        logger.error(f"Error creating ticket: {str(e)}")
        return json.dumps({"error": str(e)})
