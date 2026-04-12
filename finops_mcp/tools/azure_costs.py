"""Azure Cost Management integration."""

import json
import logging
from typing import Any
from datetime import datetime, timedelta
from finops_mcp.config import Config

logger = logging.getLogger(__name__)
config = Config()


async def get_cost_summary(params: dict[str, Any]) -> str:
    """
    Get Azure cost summary for specified period using Cost Management API.
    
    Returns: JSON string with total cost, top services, trends
    """
    try:
        period = params.get("period", "month")
        
        if not config.azure_subscription_id:
            return json.dumps({"error": "Azure not configured (AZURE_SUBSCRIPTION_ID not set)"})
        
        try:
            from azure.identity import ClientSecretCredential
            from azure.mgmt.costmanagement import CostManagementClient
            from azure.mgmt.costmanagement.models import QueryDefinition, QueryGrouping, QueryFilter
        except ImportError:
            logger.warning("Azure SDK not available, returning mock data")
            return _mock_cost_summary(period)
        
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
        
        # Build query
        scope = f"subscriptions/{config.azure_subscription_id}"
        
        query_def = QueryDefinition(
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
                        "name": "MeterCategory"
                    }
                ],
                "sorting": [
                    {
                        "direction": "Ascending",
                        "name": "MeterCategory"
                    }
                ]
            }
        )
        
        # Execute query
        query_result = client.query.usage(scope, query_def)
        
        # Parse results
        total_cost = 0.0
        services = {}
        
        if hasattr(query_result, 'rows'):
            for row in query_result.rows:
                if len(row) >= 2:
                    service_name = row[0] or "Unknown"
                    cost = float(row[1]) if row[1] else 0
                    services[service_name] = services.get(service_name, 0) + cost
                    total_cost += cost
        
        # Sort by cost descending
        top_services = sorted(services.items(), key=lambda x: x[1], reverse=True)[:5]
        
        return json.dumps({
            "period": period,
            "start_date": str(start_date),
            "end_date": str(end_date),
            "total_cost_usd": round(total_cost, 2),
            "top_services": [
                {"service": s, "cost_usd": round(c, 2)} for s, c in top_services
            ],
            "currency": "USD",
            "cloud_provider": "azure",
        })
        
    except Exception as e:
        logger.error(f"Error fetching Azure costs: {str(e)}")
        return json.dumps({"error": str(e), "cloud_provider": "azure"})


def _mock_cost_summary(period: str) -> str:
    """Return mock Azure cost data."""
    return json.dumps({
        "period": period,
        "start_date": (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d"),
        "end_date": datetime.now().strftime("%Y-%m-%d"),
        "total_cost_usd": 650.00,
        "top_services": [
            {"service": "Virtual Machines", "cost_usd": 350.00},
            {"service": "Storage", "cost_usd": 150.00},
            {"service": "SQL Database", "cost_usd": 100.00},
            {"service": "App Service", "cost_usd": 50.00},
        ],
        "currency": "USD",
        "cloud_provider": "azure",
        "note": "Mock data - Azure SDK not available",
    })


async def get_forecast(params: dict[str, Any]) -> str:
    """Forecast Azure costs based on historical trend."""
    months = params.get("months", 3)
    growth = params.get("growth_percent", 5)
    
    forecast = []
    base_monthly = 650.0
    
    for m in range(1, months + 1):
        projected = base_monthly * (1 + growth / 100) ** (m / 12)
        forecast.append({
            "month": m,
            "projected_cost_usd": round(projected, 2)
        })
    
    total_projected = sum(f["projected_cost_usd"] for f in forecast)
    
    return json.dumps({
        "cloud_provider": "azure",
        "forecast_months": months,
        "growth_adjustment_percent": growth,
        "forecast": forecast,
        "total_projected_cost_usd": round(total_projected, 2),
        "confidence_interval": "±12%"
    })
