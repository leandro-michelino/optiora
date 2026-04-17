"""FinOps analytics and forecasting helpers.

The functions in this module are deterministic by design. GenAI can explain or
prioritize the findings, but forecast math should remain inspectable and stable.
"""

from __future__ import annotations

import json
import math
import hashlib
from datetime import datetime, timezone
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


def _normalized_history_points(raw_history: Any) -> list[float]:
    if not isinstance(raw_history, list):
        return []
    points: list[float] = []
    for row in raw_history:
        if isinstance(row, dict):
            points.append(max(_safe_float(row.get("actual_usd"), 0.0), 0.0))
        else:
            points.append(max(_safe_float(row, 0.0), 0.0))
    return [value for value in points if value >= 0.0]


def _project_baseline_series(
    history: list[float],
    horizon: int,
    weighted_growth: float,
    weighted_volatility: float,
) -> tuple[list[dict[str, float]], float]:
    intercept, slope = _linear_regression(history)
    smoothing_alpha = 0.35
    smoothed = history[0] if history else 0.0
    for value in history[1:]:
        smoothed = (smoothing_alpha * value) + ((1 - smoothing_alpha) * smoothed)
    residuals = [value - (intercept + slope * index) for index, value in enumerate(history)]
    residual_stddev = math.sqrt(sum(r * r for r in residuals) / max(len(residuals) - 1, 1))

    projected: list[dict[str, float]] = []
    for month_index in range(1, horizon + 1):
        regression_value = intercept + slope * (len(history) + month_index - 1)
        extrapolated_smooth = smoothed * ((1 + weighted_growth) ** month_index)
        blended = (regression_value * 0.7) + (extrapolated_smooth * 0.3)
        seasonal_value = blended * SEASONALITY[(month_index - 1) % len(SEASONALITY)]
        baseline = max(seasonal_value, 0.0)
        confidence_width = residual_stddev + (baseline * weighted_volatility * math.sqrt(month_index) * 0.35)
        projected.append(
            {
                "baseline": baseline,
                "lower_bound": max(baseline - confidence_width, 0.0),
                "upper_bound": baseline + confidence_width,
            }
        )
    return projected, residual_stddev


def _backtesting_metrics(history: list[float], weighted_growth: float, weighted_volatility: float) -> dict[str, Any] | None:
    if len(history) < 8:
        return None

    holdout = min(3, max(1, len(history) // 4))
    if len(history) - holdout < 5:
        return None

    train = history[:-holdout]
    actual = history[-holdout:]
    projected, _ = _project_baseline_series(train, holdout, weighted_growth, weighted_volatility)
    predicted = [row["baseline"] for row in projected]

    ape_values: list[float] = []
    abs_error_sum = 0.0
    actual_sum = 0.0
    for a, p in zip(actual, predicted):
        abs_error = abs(a - p)
        abs_error_sum += abs_error
        actual_sum += a
        if a > 0:
            ape_values.append(abs_error / a)

    mape = (sum(ape_values) / len(ape_values) * 100) if ape_values else None
    wmape = (abs_error_sum / actual_sum * 100) if actual_sum > 0 else None
    return {
        "window_months": holdout,
        "mape_percent": round(mape, 2) if mape is not None else None,
        "wmape_percent": round(wmape, 2) if wmape is not None else None,
        "training_points": len(train),
        "actual_points": [round(value, 2) for value in actual],
        "predicted_points": [round(value, 2) for value in predicted],
    }


def build_forecast(params: dict[str, Any]) -> dict[str, Any]:
    """Deterministic forecast with a Monte Carlo fan for risk-aware planning."""

    months = int(params.get("months", 12) or 12)
    months = max(1, min(months, 24))
    current_monthly = _safe_float(params.get("current_monthly_spend"))
    cost_breakdown = params.get("cost_breakdown") or {}
    providers = _provider_inputs(cost_breakdown)
    budget_monthly = _safe_float(params.get("budget_monthly"))
    external_history = _normalized_history_points(params.get("historical_monthly_spend"))

    if current_monthly <= 0:
        current_monthly = sum(providers.values())
    if current_monthly <= 0 and external_history:
        current_monthly = external_history[-1]
    if current_monthly <= 0:
        current_monthly = _safe_float(params.get("fallback_monthly_spend"), 0.0)

    weighted_growth = 0.0
    weighted_volatility = 0.0
    weighted_commitment = 0.0
    provider_concentration = 0.0
    if current_monthly > 0 and providers:
        for provider, cost in providers.items():
            profile = PROVIDER_PROFILES.get(provider, PROVIDER_PROFILES["aws"])
            weight = cost / current_monthly
            weighted_growth += profile["growth"] * weight
            weighted_volatility += profile["volatility"] * weight
            weighted_commitment += profile["commitment"] * weight
            provider_concentration += weight * weight
    else:
        weighted_growth = 0.012
        weighted_volatility = 0.10
        weighted_commitment = 0.35
        provider_concentration = 1.0

    history_source = "cost_snapshots" if len(external_history) >= 6 else "synthetic"
    history = external_history[-18:] if history_source == "cost_snapshots" else _synthetic_history(
        current_monthly,
        12,
        weighted_growth,
        weighted_volatility,
    )
    projected_baseline, _ = _project_baseline_series(history, months, weighted_growth, weighted_volatility)
    backtesting = _backtesting_metrics(history, weighted_growth, weighted_volatility)

    forecast = []
    baseline_total = 0.0
    conservative_total = 0.0
    balanced_total = 0.0
    aggressive_total = 0.0
    budget_breach_probability_sum = 0.0

    # Monte Carlo fan using deterministic pseudo-random samples so output is repeatable.
    simulations_per_month = 400
    seed_material = f"{current_monthly}-{weighted_growth}-{weighted_volatility}-{months}"
    samples = _deterministic_random_sequence(seed_material, simulations_per_month * months)

    for month_index in range(1, months + 1):
        projection = projected_baseline[month_index - 1]
        baseline = projection["baseline"]
        conservative = baseline * 0.90
        balanced = baseline * 0.82
        aggressive = baseline * 0.72

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
        breach_probability = 0.0
        if budget_monthly > 0:
            breach_probability = sum(1 for val in simulated_values if val > budget_monthly) / max(
                len(simulated_values),
                1,
            )

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
        budget_breach_probability_sum += breach_probability
        forecast.append(
            {
                "month": MONTHS[(datetime.now(timezone.utc).replace(tzinfo=None).month + month_index - 1) % 12],
                "baseline": round(baseline, 2),
                "conservative": round(conservative, 2),
                "balanced": round(balanced, 2),
                "aggressive": round(aggressive, 2),
                "lower_bound": round(projection["lower_bound"], 2),
                "upper_bound": round(projection["upper_bound"], 2),
                "p10": round(p10, 2),
                "p50": round(p50, 2),
                "p90": round(p90, 2),
                "budget_flag": budget_flag,
                "budget_breach_probability": round(breach_probability, 4),
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
            "average_breach_probability": round(budget_breach_probability_sum / max(months, 1), 4),
        }

    fan = [
        {"month": row["month"], "p10": row["p10"], "p50": row["p50"], "p90": row["p90"], "budget_flag": row["budget_flag"]}
        for row in forecast
    ]

    return {
        "generated_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        "forecast_months": months,
        "history_source": history_source,
        "history_coverage_months": len(history),
        "current_monthly_spend_usd": round(current_monthly, 2),
        "model": {
            "type": "blended_regression_smoothing_with_deterministic_monte_carlo_fan",
            "monthly_growth_rate": round(weighted_growth, 4),
            "weighted_volatility": round(weighted_volatility, 4),
            "commitment_score": round(weighted_commitment, 4),
            "provider_concentration_hhi": round(provider_concentration, 4),
            "confidence_method": "residual_stddev_plus_provider_volatility",
        },
        "history": [
            {"month": MONTHS[index % 12], "actual_usd": round(value, 2)}
            for index, value in enumerate(history)
        ],
        "forecast": forecast,
        "fan_percentiles": fan,
        "budget_guardrails": budget_guardrails,
        "backtesting": backtesting,
        "forecast_summary": {
            "annualized_run_rate_usd": round((forecast[0]["baseline"] if forecast else 0.0) * 12, 2),
            "projected_12m_baseline_usd": round(baseline_total, 2),
            "projected_12m_balanced_usd": round(balanced_total, 2),
            "expected_12m_savings_balanced_usd": round(baseline_total - balanced_total, 2),
        },
        "genai_brief": "Fan chart built with deterministic pseudo-randomness; safe to narrate via GenAI without drifting math.",
        "genai_context": {
            "prompt": (
                "Explain cost trajectory by combining trend, concentration risk, and budget breach probability. "
                "Use p10/p50/p90 language and keep all numbers unchanged."
            ),
            "focus_areas": [
                "budget-risk",
                "commitment-coverage",
                "provider-concentration",
            ],
        },
        "scenarios": scenarios,
    }


def build_analytics(params: dict[str, Any]) -> dict[str, Any]:
    cost_breakdown = params.get("cost_breakdown") or {}
    providers = _provider_inputs(cost_breakdown)
    current_monthly = _safe_float(params.get("current_monthly_spend"), sum(providers.values()))
    anomalies = int(params.get("anomalies", 0) or 0)
    recommendation_savings = _safe_float(params.get("monthly_savings"), current_monthly * 0.12)
    budget_monthly = _safe_float(params.get("budget_monthly"))

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
    budget_utilization_percent = (current_monthly / budget_monthly) * 100 if budget_monthly > 0 else 0.0
    spend_at_risk_usd = max(current_monthly - budget_monthly, 0.0) if budget_monthly > 0 else 0.0
    optimization_capacity_usd = max((current_monthly * weighted_waste) - recommendation_savings, 0.0)

    return {
        "generated_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
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
            "budget_utilization_percent": round(budget_utilization_percent, 1),
        },
        "spend_at_risk_usd": round(spend_at_risk_usd, 2),
        "optimization_capacity_usd": round(optimization_capacity_usd, 2),
        "provider_findings": provider_findings,
        "provider_signals": provider_signals,
        "actions": [
            "Prioritize high-spend providers with low commitment coverage.",
            "Run scan approval before trusting remediation estimates.",
            "Use balanced scenario as the default executive forecast.",
            "Use GenAI to produce stakeholder-specific rollout plans from these deterministic metrics.",
        ],
        "genai_advice_prompt": (
            "Summarize savings opportunities, call out budget pressure and spend at risk, and explain the fan chart bands "
            "using p10/p50/p90 in plain language without altering the numeric values."
        ),
    }


async def get_forecast(params: dict[str, Any]) -> str:
    return json.dumps(build_forecast(params))


async def get_analytics(params: dict[str, Any]) -> str:
    return json.dumps(build_analytics(params))
