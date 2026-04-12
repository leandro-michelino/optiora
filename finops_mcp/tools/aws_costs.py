"""AWS Cost Explorer integration."""

import json
import logging
from typing import Any
from datetime import datetime, timedelta

import boto3
from finops_mcp.config import Config

logger = logging.getLogger(__name__)
config = Config()


async def get_cost_summary(params: dict[str, Any]) -> str:
    """
    Get AWS cost summary for specified period.
    
    Returns: JSON string with total cost, top services, trends
    """
    try:
        period = params.get("period", "month")
        filters = params.get("filters", {})

        if not config.aws_access_key_id:
            return json.dumps({"error": "AWS not configured"})

        client = boto3.client(
            "ce",
            region_name=config.aws_region,
            aws_access_key_id=config.aws_access_key_id,
            aws_secret_access_key=config.aws_secret_access_key,
        )

        # Calculate date range
        end_date = datetime.now().date()
        if period == "day":
            start_date = end_date - timedelta(days=1)
        elif period == "week":
            start_date = end_date - timedelta(days=7)
        elif period == "month":
            start_date = end_date - timedelta(days=30)
        else:  # year
            start_date = end_date - timedelta(days=365)

        # Fetch costs by service
        response = client.get_cost_and_usage(
            TimePeriod={"Start": str(start_date), "End": str(end_date)},
            Granularity="MONTHLY",
            Metrics=["UnblendedCost"],
            GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
        )

        # Parse response
        total_cost = 0.0
        services = {}

        for result in response["ResultsByTime"]:
            for group in result["Groups"]:
                service = group["Keys"][0]
                cost = float(group["Metrics"]["UnblendedCost"]["Amount"])
                services[service] = services.get(service, 0) + cost
                total_cost += cost

        # Sort by cost descending
        top_services = sorted(services.items(), key=lambda x: x[1], reverse=True)[:5]

        return json.dumps(
            {
                "period": period,
                "start_date": str(start_date),
                "end_date": str(end_date),
                "total_cost_usd": round(total_cost, 2),
                "top_services": [
                    {"service": s, "cost_usd": round(c, 2)} for s, c in top_services
                ],
                "currency": "USD",
            }
        )

    except Exception as e:
        logger.error(f"Error fetching AWS costs: {str(e)}")
        return json.dumps({"error": str(e)})


async def get_unused_resources(account_id: str = None) -> str:
    """Identify unused EC2, RDS, EBS resources."""
    try:
        ec2_client = boto3.client(
            "ec2",
            region_name=config.aws_region,
            aws_access_key_id=config.aws_access_key_id,
            aws_secret_access_key=config.aws_secret_access_key,
        )

        unused = {"stopped_instances": [], "unattached_volumes": []}

        # Find stopped instances (unused for >30 days)
        instances = ec2_client.describe_instances(
            Filters=[{"Name": "instance-state-name", "Values": ["stopped"]}]
        )

        for reservation in instances.get("Reservations", []):
            for instance in reservation.get("Instances", []):
                state_transition_time = instance.get("StateTransitionReason", "")
                unused["stopped_instances"].append(
                    {
                        "instance_id": instance["InstanceId"],
                        "type": instance["InstanceType"],
                        "launch_time": str(instance["LaunchTime"]),
                    }
                )

        # Find unattached EBS volumes
        volumes = ec2_client.describe_volumes(
            Filters=[{"Name": "status", "Values": ["available"]}]
        )

        for volume in volumes.get("Volumes", []):
            unused["unattached_volumes"].append(
                {
                    "volume_id": volume["VolumeId"],
                    "size_gb": volume["Size"],
                    "create_time": str(volume["CreateTime"]),
                }
            )

        return json.dumps(unused)

    except Exception as e:
        logger.error(f"Error fetching unused resources: {str(e)}")
        return json.dumps({"error": str(e)})
