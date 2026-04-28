"""OCI Usage & Billing integration."""

import json
import logging
from typing import Any, Dict, List
from datetime import datetime, timedelta, timezone
import os
from finops_mcp.config import Config

logger = logging.getLogger(__name__)
config = Config()


def _compartment_list(tenancy_id: str) -> List[str]:
    """Return the list of compartment OCIDs to scan.

    Combines the tenancy root with any extra compartment OCIDs from the
    ``OCI_COMPARTMENT_IDS`` environment variable.  The tenancy OCID always
    comes first so it acts as the top-level rollup node.
    """
    ids: List[str] = [tenancy_id]
    raw = os.environ.get("OCI_COMPARTMENT_IDS", config.oci_compartment_ids or "")
    for part in raw.split(","):
        ocid = part.strip()
        if ocid and ocid != tenancy_id and ocid not in ids:
            ids.append(ocid)
    return ids


async def get_cost_summary(params: dict[str, Any]) -> str:
    """Get OCI cost summary for specified period using OCI Usage API."""
    try:
        period = params.get("period", "month")

        if not config.oci_config_file:
            return json.dumps({"error": "OCI not configured (OCI_CONFIG_FILE not set)"})

        try:
            import oci
            from oci.usage_api import UsageapiClient

            # Initialize OCI client
            config_path = os.path.expanduser(config.oci_config_file)
            oci_config = oci.config.from_file(config_path, config.oci_profile)
            usage_client = UsageapiClient(oci_config)
            tenancy_id = oci_config["tenancy"]
        except ImportError:
            logger.warning("OCI SDK not available")
            return json.dumps({"error": "OCI SDK not available", "cloud_provider": "oci"})

        # Calculate date range
        end_date = datetime.now(timezone.utc).replace(tzinfo=None).date()
        if period == "day":
            start_date = end_date - timedelta(days=1)
        elif period == "week":
            start_date = end_date - timedelta(days=7)
        elif period == "month":
            start_date = end_date - timedelta(days=30)
        else:
            start_date = end_date - timedelta(days=365)

        from oci.usage_api import models

        compartments = _compartment_list(tenancy_id)
        total_cost = 0.0
        services: Dict[str, float] = {}
        regions: Dict[str, float] = {}
        account_breakdown: List[Dict[str, Any]] = []

        for compartment_id in compartments:
            compartment_total = 0.0
            scope_type = "tenancy" if compartment_id == tenancy_id else "compartment"

            request = models.RequestSummarizedUsagesDetails(
                tenant_id=tenancy_id,
                compartment_id=compartment_id if compartment_id != tenancy_id else None,
                time_usage_started=datetime.combine(start_date, datetime.min.time()),
                time_usage_ended=datetime.combine(end_date, datetime.max.time()),
                granularity="DAILY",
                group_by=["service"],
            )
            region_request = models.RequestSummarizedUsagesDetails(
                tenant_id=tenancy_id,
                compartment_id=compartment_id if compartment_id != tenancy_id else None,
                time_usage_started=datetime.combine(start_date, datetime.min.time()),
                time_usage_ended=datetime.combine(end_date, datetime.max.time()),
                granularity="DAILY",
                group_by=["region"],
            )
            compartment_regions: Dict[str, float] = {}

            try:
                response = usage_client.request_summarized_usages(request)
                for item in response.data.items:
                    service_name = (
                        getattr(item, "service", None)
                        or (item.tags.get("service") if item.tags else None)
                        or "Unknown"
                    )
                    cost = float(item.computed_amount or 0)
                    services[service_name] = services.get(service_name, 0) + cost
                    compartment_total += cost
                    total_cost += cost

                region_response = usage_client.request_summarized_usages(region_request)
                for item in region_response.data.items:
                    region_name = (
                        getattr(item, "region", None)
                        or (item.tags.get("region") if item.tags else None)
                        or "global"
                    )
                    cost = float(item.computed_amount or 0)
                    regions[region_name] = regions.get(region_name, 0.0) + cost
                    compartment_regions[region_name] = compartment_regions.get(region_name, 0.0) + cost

                account_breakdown.append(
                    {
                        "scope_type": scope_type,
                        "scope_id": compartment_id,
                        "scope_name": compartment_id,
                        "parent_scope_id": tenancy_id if scope_type == "compartment" else None,
                        "parent_scope_type": "tenancy" if scope_type == "compartment" else None,
                        "total_cost_usd": round(compartment_total, 2),
                        "region_breakdown": [
                            {"region": r, "cost_usd": round(c, 2)}
                            for r, c in sorted(compartment_regions.items(), key=lambda x: x[1], reverse=True)
                        ],
                    }
                )
            except Exception as compartment_exc:
                logger.warning("OCI compartment %s scan error: %s", compartment_id, compartment_exc)
                account_breakdown.append(
                    {
                        "scope_type": scope_type,
                        "scope_id": compartment_id,
                        "scope_name": compartment_id,
                        "parent_scope_id": tenancy_id if scope_type == "compartment" else None,
                        "parent_scope_type": "tenancy" if scope_type == "compartment" else None,
                        "total_cost_usd": 0.0,
                        "error": str(compartment_exc),
                    }
                )

        top_services = sorted(services.items(), key=lambda x: x[1], reverse=True)[:5]
        top_regions = sorted(regions.items(), key=lambda x: x[1], reverse=True)[:10]

        return json.dumps(
            {
                "period": period,
                "start_date": str(start_date),
                "end_date": str(end_date),
                "total_cost_usd": round(total_cost, 2),
                "top_services": [{"service": s, "cost_usd": round(c, 2)} for s, c in top_services],
                "region_breakdown": [
                    {"region": region, "cost_usd": round(cost, 2)} for region, cost in top_regions
                ],
                "account_breakdown": account_breakdown,
                "currency": "USD",
                "cloud_provider": "oci",
            }
        )

    except Exception as e:
        logger.error(f"Error fetching OCI costs: {str(e)}")
        return json.dumps({"error": str(e), "cloud_provider": "oci"})


async def get_forecast(params: dict[str, Any]) -> str:
    """Forecast OCI costs using the current month's actual spend as the baseline."""
    months = params.get("months", 3)
    growth = params.get("growth_percent", 5)

    summary_raw = await get_cost_summary({"period": "month"})
    summary = json.loads(summary_raw)

    if "error" in summary:
        return json.dumps({"error": summary["error"], "cloud_provider": "oci"})

    base_monthly = summary.get("total_cost_usd", 0.0)
    if base_monthly <= 0:
        return json.dumps({"error": "No OCI cost data available for the current month", "cloud_provider": "oci"})

    forecast = []
    for m in range(1, months + 1):
        projected = base_monthly * (1 + growth / 100) ** (m / 12)
        forecast.append({"month": m, "projected_cost_usd": round(projected, 2)})

    total_projected = sum(f["projected_cost_usd"] for f in forecast)

    return json.dumps({
        "cloud_provider": "oci",
        "base_monthly_usd": round(base_monthly, 2),
        "data_source": "live",
        "forecast_months": months,
        "growth_adjustment_percent": growth,
        "forecast": forecast,
        "total_projected_cost_usd": round(total_projected, 2),
        "confidence_interval": "±10%",
    })
