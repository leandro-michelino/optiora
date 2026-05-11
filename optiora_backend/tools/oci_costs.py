"""OCI Usage & Billing integration."""

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from optiora_backend.config import Config

logger = logging.getLogger(__name__)
config = Config()


def _compartment_list(tenancy_id: str) -> list[str]:
    """Return tenancy plus optional OCI_COMPARTMENT_IDS values, deduplicated."""
    compartments: list[str] = []
    if tenancy_id.strip():
        compartments.append(tenancy_id.strip())

    raw_extra = os.getenv("OCI_COMPARTMENT_IDS", "")
    if raw_extra.strip():
        for value in raw_extra.split(","):
            compartment_id = value.strip()
            if compartment_id:
                compartments.append(compartment_id)

    deduped: list[str] = []
    seen: set[str] = set()
    for compartment_id in compartments:
        if compartment_id not in seen:
            seen.add(compartment_id)
            deduped.append(compartment_id)
    return deduped


async def get_cost_summary(params: dict[str, Any]) -> str:
    """Get OCI cost summary for specified period using OCI Usage API."""
    try:
        period = params.get("period", "month")
        credentials = params.get("credentials") if isinstance(params.get("credentials"), dict) else {}
        config_file = str(credentials.get("config_file") or config.oci_config_file or "")
        profile = str(credentials.get("profile") or config.oci_profile or "DEFAULT")

        if not config_file:
            return json.dumps({"error": "OCI not configured (OCI_CONFIG_FILE not set)"})

        try:
            import oci
            from oci.usage_api import UsageapiClient

            # Initialize OCI client
            config_path = os.path.expanduser(config_file)
            oci_config = oci.config.from_file(config_path, profile)
            usage_client = UsageapiClient(oci_config)
            tenancy_id = oci_config["tenancy"]
        except ImportError:
            logger.warning("OCI SDK not available")
            return json.dumps({"error": "OCI SDK not available", "cloud_provider": "oci"})

        # Calculate date range (UTC boundaries with zeroed time).
        end_date = datetime.now(timezone.utc).date()
        if period == "day":
            start_date = end_date - timedelta(days=1)
        elif period == "week":
            start_date = end_date - timedelta(days=7)
        elif period == "month":
            start_date = end_date - timedelta(days=30)
        else:
            start_date = end_date - timedelta(days=365)

        from oci.usage_api import models
        start_ts = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
        end_ts = datetime.combine(end_date + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)

        request = models.RequestSummarizedUsagesDetails(
            tenant_id=tenancy_id,
            time_usage_started=start_ts,
            time_usage_ended=end_ts,
            granularity="DAILY",
            group_by=["service"],
        )
        region_request = models.RequestSummarizedUsagesDetails(
            tenant_id=tenancy_id,
            time_usage_started=start_ts,
            time_usage_ended=end_ts,
            granularity="DAILY",
            group_by=["region"],
        )

        def _request_usage(client_config: Dict[str, Any], details: Any):
            client = UsageapiClient(client_config)
            return client.request_summarized_usages(
                request_summarized_usages_details=details
            )

        used_region = str(oci_config.get("region") or "")
        try:
            response = _request_usage(oci_config, request)
            region_response = _request_usage(oci_config, region_request)
        except Exception as usage_exc:
            usage_text = str(usage_exc).lower()
            if "home region" not in usage_text:
                raise
            identity_client = oci.identity.IdentityClient(oci_config)
            subscriptions = identity_client.list_region_subscriptions(
                tenancy_id=tenancy_id
            ).data
            home_region = next(
                (
                    str(sub.region_name)
                    for sub in subscriptions
                    if bool(getattr(sub, "is_home_region", False))
                ),
                "",
            )
            if not home_region:
                raise
            retry_config = dict(oci_config)
            retry_config["region"] = home_region
            response = _request_usage(retry_config, request)
            region_response = _request_usage(retry_config, region_request)
            used_region = home_region

        total_cost = 0.0
        services: Dict[str, float] = {}
        regions: Dict[str, float] = {}

        for item in (response.data.items or []):
            service_name = (
                getattr(item, "service", None)
                or (item.tags.get("service") if item.tags else None)
                or "Unknown"
            )
            cost = float(item.computed_amount or 0)
            services[service_name] = services.get(service_name, 0) + cost
            total_cost += cost

        for item in (region_response.data.items or []):
            region_name = (
                getattr(item, "region", None)
                or (item.tags.get("region") if item.tags else None)
                or "global"
            )
            cost = float(item.computed_amount or 0)
            regions[region_name] = regions.get(region_name, 0.0) + cost

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
                "account_breakdown": [
                    {
                        "scope_type": "tenancy",
                        "scope_id": tenancy_id,
                        "scope_name": tenancy_id,
                        "parent_scope_id": None,
                        "parent_scope_type": None,
                        "total_cost_usd": round(total_cost, 2),
                        "region_breakdown": [
                            {"region": region, "cost_usd": round(cost, 2)}
                            for region, cost in top_regions
                        ],
                    }
                ],
                "usage_region": used_region or None,
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
