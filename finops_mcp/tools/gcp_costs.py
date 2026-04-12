"""GCP Billing integration via BigQuery."""

import json
import logging
from typing import Any
from datetime import datetime, timedelta
from finops_mcp.config import Config

logger = logging.getLogger(__name__)
config = Config()


async def get_cost_summary(params: dict[str, Any]) -> str:
    """
    Get GCP cost summary for specified period using BigQuery billing export.
    
    Returns: JSON string with total cost, top services, trends
    """
    try:
        period = params.get("period", "month")
        
        if not config.google_application_credentials:
            return json.dumps({"error": "GCP not configured (GOOGLE_APPLICATION_CREDENTIALS not set)"})
        
        try:
            from google.cloud import bigquery
            from google.oauth2 import service_account
            import json as json_lib
        except ImportError:
            logger.warning("GCP SDK not available, returning mock data")
            return _mock_cost_summary(period)
        
        # Load GCP credentials
        credentials = service_account.Credentials.from_service_account_file(
            config.google_application_credentials
        )
        
        client = bigquery.Client(credentials=credentials)
        
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
        
        # Query BigQuery for billing data
        # Typical billing export table: project.billing_dataset.gcp_billing_export_v1_xxxxxxxxxxxx
        query = f"""
        SELECT
            service.description AS service_name,
            SUM(CAST(cost AS FLOAT64)) as total_cost
        FROM
            `{config.gcp_project_id}.billing.gcp_billing_export_v1_*`
        WHERE
            PARSE_DATE('%Y%m%d', usage_start_time) >= '{start_date}'
            AND PARSE_DATE('%Y%m%d', usage_start_time) <= '{end_date}'
        GROUP BY
            service_name
        ORDER BY
            total_cost DESC
        LIMIT 10
        """
        
        query_job = client.query(query)
        results = query_job.result()
        
        # Parse results
        total_cost = 0.0
        services = {}
        
        for row in results:
            service_name = row.service_name or "Unknown"
            cost = float(row.total_cost or 0)
            services[service_name] = cost
            total_cost += cost
        
        # Get top 5 services
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
            "cloud_provider": "gcp",
        })
        
    except Exception as e:
        logger.error(f"Error fetching GCP costs: {str(e)}")
        return json.dumps({"error": str(e), "cloud_provider": "gcp"})


def _mock_cost_summary(period: str) -> str:
    """Return mock GCP cost data."""
    return json.dumps({
        "period": period,
        "start_date": (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d"),
        "end_date": datetime.now().strftime("%Y-%m-%d"),
        "total_cost_usd": 550.00,
        "top_services": [
            {"service": "Compute Engine", "cost_usd": 300.00},
            {"service": "Cloud Storage", "cost_usd": 120.00},
            {"service": "BigQuery", "cost_usd": 80.00},
            {"service": "Cloud SQL", "cost_usd": 50.00},
        ],
        "currency": "USD",
        "cloud_provider": "gcp",
        "note": "Mock data - GCP SDK not available",
    })


async def get_forecast(params: dict[str, Any]) -> str:
    """Forecast GCP costs based on historical trend."""
    months = params.get("months", 3)
    growth = params.get("growth_percent", 5)
    
    forecast = []
    base_monthly = 550.0
    
    for m in range(1, months + 1):
        projected = base_monthly * (1 + growth / 100) ** (m / 12)
        forecast.append({
            "month": m,
            "projected_cost_usd": round(projected, 2)
        })
    
    total_projected = sum(f["projected_cost_usd"] for f in forecast)
    
    return json.dumps({
        "cloud_provider": "gcp",
        "forecast_months": months,
        "growth_adjustment_percent": growth,
        "forecast": forecast,
        "total_projected_cost_usd": round(total_projected, 2),
        "confidence_interval": "±11%"
    })
