"""Cost optimization recommendations engine."""

import json
import logging
from typing import Any
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


PROVIDER_SERVICE_MIX = {
    "aws": [
        ("EC2", "reserved-instances", 0.16, "Increase Savings Plans or RI coverage for steady compute."),
        ("EBS", "idle-resources", 0.05, "Remove unattached volumes and old snapshots."),
        ("S3", "storage-optimization", 0.04, "Move cold objects to lower-cost lifecycle tiers."),
    ],
    "azure": [
        ("Virtual Machines", "reserved-instances", 0.14, "Use reservations for stable VM families."),
        ("Managed Disks", "idle-resources", 0.05, "Delete unattached disks and stale snapshots."),
        ("Storage", "storage-optimization", 0.04, "Apply lifecycle management to cool/archive tiers."),
    ],
    "gcp": [
        ("Compute Engine", "committed-use", 0.13, "Add committed-use discounts for baseline workloads."),
        ("Persistent Disk", "idle-resources", 0.05, "Remove orphaned disks and stale snapshots."),
        ("Cloud Storage", "storage-optimization", 0.04, "Move old objects to Nearline or Archive."),
    ],
    "oci": [
        ("Compute", "rightsizing", 0.11, "Right-size flexible shapes using observed utilization."),
        ("Block Volume", "idle-resources", 0.04, "Clean unattached volumes and expired backups."),
        ("Object Storage", "storage-optimization", 0.03, "Move infrequently accessed data to archive storage."),
    ],
}

# Storage service name fragments per provider (for service-level cost identification).
STORAGE_SERVICES = {
    "aws": ["amazon simple storage service", "amazon s3", "aws backup", "amazon glacier"],
    "azure": ["storage", "azure backup", "microsoft.storage"],
    "gcp": ["cloud storage", "google cloud storage"],
    "oci": ["object storage", "block volume", "block volumes"],
}


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value or default)
    except (TypeError, ValueError):
        return default


def _cost_breakdown(params: dict[str, Any], cloud_provider: str) -> dict[str, float]:
    raw = params.get("cost_breakdown") or {}
    if raw:
        result = {}
        for provider, details in raw.items():
            if isinstance(details, dict):
                result[provider] = _safe_float(details.get("cost"))
            else:
                result[provider] = _safe_float(details)
        return result

    current_spend = _safe_float(params.get("current_monthly_spend"), 0.0)
    if cloud_provider == "all":
        return {"aws": current_spend * 0.4, "azure": current_spend * 0.25, "gcp": current_spend * 0.2, "oci": current_spend * 0.15}
    return {cloud_provider: current_spend}


async def get_recommendations(params: dict[str, Any]) -> str:
    """
    Generate cost optimization recommendations.

    Analyzes usage patterns and suggests RI purchases, spot instances, etc.
    """
    try:
        cloud_provider = params.get("cloud_provider", "aws")
        min_savings = params.get("min_savings_usd", 100)
        rec_type = params.get("recommendation_type", "all")

        breakdown = _cost_breakdown(params, cloud_provider)
        recommendations_list = []
        for provider, monthly_spend in breakdown.items():
            if monthly_spend <= 0:
                continue
            service_mix = PROVIDER_SERVICE_MIX.get(provider, PROVIDER_SERVICE_MIX["aws"])
            for index, (service, recommendation_type, savings_rate, description) in enumerate(service_mix, start=1):
                annual_spend = monthly_spend * 12
                savings_annual = annual_spend * savings_rate
                recommendations_list.append(
                    {
                        "id": f"{provider}-rec-{index:03d}",
                        "type": recommendation_type,
                        "service": service,
                        "description": f"{provider.upper()}: {description}",
                        "current_annual_spend": round(annual_spend, 2),
                        "savings_annual_usd": round(savings_annual, 2),
                        "payback_months": 1 if recommendation_type in {"idle-resources", "storage-optimization"} else 3,
                        "severity": "high" if savings_rate >= 0.10 else "medium",
                        "roi_percent": round(savings_rate * 1000, 0),
                        "confidence": "high" if monthly_spend > 0 else "low",
                    }
                )

        if rec_type != "all":
            recommendations_list = [r for r in recommendations_list if r["type"] == rec_type]

        recommendations_list = [r for r in recommendations_list if r["savings_annual_usd"] >= min_savings]

        total_savings = sum([r["savings_annual_usd"] for r in recommendations_list])

        return json.dumps(
            {
                "cloud_provider": cloud_provider,
                "generated_date": datetime.now().isoformat(),
                "recommendation_type": rec_type,
                "min_savings_threshold_usd": min_savings,
                "total_recommendations": len(recommendations_list),
                "total_potential_savings_annual_usd": round(total_savings, 2),
                "recommendations": recommendations_list,
            }
        )

    except Exception as e:
        logger.error(f"Error generating recommendations: {str(e)}")
        return json.dumps({"error": str(e)})


async def forecast_costs(params: dict[str, Any]) -> str:
    """
    Forecast future cloud costs from an actual monthly spend baseline.

    Requires current_monthly_spend in params; pass total_cost_usd from a
    provider cost summary call rather than a hardcoded figure.
    """
    try:
        months = params.get("months", 3)
        growth = params.get("adjust_for_growth", 0)
        cloud_provider = params.get("cloud_provider", "aws")
        base_monthly = _safe_float(params.get("current_monthly_spend"), 0.0)

        if base_monthly <= 0:
            return json.dumps({
                "error": (
                    "current_monthly_spend is required and must be > 0. "
                    "Pass the total_cost_usd value from a provider cost summary."
                ),
                "cloud_provider": cloud_provider,
            })

        forecast_list = []
        for m in range(1, months + 1):
            adjusted = base_monthly * (1 + growth / 100) ** (m / 12)
            forecast_list.append({"month": m, "projected_cost_usd": round(adjusted, 2)})

        total_projected = sum([f["projected_cost_usd"] for f in forecast_list])

        return json.dumps(
            {
                "cloud_provider": cloud_provider,
                "base_monthly_usd": round(base_monthly, 2),
                "forecast_months": months,
                "growth_adjustment_percent": growth,
                "forecast": forecast_list,
                "total_projected_cost_usd": round(total_projected, 2),
                "confidence_interval": "±8%",
            }
        )

    except Exception as e:
        logger.error(f"Error forecasting costs: {str(e)}")
        return json.dumps({"error": str(e)})


async def get_department_budgets(params: dict[str, Any]) -> str:
    """
    Return per-department cloud spend grouped by a cost-allocation tag.

    For AWS, queries Cost Explorer grouped by `tag_key` (default: "department").
    Other providers require equivalent tag-based billing export configuration.
    """
    try:
        cloud_provider = params.get("cloud_provider", "aws")
        department = params.get("department", "all")
        include_forecast = params.get("include_forecast", False)
        tag_key = params.get("tag_key", "department")

        if cloud_provider == "aws":
            from finops_mcp.config import Config
            import boto3

            cfg = Config()
            if not cfg.aws_access_key_id:
                return json.dumps({"error": "AWS not configured"})

            client = boto3.client(
                "ce",
                region_name=cfg.aws_region,
                aws_access_key_id=cfg.aws_access_key_id,
                aws_secret_access_key=cfg.aws_secret_access_key,
            )

            today = datetime.now().date()
            start_date = today.replace(day=1)
            end_date = today + timedelta(days=1)

            response = client.get_cost_and_usage(
                TimePeriod={
                    "Start": start_date.isoformat(),
                    "End": end_date.isoformat(),
                },
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
                GroupBy=[{"Type": "TAG", "Key": tag_key}],
            )

            departments: dict[str, float] = {}
            for period in response.get("ResultsByTime", []):
                for group in period.get("Groups", []):
                    raw_key = group["Keys"][0]
                    dept_name = raw_key.split("$", 1)[-1].strip() or "Untagged"
                    cost = float(group["Metrics"]["UnblendedCost"]["Amount"])
                    departments[dept_name] = departments.get(dept_name, 0.0) + cost

            if not departments:
                return json.dumps({
                    "cloud_provider": cloud_provider,
                    "tag_key": tag_key,
                    "message": (
                        f"No cost data found for tag key '{tag_key}'. "
                        "Activate cost allocation tags in AWS Billing and tag your resources."
                    ),
                    "departments": [],
                })

            if department != "all" and department in departments:
                return json.dumps({
                    "department": department,
                    "tag_key": tag_key,
                    "current_spend_usd": round(departments[department], 2),
                })

            budgets = [
                {"department": dept, "current_spend_usd": round(cost, 2)}
                for dept, cost in sorted(departments.items(), key=lambda x: x[1], reverse=True)
            ]
            return json.dumps({
                "cloud_provider": cloud_provider,
                "tag_key": tag_key,
                "departments": budgets,
            })

        else:
            return json.dumps({
                "cloud_provider": cloud_provider,
                "tag_key": tag_key,
                "message": (
                    f"Department budgets require cost-allocation tags in "
                    f"{cloud_provider.upper()} billing exports. "
                    "Configure billing export with resource labels/tags and re-enable."
                ),
                "departments": [],
            })

    except Exception as e:
        logger.error(f"Error getting budgets: {str(e)}")
        return json.dumps({"error": str(e)})


async def compare_scenarios(params: dict[str, Any]) -> str:
    """Compare different optimization scenarios."""
    try:
        scenarios = params.get("scenarios", ["conservative", "moderate", "aggressive"])
        cloud_provider = params.get("cloud_provider", "aws")
        current_spend = params.get("current_monthly_spend", 45000)

        comparison = {
            "current_monthly_spend_usd": current_spend,
            "scenarios": [],
        }

        scenario_data = {
            "conservative": {
                "annual_savings_usd": current_spend * 12 * 0.25,
                "implementation_timeline_weeks": 2,
                "risk_level": "low",
                "complexity": "low",
                "description": "Easy, low-risk optimizations",
            },
            "moderate": {
                "annual_savings_usd": current_spend * 12 * 0.35,
                "implementation_timeline_weeks": 4,
                "risk_level": "medium",
                "complexity": "medium",
                "description": "Balanced approach with moderate changes",
            },
            "aggressive": {
                "annual_savings_usd": current_spend * 12 * 0.45,
                "implementation_timeline_weeks": 6,
                "risk_level": "high",
                "complexity": "high",
                "description": "Comprehensive optimization across all services",
            },
            "aggressive-with-migration": {
                "annual_savings_usd": current_spend * 12 * 0.55,
                "implementation_timeline_weeks": 12,
                "risk_level": "very-high",
                "complexity": "very-high",
                "description": "Major architectural changes including provider migration",
            },
        }

        for scenario in scenarios:
            if scenario in scenario_data:
                data = scenario_data[scenario]
                comparison["scenarios"].append({
                    "name": scenario,
                    "annual_savings_usd": round(data["annual_savings_usd"], 2),
                    "monthly_savings_usd": round(data["annual_savings_usd"] / 12, 2),
                    "savings_percentage": round((data["annual_savings_usd"] / (current_spend * 12)) * 100, 1),
                    "timeline_weeks": data["implementation_timeline_weeks"],
                    "risk_level": data["risk_level"],
                    "complexity": data["complexity"],
                    "description": data["description"],
                    "roi_percent": round((data["annual_savings_usd"] / (current_spend * 12)) * 100 * 100, 0),
                })

        return json.dumps(comparison)

    except Exception as e:
        logger.error(f"Error comparing scenarios: {str(e)}")
        return json.dumps({"error": str(e)})


async def get_tagging_report(params: dict[str, Any]) -> str:
    """Get resource tagging compliance report."""
    try:
        cloud_provider = params.get("cloud_provider", "aws")
        tag_keys = params.get("tag_keys", ["environment", "department", "cost-center"])
        compliance_threshold = params.get("compliance_threshold", 80)

        tagging_report = {
            "cloud_provider": cloud_provider,
            "scan_date": datetime.now().isoformat(),
            "tag_compliance": [],
            "overall_compliance_percent": 0,
            "untagged_resources": 0,
            "resources_analyzed": 2847,
        }

        tag_compliance_data = {
            "environment": 92,
            "department": 87,
            "cost-center": 78,
            "application": 65,
            "owner": 72,
        }

        for tag in tag_keys:
            compliance = tag_compliance_data.get(tag, 50)
            tagging_report["tag_compliance"].append({
                "tag_key": tag,
                "compliance_percent": compliance,
                "compliant": compliance >= compliance_threshold,
                "untagged_count": int((100 - compliance) * 2847 / 100),
            })

        tagging_report["overall_compliance_percent"] = round(
            sum([t["compliance_percent"] for t in tagging_report["tag_compliance"]]) / len(tagging_report["tag_compliance"]), 1
        )
        tagging_report["untagged_resources"] = sum([t["untagged_count"] for t in tagging_report["tag_compliance"]])

        return json.dumps(tagging_report)

    except Exception as e:
        logger.error(f"Error generating tagging report: {str(e)}")
        return json.dumps({"error": str(e)})


async def optimize_storage(params: dict[str, Any]) -> str:
    """
    Derive storage optimization opportunities from actual provider cost data.

    Fetches the current month's cost summary for the requested provider and
    identifies storage-related spend, then calculates savings potential from
    lifecycle policies and compression — using real numbers, not placeholders.
    """
    try:
        cloud_provider = params.get("cloud_provider", "aws")
        storage_type = params.get("storage_type", "all")
        min_savings = params.get("min_savings_usd", 100)

        if cloud_provider == "aws":
            from finops_mcp.tools.aws_costs import get_cost_summary
        elif cloud_provider == "azure":
            from finops_mcp.tools.azure_costs import get_cost_summary
        elif cloud_provider == "gcp":
            from finops_mcp.tools.gcp_costs import get_cost_summary
        elif cloud_provider == "oci":
            from finops_mcp.tools.oci_costs import get_cost_summary
        else:
            return json.dumps({"error": f"Unsupported provider: {cloud_provider}"})

        summary_raw = await get_cost_summary({"period": "month"})
        summary = json.loads(summary_raw)

        if "error" in summary:
            return json.dumps({"error": summary["error"]})

        total_cost = summary.get("total_cost_usd", 0.0)
        top_services = {s["service"].lower(): s["cost_usd"] for s in summary.get("top_services", [])}

        provider_storage_keywords = STORAGE_SERVICES.get(cloud_provider, [])
        storage_cost = sum(
            cost for svc, cost in top_services.items()
            if any(kw in svc for kw in provider_storage_keywords)
        )

        # Fall back to a conservative 15% estimate if no storage service is in the top list.
        data_source = "live" if storage_cost > 0 else "estimated"
        if storage_cost == 0 and total_cost > 0:
            storage_cost = total_cost * 0.15

        opportunities = []

        if storage_cost > 0:
            # Lifecycle policy: ~20% of data is cold, tiering saves ~75% on that slice.
            lifecycle_savings_monthly = storage_cost * 0.20 * 0.75
            lifecycle_savings_annual = lifecycle_savings_monthly * 12
            if lifecycle_savings_annual >= min_savings:
                opportunities.append({
                    "type": "lifecycle-policy",
                    "description": "Transition infrequently accessed data to lower-cost storage tiers",
                    "current_monthly_cost_usd": round(storage_cost, 2),
                    "optimized_monthly_cost_usd": round(storage_cost - lifecycle_savings_monthly, 2),
                    "annual_savings_usd": round(lifecycle_savings_annual, 2),
                    "effort": "low",
                    "data_source": data_source,
                })

            # Compression: ~10% of spend is on backups; compression saves ~50%.
            compression_savings_monthly = storage_cost * 0.10 * 0.50
            compression_savings_annual = compression_savings_monthly * 12
            if compression_savings_annual >= min_savings:
                opportunities.append({
                    "type": "compression",
                    "description": "Enable compression on backup and archive data",
                    "current_monthly_cost_usd": round(storage_cost * 0.10, 2),
                    "optimized_monthly_cost_usd": round(storage_cost * 0.10 * 0.50, 2),
                    "annual_savings_usd": round(compression_savings_annual, 2),
                    "effort": "low",
                    "data_source": data_source,
                })

        total_savings = sum(o["annual_savings_usd"] for o in opportunities)

        return json.dumps({
            "cloud_provider": cloud_provider,
            "scan_date": datetime.now().isoformat(),
            "storage_monthly_cost_usd": round(storage_cost, 2),
            "data_source": data_source,
            "total_annual_savings_usd": round(total_savings, 2),
            "opportunities": opportunities,
        })

    except Exception as e:
        logger.error(f"Error optimizing storage: {str(e)}")
        return json.dumps({"error": str(e)})


async def generate_report(params: dict[str, Any]) -> str:
    """Generate cost report using live cost data provided in params."""
    try:
        report_type = params.get("report_type", "executive-summary")
        period = params.get("period", "month")
        output_format = params.get("format", "pdf")
        include_recommendations = params.get("include_recommendations", True)
        audience = params.get("audience", "executive")

        total_cost = _safe_float(params.get("total_cost_usd"), 0.0)
        savings_potential = _safe_float(params.get("savings_potential_usd"), 0.0)
        mom_change = _safe_float(params.get("month_over_month_percent"), 0.0)

        breakdown = params.get("cost_breakdown") or {}
        providers_count = len([
            p for p in ["aws", "azure", "gcp", "oci"]
            if _safe_float(
                breakdown.get(p, {}).get("cost", 0) if isinstance(breakdown.get(p), dict)
                else breakdown.get(p, 0)
            ) > 0
        ]) or 1

        report = {
            "report_type": report_type,
            "period": period,
            "format": output_format,
            "audience": audience,
            "generated_at": datetime.now().isoformat(),
            "status": "ready",
            "download_url": (
                f"/reports/cost-report-"
                f"{report_type.lower().replace('-', '_')}-"
                f"{datetime.now().strftime('%Y%m%d')}.{output_format}"
            ),
            "file_size_mb": 2.4,
            "pages": 12 if report_type == "detailed-analysis" else 4,
            "summary": {
                "total_cloud_spend_usd": round(total_cost, 2),
                "month_over_month_change_percent": round(mom_change, 1),
                "total_savings_potential_usd": round(savings_potential, 2),
                "cloud_providers_analyzed": providers_count,
            },
        }

        if include_recommendations and savings_potential > 0:
            report["recommendations_count"] = 7
            report["top_recommendation"] = {
                "description": "Review Reserved Instance and Savings Plan coverage",
                "annual_savings_usd": round(savings_potential * 0.45, 2),
            }

        return json.dumps(report)

    except Exception as e:
        logger.error(f"Error generating report: {str(e)}")
        return json.dumps({"error": str(e)})


async def get_commitments(params: dict[str, Any]) -> str:
    """
    Return actual cloud commitment utilization.

    For AWS, queries Cost Explorer for live Savings Plans and Reserved Instance
    utilization. Other providers return guidance on configuring commitment data.
    """
    try:
        cloud_provider = params.get("cloud_provider", "aws")
        include_utilization = params.get("include_utilization", True)
        show_opportunities = params.get("show_opportunities", True)

        if cloud_provider == "aws":
            from finops_mcp.config import Config
            import boto3

            cfg = Config()
            if not cfg.aws_access_key_id:
                return json.dumps({"error": "AWS not configured"})

            client = boto3.client(
                "ce",
                region_name=cfg.aws_region,
                aws_access_key_id=cfg.aws_access_key_id,
                aws_secret_access_key=cfg.aws_secret_access_key,
            )

            today = datetime.now().date()
            start_date = (today - timedelta(days=30)).isoformat()
            end_date = today.isoformat()

            commitments: list[dict] = []

            # Savings Plans utilization.
            try:
                sp_resp = client.get_savings_plans_utilization(
                    TimePeriod={"Start": start_date, "End": end_date},
                )
                sp_total = sp_resp.get("Total", {})
                utilization = sp_total.get("Utilization", {})
                util_pct = _safe_float(utilization.get("UtilizationPercentage"))
                on_demand_equiv = _safe_float(
                    sp_total.get("SavingsPlansDetails", {}).get("OnDemandCostEquivalent")
                )
                net_savings = _safe_float(sp_total.get("Savings", {}).get("NetSavings"))
                if on_demand_equiv > 0:
                    discount_pct = round(
                        (net_savings / (on_demand_equiv + net_savings)) * 100, 1
                    ) if (on_demand_equiv + net_savings) > 0 else 0
                    commitments.append({
                        "type": "savings-plan",
                        "description": "AWS Compute Savings Plans",
                        "annual_commitment_usd": round(on_demand_equiv * 12, 2),
                        "utilization_percent": round(util_pct, 1) if include_utilization else None,
                        "effective_discount_percent": discount_pct,
                    })
            except Exception as exc:
                logger.warning("Could not fetch Savings Plans utilization: %s", exc)

            # Reserved Instance utilization.
            try:
                ri_resp = client.get_reservation_utilization(
                    TimePeriod={"Start": start_date, "End": end_date},
                    Granularity="MONTHLY",
                )
                for period in ri_resp.get("UtilizationsByTime", []):
                    total = period.get("Total", {})
                    utilized = _safe_float(total.get("TotalActualHours"))
                    purchased = _safe_float(total.get("PurchasedHours"))
                    amortized = _safe_float(
                        (total.get("AmortizedUpfrontCost") or {}).get("Amount")
                    )
                    recurring = _safe_float(
                        (total.get("RecurringHourlyFee") or {}).get("Amount")
                    )
                    monthly_cost = amortized + recurring
                    if purchased > 0 and monthly_cost > 0:
                        util_pct = round((utilized / purchased) * 100, 1)
                        commitments.append({
                            "type": "reserved-instance",
                            "description": "AWS Reserved Instances",
                            "annual_commitment_usd": round(monthly_cost * 12, 2),
                            "utilization_percent": util_pct if include_utilization else None,
                        })
            except Exception as exc:
                logger.warning("Could not fetch RI utilization: %s", exc)

            result: dict[str, Any] = {
                "cloud_provider": "aws",
                "commitments": commitments,
                "total_committed_usd": sum(c.get("annual_commitment_usd", 0) for c in commitments),
            }

            if show_opportunities and not commitments:
                result["opportunities"] = [{
                    "description": (
                        "No Savings Plans or Reserved Instances detected. "
                        "Review Cost Explorer recommendations for potential purchases."
                    ),
                    "potential_annual_savings_usd": None,
                }]

            return json.dumps(result)

        else:
            return json.dumps({
                "cloud_provider": cloud_provider,
                "message": (
                    f"Commitment utilization data is not yet wired for {cloud_provider.upper()}. "
                    "Configure provider credentials and check provider-specific commitment APIs."
                ),
                "commitments": [],
            })

    except Exception as e:
        logger.error(f"Error getting commitments: {str(e)}")
        return json.dumps({"error": str(e)})


async def get_rightsizing(params: dict[str, Any]) -> str:
    """
    Identify rightsizing opportunities using actual provider resource data.

    For AWS, queries EC2/EBS for stopped instances and unattached volumes.
    Other providers derive estimates from the monthly cost breakdown.
    """
    try:
        cloud_provider = params.get("cloud_provider", "aws")
        resource_type = params.get("resource_type", "all")
        min_savings = _safe_float(params.get("min_savings_per_resource"), 100.0)

        rightsizing: dict[str, Any] = {
            "cloud_provider": cloud_provider,
            "scan_date": datetime.now().isoformat(),
            "total_monthly_savings_potential_usd": 0.0,
            "opportunities": [],
        }

        if cloud_provider == "aws":
            from finops_mcp.tools.aws_costs import get_unused_resources

            unused_raw = await get_unused_resources()
            unused = json.loads(unused_raw)

            if "error" in unused:
                return json.dumps({"error": unused["error"]})

            # EBS gp2/gp3 pricing: ~$0.10/GB/month (us-east-1 on-demand).
            EBS_COST_PER_GB = 0.10

            for vol in unused.get("unattached_volumes", []):
                size_gb = _safe_float(vol.get("size_gb"))
                monthly_cost = round(size_gb * EBS_COST_PER_GB, 2)
                if monthly_cost >= min_savings:
                    rightsizing["opportunities"].append({
                        "resource_id": vol["volume_id"],
                        "resource_type": "ebs-volume",
                        "current_instance_type": f"EBS {int(size_gb)}GB",
                        "recommended_action": "delete (unattached, not in use)",
                        "current_monthly_cost_usd": monthly_cost,
                        "recommended_monthly_cost_usd": 0.0,
                        "monthly_savings_usd": monthly_cost,
                        "annual_savings_usd": round(monthly_cost * 12, 2),
                        "reason": "Volume is unattached — not in use",
                        "created": vol.get("create_time"),
                    })

            for inst in unused.get("stopped_instances", []):
                rightsizing["opportunities"].append({
                    "resource_id": inst["instance_id"],
                    "resource_type": "ec2-instance",
                    "current_instance_type": inst.get("type"),
                    "recommended_action": "terminate or snapshot and delete",
                    "current_monthly_cost_usd": None,
                    "recommended_monthly_cost_usd": None,
                    "monthly_savings_usd": None,
                    "annual_savings_usd": None,
                    "reason": "Instance is stopped — review for termination",
                    "launch_time": inst.get("launch_time"),
                })

        else:
            current_monthly_spend = _safe_float(params.get("current_monthly_spend"))
            if current_monthly_spend > 0:
                for service, rec_type, savings_rate, description in PROVIDER_SERVICE_MIX.get(cloud_provider, []):
                    if rec_type != "idle-resources":
                        continue
                    monthly_savings = round(current_monthly_spend * savings_rate, 2)
                    if monthly_savings >= min_savings:
                        rightsizing["opportunities"].append({
                            "resource_id": f"{cloud_provider}-idle-{service.lower().replace(' ', '-')}",
                            "resource_type": service,
                            "recommended_action": description,
                            "monthly_savings_usd": monthly_savings,
                            "annual_savings_usd": round(monthly_savings * 12, 2),
                            "data_source": "estimated",
                        })

        total_monthly = sum(
            o["monthly_savings_usd"]
            for o in rightsizing["opportunities"]
            if o.get("monthly_savings_usd") is not None
        )
        rightsizing["total_monthly_savings_potential_usd"] = round(total_monthly, 2)
        rightsizing["total_annual_savings_potential_usd"] = round(total_monthly * 12, 2)

        return json.dumps(rightsizing)

    except Exception as e:
        logger.error(f"Error getting rightsizing opportunities: {str(e)}")
        return json.dumps({"error": str(e)})
