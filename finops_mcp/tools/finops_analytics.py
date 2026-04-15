"""FinOps analytics and forecasting helpers.

The functions in this module are deterministic by design. GenAI can explain or
prioritize the findings, but forecast math should remain inspectable and stable.
"""

from __future__ import annotations

import json
import math
import hashlib
import statistics
from datetime import datetime
from typing import Any, Iterable


PROVIDER_PROFILES: dict[str, dict[str, float]] = {
    "aws": {"volatility": 0.12, "waste": 0.18, "commitment": 0.58, "growth": 0.018},
    "azure": {"volatility": 0.10, "waste": 0.15, "commitment": 0.42, "growth": 0.014},
    "gcp": {"volatility": 0.11, "waste": 0.16, "commitment": 0.36, "growth": 0.016},
    "oci": {"volatility": 0.08, "waste": 0.12, "commitment": 0.28, "growth": 0.010},
}

SEASONALITY = [0.94, 0.97, 1.00, 1.03, 1.05, 1.02, 0.99, 0.98, 1.01, 1.04, 1.08, 1.10]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value or default)
    except (TypeError, ValueError):
        return default


def _linear_regression(values: list[float]) -> tuple[float, float]:
    if not values:
        return 0.0, 0.0
    if len(values) == 1:
        return values[0], 0.0

    n = len(values)
    xs = list(range(n))
    x_mean = sum(xs) / n
    y_mean = sum(values) / n
    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, values))
    denominator = sum((x - x_mean) ** 2 for x in xs) or 1
    slope = numerator / denominator
    intercept = y_mean - slope * x_mean
    return intercept, slope


def _synthetic_history(
    current_monthly: float,
    months: int,
    growth: float,
    volatility: float,
) -> list[float]:
    """Generate a backward-looking synthetic history to anchor regression.

    We keep this deterministic (no RNG) so forecasts are inspectable and repeatable.
    """
    if current_monthly <= 0:
        return [0.0 for _ in range(months)]

    values: list[float] = []
    for index in range(months):
        age = months - index - 1
        trend_factor = (1 + growth) ** (-age)
        seasonal_factor = SEASONALITY[index % len(SEASONALITY)]
        wave = math.sin((index + 1) * math.pi / 3) * volatility * 0.22
        value = current_monthly * trend_factor * seasonal_factor * (1 + wave)
        values.append(max(value, 0.0))
    return values


def _deterministic_random_sequence(seed_material: str, count: int) -> list[float]:
    """Produce a stable pseudo-random sequence in [0, 1) using SHA256 as PRNG.

    This avoids importing `random` to keep the model reproducible and side-effect free.
    """
    result: list[float] = []
    digest = seed_material.encode()
    while len(result) < count:
        digest = hashlib.sha256(digest).digest()
        for byte in digest:
            if len(result) >= count:
                break
            result.append(byte / 255.0)
    return result


def _percentile(values: Iterable[float], pct: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    k = (len(ordered) - 1) * pct
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return ordered[int(k)]
    d0 = ordered[f] * (c - k)
    d1 = ordered[c] * (k - f)
    return d0 + d1


def _provider_inputs(cost_breakdown: dict[str, Any]) -> dict[str, float]:
    providers: dict[str, float] = {}
    for provider, details in cost_breakdown.items():
        if isinstance(details, dict):
            providers[provider] = _safe_float(details.get("cost"))
        else:
            providers[provider] = _safe_float(details)
    return providers


def build_forecast(params: dict[str, Any]) -> dict[str, Any]:
    """Deterministic forecast with a Monte Carlo fan for risk-aware planning."""

    months = int(params.get("months", 12) or 12)
    months = max(1, min(months, 24))
    current_monthly = _safe_float(params.get("current_monthly_spend"))
    cost_breakdown = params.get("cost_breakdown") or {}
    providers = _provider_inputs(cost_breakdown)
    budget_monthly = _safe_float(params.get("budget_monthly"))

    if current_monthly <= 0:
        current_monthly = sum(providers.values())
    if current_monthly <= 0:
        current_monthly = _safe_float(params.get("fallback_monthly_spend"), 0.0)

    weighted_growth = 0.0
    weighted_volatility = 0.0
    weighted_commitment = 0.0
    if current_monthly > 0 and providers:
        for provider, cost in providers.items():
            profile = PROVIDER_PROFILES.get(provider, PROVIDER_PROFILES["aws"])
            weight = cost / current_monthly
            weighted_growth += profile["growth"] * weight
            weighted_volatility += profile["volatility"] * weight
            weighted_commitment += profile["commitment"] * weight
    else:
        weighted_growth = 0.012
        weighted_volatility = 0.10
        weighted_commitment = 0.35

    history = _synthetic_history(current_monthly, 12, weighted_growth, weighted_volatility)
    intercept, slope = _linear_regression(history)
    residuals = [value - (intercept + slope * index) for index, value in enumerate(history)]
    residual_stddev = math.sqrt(sum(r * r for r in residuals) / max(len(residuals) - 1, 1))

    forecast = []
    baseline_total = 0.0
    conservative_total = 0.0
    balanced_total = 0.0
    aggressive_total = 0.0

    # Monte Carlo fan using deterministic pseudo-random samples so output is repeatable.
    simulations_per_month = 400
    seed_material = f"{current_monthly}-{weighted_growth}-{weighted_volatility}-{months}"
    samples = _deterministic_random_sequence(seed_material, simulations_per_month * months)

    for month_index in range(1, months + 1):
        regression_value = intercept + slope * (len(history) + month_index - 1)
        seasonal_value = regression_value * SEASONALITY[(month_index - 1) % len(SEASONALITY)]
        baseline = max(seasonal_value, 0.0)
        conservative = baseline * 0.90
        balanced = baseline * 0.82
        aggressive = baseline * 0.72
        confidence_width = residual_stddev + (baseline * weighted_volatility * math.sqrt(month_index) * 0.35)

        # Simulate month volatility with deterministic samples
        month_samples = samples[(month_index - 1) * simulations_per_month : month_index * simulations_per_month]
        simulated_values = [
            max(
                baseline
                * (1 + ((val - 0.5) * 2 * weighted_volatility))
                * SEASONALITY[(month_index - 1) % len(SEASONALITY)],
                0.0,
            )
            for val in month_samples
        ]
        p10 = _percentile(simulated_values, 0.10)
        p50 = _percentile(simulated_values, 0.50)
        p90 = _percentile(simulated_values, 0.90)

        budget_flag = None
        if budget_monthly > 0:
            if p90 > budget_monthly:
                budget_flag = "breach-likely"
            elif p50 > budget_monthly:
                budget_flag = "watch"
            else:
                budget_flag = "within"

        baseline_total += baseline
        conservative_total += conservative
        balanced_total += balanced
        aggressive_total += aggressive
        forecast.append(
            {
                "month": MONTHS[(datetime.utcnow().month + month_index - 1) % 12],
                "baseline": round(baseline, 2),
                "conservative": round(conservative, 2),
                "balanced": round(balanced, 2),
                "aggressive": round(aggressive, 2),
                "lower_bound": round(max(baseline - confidence_width, 0.0), 2),
                "upper_bound": round(baseline + confidence_width, 2),
                "p10": round(p10, 2),
                "p50": round(p50, 2),
                "p90": round(p90, 2),
                "budget_flag": budget_flag,
            }
        )

    scenarios = [
        {
            "name": "baseline",
            "description": "Continue current usage and purchasing patterns.",
            "projected_total_usd": round(baseline_total, 2),
            "savings_usd": 0.0,
            "savings_percent": 0.0,
            "implementation_weeks": 0,
            "risk_level": "none",
        },
        {
            "name": "conservative",
            "description": "Low-risk rightsizing, cleanup, and budget controls.",
            "projected_total_usd": round(conservative_total, 2),
            "savings_usd": round(baseline_total - conservative_total, 2),
            "savings_percent": 10.0,
            "implementation_weeks": 2,
            "risk_level": "low",
        },
        {
            "name": "balanced",
            "description": "Rightsizing plus commitment coverage and storage lifecycle policies.",
            "projected_total_usd": round(balanced_total, 2),
            "savings_usd": round(baseline_total - balanced_total, 2),
            "savings_percent": 18.0,
            "implementation_weeks": 4,
            "risk_level": "medium",
        },
        {
            "name": "aggressive",
            "description": "Deeper architecture changes, autoscaling policy updates, and workload scheduling.",
            "projected_total_usd": round(aggressive_total, 2),
            "savings_usd": round(baseline_total - aggressive_total, 2),
            "savings_percent": 28.0,
            "implementation_weeks": 8,
            "risk_level": "high",
        },
    ]

    budget_guardrails = None
    if budget_monthly > 0:
        breaches = [row for row in forecast if row.get("p90", 0) > budget_monthly]
        budget_guardrails = {
            "budget_monthly_usd": round(budget_monthly, 2),
            "breaches": len(breaches),
            "first_breach_month": breaches[0]["month"] if breaches else None,
            "breach_severity": "high" if len(breaches) > months * 0.4 else "medium" if breaches else "none",
        }

    fan = [
        {"month": row["month"], "p10": row["p10"], "p50": row["p50"], "p90": row["p90"], "budget_flag": row["budget_flag"]}
        for row in forecast
    ]

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "forecast_months": months,
        "current_monthly_spend_usd": round(current_monthly, 2),
        "model": {
            "type": "regression_with_deterministic_monte_carlo_fan",
            "monthly_growth_rate": round(weighted_growth, 4),
            "weighted_volatility": round(weighted_volatility, 4),
            "commitment_score": round(weighted_commitment, 4),
            "confidence_method": "residual_stddev_plus_provider_volatility",
        },
        "history": [
            {"month": MONTHS[index % 12], "actual_usd": round(value, 2)}
            for index, value in enumerate(history)
        ],
        "forecast": forecast,
        "fan_percentiles": fan,
        "budget_guardrails": budget_guardrails,
        "genai_brief": "Fan chart built with deterministic pseudo-randomness; safe to narrate via GenAI without drifting math.",
        "scenarios": scenarios,
    }


def build_analytics(params: dict[str, Any]) -> dict[str, Any]:
    cost_breakdown = params.get("cost_breakdown") or {}
    providers = _provider_inputs(cost_breakdown)
    current_monthly = _safe_float(params.get("current_monthly_spend"), sum(providers.values()))
    anomalies = int(params.get("anomalies", 0) or 0)
    recommendation_savings = _safe_float(params.get("monthly_savings"), current_monthly * 0.12)

    provider_findings = []
    weighted_waste = 0.0
    weighted_commitment = 0.0
    provider_signals = []
    for provider, cost in providers.items():
        profile = PROVIDER_PROFILES.get(provider, PROVIDER_PROFILES["aws"])
        weight = cost / current_monthly if current_monthly else 0.0
        waste = cost * profile["waste"]
        weighted_waste += profile["waste"] * weight
        weighted_commitment += profile["commitment"] * weight
        provider_findings.append(
            {
                "provider": provider,
                "monthly_cost_usd": round(cost, 2),
                "estimated_waste_usd": round(waste, 2),
                "commitment_coverage_percent": round(profile["commitment"] * 100, 1),
                "volatility_score": round(profile["volatility"] * 100, 1),
            }
        )

        provider_signals.append(
            {
                "provider": provider,
                "signal": "low-commitment" if profile["commitment"] < 0.4 else "stable",
                "message": (
                    "Increase commitments/Savings Plans coverage for steady workloads"
                    if profile["commitment"] < 0.4
                    else "Commitment coverage looks healthy"
                ),
            }
        )

    risk_score = min(100, round((weighted_waste * 160) + anomalies * 8 + (1 - weighted_commitment) * 35, 1))
    maturity_score = max(0, round(100 - risk_score + min(weighted_commitment * 20, 10), 1))

    efficiency_delta = (recommendation_savings / current_monthly) * 100 if current_monthly else 0.0

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "current_monthly_spend_usd": round(current_monthly, 2),
        "estimated_monthly_waste_usd": round(current_monthly * weighted_waste, 2),
        "identified_monthly_savings_usd": round(recommendation_savings, 2),
        "risk_score": risk_score,
        "maturity_score": maturity_score,
        "commitment_coverage_percent": round(weighted_commitment * 100, 1),
        "unit_metrics": {
            "estimated_waste_rate_percent": round(weighted_waste * 100, 1),
            "savings_to_spend_percent": round(efficiency_delta, 1),
            "anomaly_density_per_10k": round((anomalies / max(current_monthly, 1)) * 10000, 2),
        },
        "provider_findings": provider_findings,
        "provider_signals": provider_signals,
        "actions": [
            "Prioritize high-spend providers with low commitment coverage.",
            "Run scan approval before trusting remediation estimates.",
            "Use balanced scenario as the default executive forecast.",
        ],
        "genai_advice_prompt": (
            "Summarize savings opportunities, call out budget breaches, and explain the fan chart bands "
            "using p10/p50/p90 in plain language without altering the numeric values."
        ),
    }


async def get_forecast(params: dict[str, Any]) -> str:
    return json.dumps(build_forecast(params))


async def get_analytics(params: dict[str, Any]) -> str:
    return json.dumps(build_analytics(params))
