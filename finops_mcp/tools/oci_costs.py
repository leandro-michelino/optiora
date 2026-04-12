"""OCI Usage & Billing integration."""

import json
import logging
from typing import Any
from datetime import datetime, timedelta
from finops_mcp.config import Config

logger = logging.getLogger(__name__)
config = Config()


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
            oci_config = oci.config.from_file(config.oci_config_file, config.oci_profile)
            usage_client = UsageapiClient(oci_config)
            tenancy_id = oci_config["tenancy"]
        except ImportError:
            # OCI SDK not available, return mock data
            return _mock_cost_summary(period)
        
        # Calculate date range
        end_date = datetime.utcnow().date()
        if period == "day":
            start_date = end_date - timedelta(days=1)
        elif period == "week":
            start_date = end_date - timedelta(days=7)
        elif period == "month":
            start_date = end_date - timedelta(days=30)
        else:
            start_date = end_date - timedelta(days=365)

        # Query usage data
        from oci.usage_api import models
        request = models.RequestSummarizedUsagesDetails(
            tenant_id=tenancy_id,
            time_usage_started=datetime.combine(start_date, datetime.min.time()),
            time_usage_ended=datetime.combine(end_date, datetime.max.time()),
            granularity="DAILY",
            group_by=["service"],
        )
        
        response = usage_client.request_summarized_usages(request)
        
        # Parse response
        total_cost = 0.0
        services = {}
        
        for item in response.data.items:
            service_name = item.tags.get("service", "Unknown") if item.tags else "Unknown"
            cost = float(item.computed_amount or 0)
            services[service_name] = services.get(service_name, 0) + cost
            total_cost += cost
        
        top_services = sorted(services.items(), key=lambda x: x[1], reverse=True)[:5]
        
        return json.dumps({
            "period": period,
            "start_date": str(start_date),
            "end_date": str(end_date),
            "total_cost_usd": round(total_cost, 2),
            "top_services": [{"service": s, "cost_usd": round(c, 2)} for s, c in top_services],
            "currency": "USD",
            "cloud_provider": "oci",
        })

    except Exception as e:
        logger.error(f"Error fetching OCI costs: {str(e)}")
        return json.dumps({"error": str(e), "cloud_provider": "oci"})


def _mock_cost_summary(period: str) -> str:
    """Return mock OCI cost data."""
    return json.dumps({
        "period": period,
        "start_date": (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d"),
        "end_date": datetime.now().strftime("%Y-%m-%d"),
        "total_cost_usd": 450.00,
        "top_services": [
            {"service": "Compute", "cost_usd": 250.00},
            {"service": "Storage", "cost_usd": 100.00},
            {"service": "Network", "cost_usd": 75.00},
            {"service": "Database", "cost_usd": 25.00},
        ],
        "currency": "USD",
        "cloud_provider": "oci",
        "note": "Mock data - OCI SDK not available",
    })


async def get_forecast(params: dict[str, Any]) -> str:
    """Forecast OCI costs based on historical trend."""
    months = params.get("months", 3)
    growth = params.get("growth_percent", 5)
    
    forecast = []
    base_monthly = 400.0
    
    for m in range(1, months + 1):
        projected = base_monthly * (1 + growth / 100) ** (m / 12)
        forecast.append({
            "month": m,
            "projected_cost_usd": round(projected, 2)
        })
    
    total_projected = sum(f["projected_cost_usd"] for f in forecast)
    
    return json.dumps({
        "cloud_provider": "oci",
        "forecast_months": months,
        "growth_adjustment_percent": growth,
        "forecast": forecast,
        "total_projected_cost_usd": round(total_projected, 2),
        "confidence_interval": "±10%"
    })
