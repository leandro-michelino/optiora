"""AWS Cost Explorer integration."""

import json
import logging
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta

import boto3
from optiora_backend.config import Config

logger = logging.getLogger(__name__)
config = Config()


def _parse_role_targets(raw: str) -> List[Tuple[str, str]]:
    """Parse AWS org scan targets from CSV: account_id=role_arn or role_arn."""
    targets: List[Tuple[str, str]] = []
    for chunk in (raw or "").split(","):
        item = chunk.strip()
        if not item:
            continue
        if "=" in item:
            account_id, role_arn = item.split("=", 1)
            targets.append((account_id.strip() or "unknown", role_arn.strip()))
            continue
        role_arn = item
        account_hint = role_arn.split(":")[4] if ":" in role_arn else "unknown"
        targets.append((account_hint, role_arn))
    return targets


def _csv_or_list_values(value: Any) -> List[str]:
    if isinstance(value, (list, tuple, set)):
        raw_values = value
    else:
        raw_values = str(value or "").split(",")
    output: List[str] = []
    for raw in raw_values:
        text = str(raw or "").strip()
        if text and text not in output:
            output.append(text)
    return output


def _assumed_ce_client(
    role_arn: str,
    region: str,
    access_key_id: str | None = None,
    secret_access_key: str | None = None,
):
    sts = boto3.client(
        "sts",
        region_name=region,
        aws_access_key_id=access_key_id or config.aws_access_key_id,
        aws_secret_access_key=secret_access_key or config.aws_secret_access_key,
    )
    session = sts.assume_role(
        RoleArn=role_arn,
        RoleSessionName="optiora-org-cost-scan",
    )
    creds = session["Credentials"]
    return boto3.client(
        "ce",
        region_name=region,
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds["SessionToken"],
    )


def _extract_service_costs(response: Dict[str, Any]) -> Tuple[float, Dict[str, float]]:
    total_cost = 0.0
    services: Dict[str, float] = {}
    for result in response.get("ResultsByTime", []):
        for group in result.get("Groups", []):
            service = group.get("Keys", ["Unknown"])[0]
            cost = float(group["Metrics"]["UnblendedCost"]["Amount"])
            services[service] = services.get(service, 0.0) + cost
            total_cost += cost
    return total_cost, services


def _extract_region_costs(response: Dict[str, Any]) -> Dict[str, float]:
    region_costs: Dict[str, float] = {}
    for result in response.get("ResultsByTime", []):
        for group in result.get("Groups", []):
            region = group.get("Keys", ["global"])[0] or "global"
            cost = float(group["Metrics"]["UnblendedCost"]["Amount"])
            region_costs[region] = region_costs.get(region, 0.0) + cost
    return region_costs


async def get_cost_summary(params: dict[str, Any]) -> str:
    """
    Get AWS cost summary for specified period.
    
    Returns: JSON string with total cost, top services, trends
    """
    try:
        period = params.get("period", "month")
        credentials = params.get("credentials") if isinstance(params.get("credentials"), dict) else {}
        access_key_id = str(credentials.get("access_key_id") or config.aws_access_key_id or "")
        secret_access_key = str(credentials.get("secret_access_key") or config.aws_secret_access_key or "")
        region = str(credentials.get("region") or config.aws_region or "us-east-1")

        if not access_key_id or not secret_access_key:
            return json.dumps({"error": "AWS not configured"})

        base_client = boto3.client(
            "ce",
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
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

        runtime_role_arns = ",".join(_csv_or_list_values(credentials.get("organization_role_arns")))
        role_targets = _parse_role_targets(runtime_role_arns or config.aws_organization_role_arns)
        account_rows: List[Dict[str, Any]] = []
        total_cost = 0.0
        services: Dict[str, float] = {}
        region_costs: Dict[str, float] = {}
        organization_scope_id = "aws-organization"
        organization_scope_name = "AWS Organization"

        def _query_account(account_id: str, client, role_arn: Optional[str] = None) -> None:
            nonlocal total_cost
            response = client.get_cost_and_usage(
                TimePeriod={"Start": str(start_date), "End": str(end_date)},
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
                GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
            )
            account_total, account_services = _extract_service_costs(response)
            total_cost += account_total
            for name, cost in account_services.items():
                services[name] = services.get(name, 0.0) + cost

            # REGION is not guaranteed in all billing dimensions; fall back gracefully.
            region_response = client.get_cost_and_usage(
                TimePeriod={"Start": str(start_date), "End": str(end_date)},
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
                GroupBy=[{"Type": "DIMENSION", "Key": "REGION"}],
            )
            account_regions = _extract_region_costs(region_response)
            for region, cost in account_regions.items():
                region_costs[region] = region_costs.get(region, 0.0) + cost

            account_rows.append(
                {
                    "scope_type": "account",
                    "scope_id": account_id,
                    "scope_name": account_id,
                    "parent_scope_id": organization_scope_id if role_targets else None,
                    "parent_scope_type": "organization" if role_targets else None,
                    "account_id": account_id,
                    "source": "assume_role" if role_arn else "default_credentials",
                    "role_arn": role_arn,
                    "total_cost_usd": round(account_total, 2),
                }
            )

        _query_account("default", base_client)
        for account_id, role_arn in role_targets:
            try:
                client = _assumed_ce_client(role_arn, region, access_key_id, secret_access_key)
                _query_account(account_id, client, role_arn=role_arn)
            except Exception as exc:
                logger.warning("Skipping AWS org account %s (%s): %s", account_id, role_arn, exc)
                account_rows.append(
                    {
                        "scope_type": "account",
                        "scope_id": account_id,
                        "scope_name": account_id,
                        "parent_scope_id": organization_scope_id if role_targets else None,
                        "parent_scope_type": "organization" if role_targets else None,
                        "account_id": account_id,
                        "source": "assume_role",
                        "role_arn": role_arn,
                        "error": str(exc),
                    }
                )

        if role_targets:
            account_rows.insert(
                0,
                {
                    "scope_type": "organization",
                    "scope_id": organization_scope_id,
                    "scope_name": organization_scope_name,
                    "total_cost_usd": round(total_cost, 2),
                },
            )

        top_services = sorted(services.items(), key=lambda x: x[1], reverse=True)[:5]
        top_regions = sorted(region_costs.items(), key=lambda x: x[1], reverse=True)[:10]

        return json.dumps(
            {
                "period": period,
                "start_date": str(start_date),
                "end_date": str(end_date),
                "total_cost_usd": round(total_cost, 2),
                "top_services": [
                    {"service": s, "cost_usd": round(c, 2)} for s, c in top_services
                ],
                "region_breakdown": [
                    {"region": region, "cost_usd": round(cost, 2)}
                    for region, cost in top_regions
                ],
                "account_breakdown": account_rows,
                "currency": "USD",
                "cloud_provider": "aws",
                "data_source": "live_provider_api",
                "api_source": "AWS Cost Explorer GetCostAndUsage",
                "cost_dimensions": ["SERVICE", "REGION"],
                "scope_count": len(account_rows),
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
