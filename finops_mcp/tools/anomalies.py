"""Cost anomaly detection engine."""

import json
import logging
from typing import Any
from datetime import datetime

logger = logging.getLogger(__name__)


async def detect_anomalies(params: dict[str, Any]) -> str:
    """
    Detect cost anomalies by comparing each service's recent (weekly) run rate
    against its longer-term (monthly) average.

    A service is flagged when its annualised weekly spend exceeds its annualised
    monthly spend by more than `sensitivity` percent, indicating an acceleration
    in cost that is not explained by the historical baseline.
    """
    try:
        cloud_provider = params.get("cloud_provider", "aws")
        window_days = int(params.get("window_days", 30))
        sensitivity = float(params.get("sensitivity", 5))

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

        # Fetch both periods concurrently would require asyncio.gather; call sequentially
        # for simplicity and to avoid import overhead.
        monthly_raw = await get_cost_summary({"period": "month"})
        weekly_raw = await get_cost_summary({"period": "week"})

        monthly = json.loads(monthly_raw)
        weekly = json.loads(weekly_raw)

        if "error" in monthly:
            return json.dumps({
                "cloud_provider": cloud_provider,
                "error": monthly["error"],
                "anomalies_found": 0,
                "anomalies": [],
            })

        if "error" in weekly:
            return json.dumps({
                "cloud_provider": cloud_provider,
                "error": weekly["error"],
                "anomalies_found": 0,
                "anomalies": [],
            })

        # Build per-service lookup; normalise to a monthly equivalent rate.
        # monthly period  = 30 days  → rate_per_day = cost / 30
        # weekly period   =  7 days  → rate_per_day = cost / 7
        # Compare: if weekly_rate_per_day > monthly_rate_per_day × (1 + sensitivity/100)
        # the service is accelerating.
        monthly_services = {
            s["service"]: s["cost_usd"] / 30
            for s in monthly.get("top_services", [])
        }
        weekly_services = {
            s["service"]: s["cost_usd"] / 7
            for s in weekly.get("top_services", [])
        }

        anomalies_list = []
        for service, weekly_daily_rate in weekly_services.items():
            monthly_daily_rate = monthly_services.get(service)
            if monthly_daily_rate is None or monthly_daily_rate <= 0:
                continue

            threshold = monthly_daily_rate * (1 + sensitivity / 100)
            if weekly_daily_rate > threshold:
                increase_pct = round((weekly_daily_rate / monthly_daily_rate - 1) * 100, 1)
                # Re-express as monthly costs for readability.
                baseline_monthly = round(monthly_daily_rate * 30, 2)
                current_monthly_equiv = round(weekly_daily_rate * 30, 2)
                anomalies_list.append({
                    "service": service,
                    "date": datetime.now().isoformat(),
                    "baseline_usd": baseline_monthly,
                    "actual_usd": current_monthly_equiv,
                    "increase_percent": increase_pct,
                    "probable_cause": (
                        f"{service} spend rate over the last 7 days is "
                        f"{increase_pct}% above the 30-day average"
                    ),
                    "confidence": min(0.95, 0.60 + (increase_pct / 200)),
                    "recommendation": (
                        f"Review recent {service} resource creation or usage spikes"
                    ),
                })

        estimated_impact = round(
            sum(a["actual_usd"] - a["baseline_usd"] for a in anomalies_list), 2
        )

        return json.dumps({
            "cloud_provider": cloud_provider,
            "detection_date": datetime.now().isoformat(),
            "window_days": window_days,
            "sensitivity_level": sensitivity,
            "anomalies_found": len(anomalies_list),
            "anomalies": anomalies_list,
            "estimated_impact_usd": estimated_impact,
        })

    except Exception as e:
        logger.error(f"Error detecting anomalies: {str(e)}")
        return json.dumps({"error": str(e)})
