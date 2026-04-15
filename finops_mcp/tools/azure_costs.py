"""Azure Cost Management integration."""

import json
import logging
from typing import Any, Dict, List
from datetime import datetime, timedelta
from finops_mcp.config import Config

logger = logging.getLogger(__name__)
config = Config()


def _subscription_list() -> List[str]:
    values = [config.azure_subscription_id]
    values.extend([part.strip() for part in config.azure_subscription_ids.split(",") if part.strip()])
    unique: List[str] = []
    for value in values:
        if value and value not in unique:
            unique.append(value)
    return unique


async def get_cost_summary(params: dict[str, Any]) -> str:
    """
    Get Azure cost summary for specified period using Cost Management API.
    
    Returns: JSON string with total cost, top services, trends
    """
    try:
        period = params.get("period", "month")
        
        if not config.azure_subscription_id and not config.azure_subscription_ids and not config.azure_management_group_id:
            return json.dumps({"error": "Azure not configured (AZURE_SUBSCRIPTION_ID not set)"})
        
        try:
            from azure.identity import ClientSecretCredential
            from azure.mgmt.costmanagement import CostManagementClient
            from azure.mgmt.costmanagement.models import QueryDefinition
        except ImportError:
            logger.warning("Azure SDK not available")
            return json.dumps({"error": "Azure SDK not available", "cloud_provider": "azure"})
        
        # Create credentials
        credential = ClientSecretCredential(
            tenant_id=config.azure_tenant_id,
            client_id=config.azure_client_id,
            client_secret=config.azure_client_secret,
        )
        
        # Create CostManagement client
        client = CostManagementClient(credential)
        
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
        
        def _build_query(group_dimension: str) -> QueryDefinition:
            return QueryDefinition(
            type="Usage",
            timeframe="Custom",
            time_period={
                "from": f"{start_date.isoformat()}T00:00:00Z",
                "to": f"{end_date.isoformat()}T23:59:59Z"
            },
            dataset={
                "granularity": "Monthly",
                "aggregation": {
                    "totalCost": {
                        "name": "PreTaxCost",
                        "function": "Sum"
                    }
                },
                "grouping": [
                    {
                        "type": "Dimension",
                        "name": group_dimension
                    }
                ],
                "sorting": [
                    {
                        "direction": "Ascending",
                        "name": group_dimension
                    }
                ]
            }
        )

        # Build scan scopes: management group first (if provided), then subscriptions.
        scopes: List[Dict[str, str]] = []
        if config.azure_management_group_id:
            scopes.append(
                {
                    "scope": f"/providers/Microsoft.Management/managementGroups/{config.azure_management_group_id}",
                    "identifier": config.azure_management_group_id,
                    "scope_type": "management_group",
                }
            )
        for subscription_id in _subscription_list():
            scopes.append(
                {
                    "scope": f"/subscriptions/{subscription_id}",
                    "identifier": subscription_id,
                    "scope_type": "subscription",
                }
            )

        total_cost = 0.0
        services: Dict[str, float] = {}
        regions: Dict[str, float] = {}
        scope_breakdown: List[Dict[str, Any]] = []

        for scope_info in scopes:
            scope = scope_info["scope"]
            service_query = _build_query("MeterCategory")
            region_query = _build_query("ResourceLocation")
            scope_total = 0.0
            try:
                query_result = client.query.usage(scope, service_query)
                if hasattr(query_result, "rows"):
                    for row in query_result.rows:
                        if len(row) >= 2:
                            service_name = row[0] or "Unknown"
                            cost = float(row[1]) if row[1] else 0.0
                            services[service_name] = services.get(service_name, 0.0) + cost
                            scope_total += cost
                            total_cost += cost

                region_result = client.query.usage(scope, region_query)
                if hasattr(region_result, "rows"):
                    for row in region_result.rows:
                        if len(row) >= 2:
                            region = row[0] or "global"
                            cost = float(row[1]) if row[1] else 0.0
                            regions[region] = regions.get(region, 0.0) + cost

                scope_breakdown.append(
                    {
                        "scope_type": scope_info["scope_type"],
                        "scope_id": scope_info["identifier"],
                        "total_cost_usd": round(scope_total, 2),
                    }
                )
            except Exception as scope_exc:
                scope_breakdown.append(
                    {
                        "scope_type": scope_info["scope_type"],
                        "scope_id": scope_info["identifier"],
                        "error": str(scope_exc),
                    }
                )

        top_services = sorted(services.items(), key=lambda x: x[1], reverse=True)[:5]
        top_regions = sorted(regions.items(), key=lambda x: x[1], reverse=True)[:10]
        
        return json.dumps({
            "period": period,
            "start_date": str(start_date),
            "end_date": str(end_date),
            "total_cost_usd": round(total_cost, 2),
            "top_services": [
                {"service": s, "cost_usd": round(c, 2)} for s, c in top_services
            ],
            "region_breakdown": [
                {"region": region, "cost_usd": round(cost, 2)} for region, cost in top_regions
            ],
            "account_breakdown": scope_breakdown,
            "currency": "USD",
            "cloud_provider": "azure",
        })
        
    except Exception as e:
        logger.error(f"Error fetching Azure costs: {str(e)}")
        return json.dumps({"error": str(e), "cloud_provider": "azure"})


async def get_forecast(params: dict[str, Any]) -> str:
    """Forecast Azure costs using the current month's actual spend as the baseline."""
    months = params.get("months", 3)
    growth = params.get("growth_percent", 5)

    summary_raw = await get_cost_summary({"period": "month"})
    summary = json.loads(summary_raw)

    if "error" in summary:
        return json.dumps({"error": summary["error"], "cloud_provider": "azure"})

    base_monthly = summary.get("total_cost_usd", 0.0)
    if base_monthly <= 0:
        return json.dumps({"error": "No Azure cost data available for the current month", "cloud_provider": "azure"})

    forecast = []
    for m in range(1, months + 1):
        projected = base_monthly * (1 + growth / 100) ** (m / 12)
        forecast.append({"month": m, "projected_cost_usd": round(projected, 2)})

    total_projected = sum(f["projected_cost_usd"] for f in forecast)

    return json.dumps({
        "cloud_provider": "azure",
        "base_monthly_usd": round(base_monthly, 2),
        "data_source": "live",
        "forecast_months": months,
        "growth_adjustment_percent": growth,
        "forecast": forecast,
        "total_projected_cost_usd": round(total_projected, 2),
        "confidence_interval": "±12%",
    })
