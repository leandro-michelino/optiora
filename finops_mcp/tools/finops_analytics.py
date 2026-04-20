"""FinOps analytics and forecasting helpers.

The functions in this module are deterministic by design. GenAI can explain or
prioritize the findings, but forecast math should remain inspectable and stable.

Modules:
  build_forecast()              — deterministic Monte Carlo fan with breach probabilities
  build_analytics()             — risk/maturity/waste/commitment analytics
  build_cost_attribution()      — Pareto cost driver attribution
  build_commitment_optimization() — RI/Savings Plan ROI modeling
  build_maturity_assessment()   — CRAWL/WALK/RUN FinOps maturity model
  build_anomaly_scores()        — z-score anomaly severity ranking
  build_unit_economics()        — unit cost trend and efficiency ratios
"""

from __future__ import annotations

import json
import math
import hashlib
from datetime import datetime, timezone
from typing import Any, Iterable


PROVIDER_PROFILES: dict[str, dict[str, float]] = {
    "aws":   {"volatility": 0.12, "waste": 0.18, "commitment": 0.58, "growth": 0.018},
    "azure": {"volatility": 0.10, "waste": 0.15, "commitment": 0.42, "growth": 0.014},
    "gcp":   {"volatility": 0.11, "waste": 0.16, "commitment": 0.36, "growth": 0.016},
    "oci":   {"volatility": 0.08, "waste": 0.12, "commitment": 0.28, "growth": 0.010},
}

# Industry FinOps maturity benchmarks (waste rate %, commitment %, anomaly density per $10k)
MATURITY_THRESHOLDS = {
    "crawl": {"waste_max": 30.0, "commitment_min": 0.0,  "anomaly_density_max": 20.0},
    "walk":  {"waste_max": 20.0, "commitment_min": 0.35, "anomaly_density_max": 10.0},
    "run":   {"waste_max": 12.0, "commitment_min": 0.55, "anomaly_density_max": 5.0},
    "optimize": {"waste_max": 6.0, "commitment_min": 0.70, "anomaly_density_max": 2.0},
}

# Commitment discount rates by coverage tier (approximate market averages)
COMMITMENT_DISCOUNT_RATES: dict[str, dict[str, float]] = {
    "aws":   {"1yr_no_upfront": 0.26, "1yr_partial": 0.30, "3yr_partial": 0.42, "3yr_all": 0.52},
    "azure": {"1yr":            0.22, "3yr":          0.38},
    "gcp":   {"1yr":            0.20, "3yr":          0.37},
    "oci":   {"1yr":            0.18, "3yr":          0.34},
}

SEASONALITY = [0.94, 0.97, 1.00, 1.03, 1.05, 1.02, 0.99, 0.98, 1.01, 1.04, 1.08, 1.10]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value or default)
    except (TypeError, ValueError):
        return default


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


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
    """Backward-looking synthetic history to anchor regression — deterministic, no RNG."""
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
    """Stable pseudo-random sequence in [0, 1) using SHA256 as PRNG."""
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
    return ordered[f] * (c - k) + ordered[c] * (k - f)


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
    residuals = [v - (intercept + slope * i) for i, v in enumerate(history)]
    residual_stddev = math.sqrt(sum(r * r for r in residuals) / max(len(residuals) - 1, 1))

    projected: list[dict[str, float]] = []
    for month_index in range(1, horizon + 1):
        regression_value = intercept + slope * (len(history) + month_index - 1)
        extrapolated_smooth = smoothed * ((1 + weighted_growth) ** month_index)
        blended = (regression_value * 0.7) + (extrapolated_smooth * 0.3)
        seasonal_value = blended * SEASONALITY[(month_index - 1) % len(SEASONALITY)]
        baseline = max(seasonal_value, 0.0)
        confidence_width = residual_stddev + (
            baseline * weighted_volatility * math.sqrt(month_index) * 0.35
        )
        projected.append({
            "baseline": baseline,
            "lower_bound": max(baseline - confidence_width, 0.0),
            "upper_bound": baseline + confidence_width,
        })
    return projected, residual_stddev


def _backtesting_metrics(
    history: list[float], weighted_growth: float, weighted_volatility: float
) -> dict[str, Any] | None:
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
        "actual_points": [round(v, 2) for v in actual],
        "predicted_points": [round(v, 2) for v in predicted],
    }


def _weighted_provider_metrics(
    providers: dict[str, float], current_monthly: float
) -> tuple[float, float, float, float]:
    """Return (weighted_growth, weighted_volatility, weighted_commitment, hhi)."""
    if not providers or current_monthly <= 0:
        return 0.012, 0.10, 0.35, 1.0
    wg = wv = wc = hhi = 0.0
    for provider, cost in providers.items():
        profile = PROVIDER_PROFILES.get(provider, PROVIDER_PROFILES["aws"])
        weight = cost / current_monthly
        wg += profile["growth"] * weight
        wv += profile["volatility"] * weight
        wc += profile["commitment"] * weight
        hhi += weight * weight
    return wg, wv, wc, hhi


def _seasonality_strength(history: list[float]) -> float:
    if len(history) < 6:
        return 0.0
    avg = sum(history) / len(history)
    if avg <= 0:
        return 0.0
    seasonal_delta = [abs((v / avg) - 1.0) for v in history]
    return round(min(sum(seasonal_delta) / len(seasonal_delta), 1.0), 4)


def _trend_regime(velocity_pct: float | None, acceleration_usd: float | None) -> str:
    if velocity_pct is None:
        return "unknown"
    if velocity_pct > 6 and (acceleration_usd or 0.0) > 0:
        return "accelerating-up"
    if velocity_pct > 2:
        return "up"
    if velocity_pct < -4:
        return "down"
    return "flat"


# ---------------------------------------------------------------------------
# Public: Forecast
# ---------------------------------------------------------------------------

def build_forecast(params: dict[str, Any]) -> dict[str, Any]:
    """Deterministic forecast with Monte Carlo fan for risk-aware planning."""
    months = max(1, min(int(params.get("months", 12) or 12), 24))
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

    weighted_growth, weighted_volatility, weighted_commitment, provider_concentration = (
        _weighted_provider_metrics(providers, current_monthly)
    )

    history_source = "cost_snapshots" if len(external_history) >= 6 else "synthetic"
    history = (
        external_history[-18:]
        if history_source == "cost_snapshots"
        else _synthetic_history(current_monthly, 12, weighted_growth, weighted_volatility)
    )
    projected_baseline, _ = _project_baseline_series(
        history, months, weighted_growth, weighted_volatility
    )
    backtesting = _backtesting_metrics(history, weighted_growth, weighted_volatility)

    # Cost velocity: MoM trend from recent history
    velocity_pct = None
    if len(history) >= 2:
        recent = history[-1]
        prev = history[-2]
        if prev > 0:
            velocity_pct = round((recent - prev) / prev * 100, 2)

    # 3-month and 6-month trend acceleration (second derivative)
    trend_acceleration = None
    if len(history) >= 6:
        slope_recent_3 = (history[-1] - history[-3]) / 3 if history[-3] > 0 else 0
        slope_prior_3 = (history[-4] - history[-6]) / 3 if history[-6] > 0 else 0
        trend_acceleration = round(slope_recent_3 - slope_prior_3, 2)

    forecast = []
    baseline_total = conservative_total = balanced_total = aggressive_total = 0.0
    budget_breach_probability_sum = 0.0
    cvar95_accumulator = 0.0
    simulations_per_month = 400
    seed_material = f"{current_monthly}-{weighted_growth}-{weighted_volatility}-{months}"
    samples = _deterministic_random_sequence(seed_material, simulations_per_month * months)

    for month_index in range(1, months + 1):
        projection = projected_baseline[month_index - 1]
        baseline = projection["baseline"]
        conservative = baseline * 0.90
        balanced = baseline * 0.82
        aggressive = baseline * 0.72

        month_samples = samples[
            (month_index - 1) * simulations_per_month : month_index * simulations_per_month
        ]
        simulated_values = [
            max(
                baseline * (1 + ((val - 0.5) * 2 * weighted_volatility))
                * SEASONALITY[(month_index - 1) % len(SEASONALITY)],
                0.0,
            )
            for val in month_samples
        ]
        p10 = _percentile(simulated_values, 0.10)
        p50 = _percentile(simulated_values, 0.50)
        p90 = _percentile(simulated_values, 0.90)
        p95 = _percentile(simulated_values, 0.95)
        tail_values = [value for value in simulated_values if value >= p95]
        cvar95 = sum(tail_values) / max(len(tail_values), 1)

        breach_probability = 0.0
        budget_flag = None
        if budget_monthly > 0:
            breach_probability = sum(
                1 for val in simulated_values if val > budget_monthly
            ) / max(len(simulated_values), 1)
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
        cvar95_accumulator += cvar95

        forecast.append({
            "month": MONTHS[(_utcnow().month + month_index - 1) % 12],
            "baseline": round(baseline, 2),
            "conservative": round(conservative, 2),
            "balanced": round(balanced, 2),
            "aggressive": round(aggressive, 2),
            "lower_bound": round(projection["lower_bound"], 2),
            "upper_bound": round(projection["upper_bound"], 2),
            "p10": round(p10, 2),
            "p50": round(p50, 2),
            "p90": round(p90, 2),
            "p95": round(p95, 2),
            "cvar95": round(cvar95, 2),
            "budget_flag": budget_flag,
            "budget_breach_probability": round(breach_probability, 4),
        })

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
            "description": "Low-risk rightsizing, tagging enforcement, and budget controls.",
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
        # Safe budget: the level that would give ~95% confidence of no breach
        safe_budget_95 = round(_percentile([r["p95"] for r in forecast], 0.90), 2)
        budget_guardrails = {
            "budget_monthly_usd": round(budget_monthly, 2),
            "breaches": len(breaches),
            "first_breach_month": breaches[0]["month"] if breaches else None,
            "breach_severity": "high" if len(breaches) > months * 0.4 else "medium" if breaches else "none",
            "average_breach_probability": round(budget_breach_probability_sum / max(months, 1), 4),
            "safe_budget_95pct_usd": safe_budget_95,
        }

    fan = [
        {
            "month": row["month"],
            "p10": row["p10"],
            "p50": row["p50"],
            "p90": row["p90"],
            "budget_flag": row["budget_flag"],
        }
        for row in forecast
    ]

    seasonality_strength = _seasonality_strength(history)
    trend_regime = _trend_regime(velocity_pct, trend_acceleration)
    downside_cvar95_monthly = round(cvar95_accumulator / max(months, 1), 2)
    confidence_score = max(
        20.0,
        min(
            98.0,
            round(
                85.0
                - (weighted_volatility * 120)
                - (provider_concentration * 18)
                - (seasonality_strength * 20)
                + (8.0 if backtesting and backtesting.get("wmape_percent") and backtesting.get("wmape_percent") <= 12 else 0.0),
                1,
            ),
        ),
    )

    return {
        "generated_at": _utcnow().isoformat(),
        "forecast_months": months,
        "history_source": history_source,
        "history_coverage_months": len(history),
        "current_monthly_spend_usd": round(current_monthly, 2),
        "cost_velocity_pct_mom": velocity_pct,
        "trend_acceleration_usd": trend_acceleration,
        "model": {
            "type": "blended_regression_smoothing_with_deterministic_monte_carlo_fan",
            "monthly_growth_rate": round(weighted_growth, 4),
            "weighted_volatility": round(weighted_volatility, 4),
            "commitment_score": round(weighted_commitment, 4),
            "provider_concentration_hhi": round(provider_concentration, 4),
            "seasonality_strength": seasonality_strength,
            "trend_regime": trend_regime,
            "confidence_method": "residual_stddev_plus_provider_volatility",
        },
        "history": [
            {"month": MONTHS[i % 12], "actual_usd": round(v, 2)}
            for i, v in enumerate(history)
        ],
        "forecast": forecast,
        "fan_percentiles": fan,
        "budget_guardrails": budget_guardrails,
        "downside_risk": {
            "average_cvar95_monthly_usd": downside_cvar95_monthly,
            "cvar95_excess_vs_baseline_usd": round(
                max(downside_cvar95_monthly - ((baseline_total / max(months, 1)) if months > 0 else 0.0), 0.0),
                2,
            ),
        },
        "forecast_quality": {
            "confidence_score": confidence_score,
            "trend_regime": trend_regime,
            "seasonality_strength": seasonality_strength,
            "volatility_regime": "high" if weighted_volatility >= 0.14 else "medium" if weighted_volatility >= 0.10 else "low",
        },
        "backtesting": backtesting,
        "forecast_summary": {
            "annualized_run_rate_usd": round((forecast[0]["baseline"] if forecast else 0.0) * 12, 2),
            "projected_12m_baseline_usd": round(baseline_total, 2),
            "projected_12m_balanced_usd": round(balanced_total, 2),
            "expected_12m_savings_balanced_usd": round(baseline_total - balanced_total, 2),
        },
        "genai_brief": (
            "Deterministic fan chart. Narrate using p10/p50/p90 language, "
            "highlight velocity trend and budget breach probability."
        ),
        "genai_context": {
            "prompt": (
                "Explain cost trajectory by combining trend velocity, concentration risk, "
                "and budget breach probability. Use p10/p50/p90 language. Keep all numbers unchanged."
            ),
            "focus_areas": ["budget-risk", "commitment-coverage", "provider-concentration", "cost-velocity"],
            "cost_velocity_pct": velocity_pct,
            "trend_acceleration": trend_acceleration,
        },
        "scenarios": scenarios,
    }


def build_forecast_what_if(params: dict[str, Any]) -> dict[str, Any]:
    """Deterministic what-if simulation on top of the baseline forecast.

    actions example:
      [
        {"name": "rightsizing", "start_month": 2, "savings_percent": 8.0, "one_time_cost_usd": 3000},
        {"name": "commitments", "start_month": 3, "savings_percent": 6.0, "growth_delta_percent": -1.0},
      ]
    """
    months = max(1, min(int(params.get("months", 12) or 12), 24))
    baseline = build_forecast({
        "months": months,
        "cloud_provider": params.get("cloud_provider", "all"),
        "current_monthly_spend": params.get("current_monthly_spend", 0.0),
        "cost_breakdown": params.get("cost_breakdown", {}),
        "historical_monthly_spend": params.get("historical_monthly_spend", []),
        "budget_monthly": params.get("budget_monthly", 0.0),
    })

    baseline_rows = baseline.get("forecast", [])
    actions = params.get("actions") or []
    if not isinstance(actions, list):
        actions = []

    discount_rate_monthly = _safe_float(params.get("discount_rate_monthly"), 0.01)
    simulation = []
    baseline_total = 0.0
    optimized_total = 0.0
    cumulative_savings = 0.0
    cumulative_implementation_cost = 0.0

    for idx, row in enumerate(baseline_rows, start=1):
        baseline_cost = _safe_float(row.get("baseline"), 0.0)
        baseline_total += baseline_cost
        scenario_cost = baseline_cost
        action_impact = 0.0

        for action in actions:
            if not isinstance(action, dict):
                continue
            start_month = max(1, int(_safe_float(action.get("start_month"), 1)))
            if idx < start_month:
                continue
            savings_pct = max(0.0, min(_safe_float(action.get("savings_percent"), 0.0), 80.0)) / 100.0
            growth_delta_pct = _safe_float(action.get("growth_delta_percent"), 0.0) / 100.0
            months_active = idx - start_month + 1
            compounded_effect = max((1.0 - savings_pct) * ((1.0 + growth_delta_pct) ** months_active), 0.2)
            post_action = baseline_cost * compounded_effect
            action_impact += max(scenario_cost - post_action, 0.0)
            scenario_cost = min(scenario_cost, post_action)
            if idx == start_month:
                cumulative_implementation_cost += max(_safe_float(action.get("one_time_cost_usd"), 0.0), 0.0)

        optimized_total += scenario_cost
        month_savings = max(baseline_cost - scenario_cost, 0.0)
        cumulative_savings += month_savings

        pv_factor = (1.0 + discount_rate_monthly) ** idx
        simulation.append({
            "month": row.get("month", f"M{idx}"),
            "baseline_usd": round(baseline_cost, 2),
            "scenario_usd": round(scenario_cost, 2),
            "monthly_savings_usd": round(month_savings, 2),
            "discounted_savings_usd": round(month_savings / pv_factor, 2),
            "action_impact_usd": round(action_impact, 2),
        })

    annualized_savings = (baseline_total - optimized_total)
    net_savings = max(annualized_savings - cumulative_implementation_cost, 0.0)
    roi = (
        (net_savings / cumulative_implementation_cost) * 100
        if cumulative_implementation_cost > 0 else None
    )

    payback_month = None
    running = -cumulative_implementation_cost
    for idx, row in enumerate(simulation, start=1):
        running += _safe_float(row.get("monthly_savings_usd"), 0.0)
        if running >= 0:
            payback_month = idx
            break

    return {
        "generated_at": _utcnow().isoformat(),
        "months": months,
        "actions": actions,
        "baseline_total_usd": round(baseline_total, 2),
        "scenario_total_usd": round(optimized_total, 2),
        "gross_savings_usd": round(annualized_savings, 2),
        "implementation_cost_usd": round(cumulative_implementation_cost, 2),
        "net_savings_usd": round(net_savings, 2),
        "roi_percent": round(roi, 2) if roi is not None else None,
        "payback_month": payback_month,
        "timeline": simulation,
        "baseline_forecast_quality": baseline.get("forecast_quality"),
        "genai_context": {
            "prompt": (
                "Explain this what-if scenario to finance and engineering stakeholders. "
                "Cover baseline vs scenario spend, total net savings, payback month, "
                "and execution risk in plain language."
            ),
            "gross_savings_usd": round(annualized_savings, 2),
            "net_savings_usd": round(net_savings, 2),
            "payback_month": payback_month,
        },
    }


def build_forecast_stress_test(params: dict[str, Any]) -> dict[str, Any]:
    """Deterministic stress-testing around baseline forecast trajectories.

    Produces scenario envelopes for finance risk reviews without random sampling.
    """
    months = max(1, min(int(params.get("months", 12) or 12), 24))
    severity = str(params.get("severity", "medium") or "medium").lower()
    severity_factor = {
        "low": 0.75,
        "medium": 1.0,
        "high": 1.3,
    }.get(severity, 1.0)

    baseline = build_forecast({
        "months": months,
        "cloud_provider": params.get("cloud_provider", "all"),
        "current_monthly_spend": params.get("current_monthly_spend", 0.0),
        "cost_breakdown": params.get("cost_breakdown", {}),
        "historical_monthly_spend": params.get("historical_monthly_spend", []),
        "budget_monthly": params.get("budget_monthly", 0.0),
        "fallback_monthly_spend": params.get("fallback_monthly_spend", 0.0),
    })

    forecast_rows = baseline.get("forecast", [])
    budget_monthly = _safe_float(params.get("budget_monthly"), 0.0)

    scenario_profiles = [
        {
            "name": "demand_spike",
            "description": "Unexpected workload demand increase and autoscaling pressure.",
            "demand_mult": 1 + (0.08 * severity_factor),
            "price_mult": 1.0,
            "efficiency_drag": 0.03 * severity_factor,
            "starts_month": 2,
        },
        {
            "name": "price_shock",
            "description": "Provider price mix deterioration and commitment under-utilization.",
            "demand_mult": 1.0,
            "price_mult": 1 + (0.06 * severity_factor),
            "efficiency_drag": 0.02 * severity_factor,
            "starts_month": 1,
        },
        {
            "name": "execution_delay",
            "description": "Optimization actions delayed while spend keeps growing.",
            "demand_mult": 1 + (0.04 * severity_factor),
            "price_mult": 1 + (0.03 * severity_factor),
            "efficiency_drag": 0.06 * severity_factor,
            "starts_month": 4,
        },
        {
            "name": "compound_risk",
            "description": "Demand spike and price pressure combined with slower remediation.",
            "demand_mult": 1 + (0.10 * severity_factor),
            "price_mult": 1 + (0.07 * severity_factor),
            "efficiency_drag": 0.08 * severity_factor,
            "starts_month": 2,
        },
    ]

    scenarios: list[dict[str, Any]] = []
    for profile in scenario_profiles:
      timeline: list[dict[str, Any]] = []
      stressed_total = 0.0
      peak_monthly = 0.0
      breach_count = 0

      for month_index, row in enumerate(forecast_rows, start=1):
          baseline_value = _safe_float(row.get("baseline"), 0.0)
          stress_active = month_index >= int(profile["starts_month"])
          demand_mult = profile["demand_mult"] if stress_active else 1.0
          price_mult = profile["price_mult"] if stress_active else 1.0
          drag = profile["efficiency_drag"] if stress_active else 0.0

          stressed = baseline_value * demand_mult * price_mult * (1 + drag)
          stressed = max(stressed, 0.0)
          stressed_total += stressed
          peak_monthly = max(peak_monthly, stressed)

          breach = budget_monthly > 0 and stressed > budget_monthly
          if breach:
              breach_count += 1

          timeline.append({
              "month": row.get("month", f"M{month_index}"),
              "baseline_usd": round(baseline_value, 2),
              "stressed_usd": round(stressed, 2),
              "delta_usd": round(stressed - baseline_value, 2),
              "budget_breach": breach,
          })

      baseline_total = sum(_safe_float(r.get("baseline"), 0.0) for r in forecast_rows)
      scenarios.append({
          "name": profile["name"],
          "description": profile["description"],
          "starts_month": profile["starts_month"],
          "stressed_total_usd": round(stressed_total, 2),
          "incremental_risk_usd": round(max(stressed_total - baseline_total, 0.0), 2),
          "peak_monthly_usd": round(peak_monthly, 2),
          "breach_months": breach_count,
          "timeline": timeline,
      })

    scenarios.sort(key=lambda s: s["incremental_risk_usd"], reverse=True)
    worst_case = scenarios[0] if scenarios else None

    return {
        "generated_at": _utcnow().isoformat(),
        "forecast_months": months,
        "severity": severity,
        "baseline_summary": {
            "projected_total_usd": round(sum(_safe_float(r.get("baseline"), 0.0) for r in forecast_rows), 2),
            "average_monthly_usd": round(
                sum(_safe_float(r.get("baseline"), 0.0) for r in forecast_rows) / max(len(forecast_rows), 1),
                2,
            ),
            "budget_monthly_usd": round(budget_monthly, 2) if budget_monthly > 0 else None,
        },
        "scenarios": scenarios,
        "worst_case": {
            "name": worst_case.get("name") if worst_case else None,
            "incremental_risk_usd": worst_case.get("incremental_risk_usd") if worst_case else 0.0,
            "breach_months": worst_case.get("breach_months") if worst_case else 0,
        },
        "hedging_playbook": [
            "Increase commitment coverage for predictable baseline workloads before peak months.",
            "Prioritize rightsizing in high-volatility providers and enforce schedule-based shutdowns.",
            "Apply budget guardrails with owner approval when stress scenario breach count rises.",
        ],
        "genai_context": {
            "prompt": (
                "Explain stress-test outcomes to finance and engineering audiences. Compare baseline vs. "
                "worst case, call out breach months, and propose a phased mitigation plan with quick wins."
            ),
            "severity": severity,
            "worst_case": worst_case,
        },
    }


# ---------------------------------------------------------------------------
# Public: Analytics
# ---------------------------------------------------------------------------

def build_analytics(params: dict[str, Any]) -> dict[str, Any]:
    """Risk, maturity, waste, commitment, and efficiency analytics."""
    cost_breakdown = params.get("cost_breakdown") or {}
    providers = _provider_inputs(cost_breakdown)
    current_monthly = _safe_float(params.get("current_monthly_spend"), sum(providers.values()))
    prior_monthly = _safe_float(params.get("prior_monthly_spend"), 0.0)
    anomalies = int(params.get("anomalies", 0) or 0)
    recommendation_savings = _safe_float(
        params.get("monthly_savings"), current_monthly * 0.12
    )
    budget_monthly = _safe_float(params.get("budget_monthly"))

    provider_findings = []
    weighted_waste = weighted_commitment = 0.0
    provider_signals = []
    total_estimated_waste = 0.0

    for provider, cost in providers.items():
        profile = PROVIDER_PROFILES.get(provider, PROVIDER_PROFILES["aws"])
        weight = cost / current_monthly if current_monthly else 0.0
        waste = cost * profile["waste"]
        total_estimated_waste += waste
        weighted_waste += profile["waste"] * weight
        weighted_commitment += profile["commitment"] * weight

        # Per-provider commitment opportunity: potential savings from increasing to run-level (0.70)
        commitment_gap = max(0.0, 0.70 - profile["commitment"])
        avg_discount = 0.35  # representative blended discount for committed use
        commitment_savings_opportunity = cost * commitment_gap * avg_discount

        provider_findings.append({
            "provider": provider,
            "monthly_cost_usd": round(cost, 2),
            "estimated_waste_usd": round(waste, 2),
            "commitment_coverage_percent": round(profile["commitment"] * 100, 1),
            "volatility_score": round(profile["volatility"] * 100, 1),
            "commitment_savings_opportunity_usd": round(commitment_savings_opportunity, 2),
            "waste_rate_percent": round(profile["waste"] * 100, 1),
        })
        provider_signals.append({
            "provider": provider,
            "signal": "low-commitment" if profile["commitment"] < 0.4 else "stable",
            "message": (
                "Increase commitments/Savings Plans coverage for steady workloads"
                if profile["commitment"] < 0.4
                else "Commitment coverage looks healthy"
            ),
        })

    risk_score = min(
        100,
        round((weighted_waste * 160) + anomalies * 8 + (1 - weighted_commitment) * 35, 1),
    )
    maturity_score = max(0, round(100 - risk_score + min(weighted_commitment * 20, 10), 1))

    # Cost velocity
    mom_change_pct = None
    if prior_monthly > 0:
        mom_change_pct = round((current_monthly - prior_monthly) / prior_monthly * 100, 2)

    efficiency_delta = (recommendation_savings / current_monthly) * 100 if current_monthly else 0.0
    budget_utilization_percent = (current_monthly / budget_monthly) * 100 if budget_monthly > 0 else 0.0
    spend_at_risk_usd = max(current_monthly - budget_monthly, 0.0) if budget_monthly > 0 else 0.0
    optimization_capacity_usd = max(
        (current_monthly * weighted_waste) - recommendation_savings, 0.0
    )

    # Anomaly density and z-score proxy
    anomaly_density = (anomalies / max(current_monthly, 1)) * 10000
    anomaly_severity_flag = (
        "high" if anomaly_density > 15
        else "medium" if anomaly_density > 7
        else "low"
    )

    # Break-even on balanced scenario (how many months to recover implementation cost)
    balanced_monthly_savings = current_monthly * 0.18
    break_even_months = None
    if balanced_monthly_savings > 0:
        implementation_cost_estimate = current_monthly * 0.05  # ~1 week of eng time
        break_even_months = round(implementation_cost_estimate / balanced_monthly_savings, 1)

    return {
        "generated_at": _utcnow().isoformat(),
        "current_monthly_spend_usd": round(current_monthly, 2),
        "prior_monthly_spend_usd": round(prior_monthly, 2) if prior_monthly > 0 else None,
        "mom_change_percent": mom_change_pct,
        "estimated_monthly_waste_usd": round(current_monthly * weighted_waste, 2),
        "total_provider_waste_usd": round(total_estimated_waste, 2),
        "identified_monthly_savings_usd": round(recommendation_savings, 2),
        "risk_score": risk_score,
        "maturity_score": maturity_score,
        "commitment_coverage_percent": round(weighted_commitment * 100, 1),
        "anomaly_severity_flag": anomaly_severity_flag,
        "break_even_months_balanced": break_even_months,
        "unit_metrics": {
            "estimated_waste_rate_percent": round(weighted_waste * 100, 1),
            "savings_to_spend_percent": round(efficiency_delta, 1),
            "anomaly_density_per_10k": round(anomaly_density, 2),
            "budget_utilization_percent": round(budget_utilization_percent, 1),
        },
        "spend_at_risk_usd": round(spend_at_risk_usd, 2),
        "optimization_capacity_usd": round(optimization_capacity_usd, 2),
        "provider_findings": provider_findings,
        "provider_signals": provider_signals,
        "actions": [
            "Prioritize high-spend providers with low commitment coverage.",
            "Use balanced scenario as the default executive forecast.",
            "Run cost attribution analysis to identify top spending services.",
            "Use GenAI advisor to produce stakeholder-specific optimization narratives.",
        ],
        "genai_advice_prompt": (
            "Summarize savings opportunities, call out budget pressure and spend at risk, "
            "explain MoM velocity trend, and describe the fan chart bands using p10/p50/p90 "
            "in plain language without altering the numeric values."
        ),
    }


# ---------------------------------------------------------------------------
# Public: Cost Attribution (Pareto analysis)
# ---------------------------------------------------------------------------

def build_cost_attribution(params: dict[str, Any]) -> dict[str, Any]:
    """Pareto cost driver attribution — which providers/services drive 80% of spend.

    Returns concentration metrics, provider rank, and a Pareto efficiency score.
    If service-level breakdown is provided (service_breakdown dict), includes
    cross-provider service analysis.
    """
    cost_breakdown = params.get("cost_breakdown") or {}
    providers = _provider_inputs(cost_breakdown)
    service_breakdown = params.get("service_breakdown") or {}
    current_monthly = _safe_float(params.get("current_monthly_spend"), sum(providers.values()))

    if current_monthly <= 0:
        current_monthly = sum(providers.values()) or 1.0

    # Provider rank by spend
    sorted_providers = sorted(providers.items(), key=lambda x: x[1], reverse=True)
    provider_attribution = []
    cumulative = 0.0
    pareto_cutoff = None

    for rank, (provider, cost) in enumerate(sorted_providers, 1):
        pct = (cost / current_monthly) * 100
        cumulative += pct
        provider_attribution.append({
            "rank": rank,
            "provider": provider,
            "monthly_cost_usd": round(cost, 2),
            "cost_percent": round(pct, 2),
            "cumulative_percent": round(cumulative, 2),
        })
        if pareto_cutoff is None and cumulative >= 80.0:
            pareto_cutoff = rank

    # HHI (Herfindahl-Hirschman Index) — 0 = perfectly distributed, 1 = single provider
    hhi = sum((cost / current_monthly) ** 2 for cost in providers.values()) if providers else 0.0
    concentration_level = (
        "high" if hhi > 0.70
        else "moderate" if hhi > 0.40
        else "low"
    )

    # Service attribution (if provided)
    service_attribution = []
    if service_breakdown:
        all_services: list[tuple[str, float]] = []
        for provider, services in service_breakdown.items():
            if isinstance(services, dict):
                for svc, cost in services.items():
                    all_services.append((f"{provider}/{svc}", _safe_float(cost)))
        all_services.sort(key=lambda x: x[1], reverse=True)
        svc_total = sum(c for _, c in all_services) or 1.0
        svc_cumulative = 0.0
        svc_pareto_cutoff = None
        for svc_rank, (svc_name, svc_cost) in enumerate(all_services[:20], 1):
            svc_pct = (svc_cost / svc_total) * 100
            svc_cumulative += svc_pct
            service_attribution.append({
                "rank": svc_rank,
                "service": svc_name,
                "monthly_cost_usd": round(svc_cost, 2),
                "cost_percent": round(svc_pct, 2),
                "cumulative_percent": round(svc_cumulative, 2),
            })
            if svc_pareto_cutoff is None and svc_cumulative >= 80.0:
                svc_pareto_cutoff = svc_rank

    # Pareto efficiency score: how concentrated is the spend vs. ideal diversification
    # A score of 100 = perfectly even spread; lower = more concentrated risk
    ideal_weight = 1.0 / max(len(providers), 1)
    pareto_efficiency_score = max(
        0, round(100 - (hhi - ideal_weight ** 2) / max(1 - ideal_weight ** 2, 0.01) * 100, 1)
    )

    return {
        "generated_at": _utcnow().isoformat(),
        "current_monthly_spend_usd": round(current_monthly, 2),
        "provider_count": len(providers),
        "hhi": round(hhi, 4),
        "concentration_level": concentration_level,
        "pareto_provider_cutoff": pareto_cutoff,
        "pareto_efficiency_score": pareto_efficiency_score,
        "provider_attribution": provider_attribution,
        "service_attribution": service_attribution,
        "genai_context": {
            "prompt": (
                "Describe the cost concentration risk. Highlight which providers are driving "
                "80% of spend (Pareto cutoff), whether HHI indicates single-provider lock-in "
                "risk, and recommend diversification or commitment strategies."
            ),
        },
    }


# ---------------------------------------------------------------------------
# Public: Commitment Optimization (RI/Savings Plan ROI)
# ---------------------------------------------------------------------------

def build_commitment_optimization(params: dict[str, Any]) -> dict[str, Any]:
    """Model the ROI of increasing reserved instance / Savings Plan coverage.

    Returns per-provider optimization opportunities across coverage tiers
    (50%, 65%, 80%) with projected annual savings and payback periods.
    """
    cost_breakdown = params.get("cost_breakdown") or {}
    providers = _provider_inputs(cost_breakdown)
    current_monthly = _safe_float(params.get("current_monthly_spend"), sum(providers.values()))

    opportunities = []
    total_annual_savings_potential = 0.0

    for provider, cost in providers.items():
        profile = PROVIDER_PROFILES.get(provider, PROVIDER_PROFILES["aws"])
        current_coverage = profile["commitment"]
        discount_tiers = COMMITMENT_DISCOUNT_RATES.get(provider, {"1yr": 0.22, "3yr": 0.38})

        # Best available 1yr discount
        best_1yr = max(
            v for k, v in discount_tiers.items() if "1" in k
        ) if any("1" in k for k in discount_tiers) else list(discount_tiers.values())[0]
        best_3yr = max(
            v for k, v in discount_tiers.items() if "3" in k
        ) if any("3" in k for k in discount_tiers) else best_1yr * 1.4

        tiers = []
        for target_coverage, label in [(0.50, "50%"), (0.65, "65%"), (0.80, "80%")]:
            incremental_coverage = max(0.0, target_coverage - current_coverage)
            committable_spend = cost * incremental_coverage
            if committable_spend <= 0:
                continue
            annual_savings_1yr = committable_spend * best_1yr * 12
            annual_savings_3yr = committable_spend * best_3yr * 12
            upfront_estimate_1yr = committable_spend * 12 * (1 - best_1yr) * 0.4  # ~40% partial upfront
            payback_months_1yr = (
                round(upfront_estimate_1yr / (annual_savings_1yr / 12), 1)
                if annual_savings_1yr > 0
                else None
            )
            total_annual_savings_potential += annual_savings_1yr
            tiers.append({
                "target_coverage_percent": round(target_coverage * 100, 0),
                "incremental_coverage_percent": round(incremental_coverage * 100, 1),
                "committable_monthly_spend_usd": round(committable_spend, 2),
                "annual_savings_1yr_usd": round(annual_savings_1yr, 2),
                "annual_savings_3yr_usd": round(annual_savings_3yr, 2),
                "upfront_estimate_1yr_usd": round(upfront_estimate_1yr, 2),
                "payback_months_1yr": payback_months_1yr,
            })

        if tiers:
            opportunities.append({
                "provider": provider,
                "current_coverage_percent": round(current_coverage * 100, 1),
                "monthly_cost_usd": round(cost, 2),
                "tiers": tiers,
            })

    # Rank opportunities by annual savings potential (highest first)
    opportunities.sort(
        key=lambda x: max((t["annual_savings_1yr_usd"] for t in x["tiers"]), default=0),
        reverse=True,
    )

    return {
        "generated_at": _utcnow().isoformat(),
        "total_annual_savings_potential_usd": round(total_annual_savings_potential, 2),
        "total_monthly_savings_potential_usd": round(total_annual_savings_potential / 12, 2),
        "opportunities": opportunities,
        "recommendation": (
            "Start with the provider offering the highest annual savings at the 65% coverage tier. "
            "Partial-upfront 1-year commitments offer the best balance of savings and flexibility."
        ),
        "genai_context": {
            "prompt": (
                "Summarize the commitment optimization opportunities in plain language. "
                "Recommend which provider to start with, what coverage tier to target first, "
                "and explain the payback period in business terms."
            ),
        },
    }


# ---------------------------------------------------------------------------
# Public: FinOps Maturity Assessment (CRAWL / WALK / RUN / OPTIMIZE)
# ---------------------------------------------------------------------------

def build_maturity_assessment(params: dict[str, Any]) -> dict[str, Any]:
    """Map current FinOps metrics to the Cloud Financial Management maturity model.

    Dimensions assessed:
      - Cost visibility      (data completeness, provider coverage)
      - Waste reduction      (waste rate vs. benchmarks)
      - Commitment coverage  (RI/SP coverage vs. benchmarks)
      - Anomaly detection    (anomaly density and response capability)
      - Forecasting quality  (history depth, backtesting MAPE)
      - Automation level     (scheduler enabled, auto-remediation)
    """
    cost_breakdown = params.get("cost_breakdown") or {}
    providers = _provider_inputs(cost_breakdown)
    current_monthly = _safe_float(params.get("current_monthly_spend"), sum(providers.values()))
    anomalies_count = int(params.get("anomalies", 0) or 0)
    history_months = int(params.get("history_coverage_months", 0) or 0)
    backtesting_mape = params.get("backtesting_mape_percent")
    scheduler_enabled = bool(params.get("scheduler_enabled", False))
    auto_remediate = bool(params.get("auto_remediate", False))
    recommendation_savings = _safe_float(params.get("monthly_savings"))
    waste_rate = _safe_float(params.get("waste_rate_percent"))
    commitment_coverage = _safe_float(params.get("commitment_coverage_percent"))

    # Derive metrics from provider profiles if not provided directly
    if waste_rate == 0 and providers and current_monthly > 0:
        _, _, wc, _ = _weighted_provider_metrics(providers, current_monthly)
        profile_avg_waste = sum(
            PROVIDER_PROFILES.get(p, PROVIDER_PROFILES["aws"])["waste"]
            for p in providers
        ) / max(len(providers), 1)
        waste_rate = profile_avg_waste * 100
        if commitment_coverage == 0:
            commitment_coverage = wc * 100

    anomaly_density = (anomalies_count / max(current_monthly, 1)) * 10000

    # Score each dimension 0-100
    def _level_to_score(value: float, thresholds: list[float], higher_is_better: bool = True) -> int:
        if higher_is_better:
            if value >= thresholds[3]:
                return 90
            elif value >= thresholds[2]:
                return 70
            elif value >= thresholds[1]:
                return 50
            elif value >= thresholds[0]:
                return 30
            return 10
        else:
            if value <= thresholds[0]:
                return 90
            elif value <= thresholds[1]:
                return 70
            elif value <= thresholds[2]:
                return 50
            elif value <= thresholds[3]:
                return 30
            return 10

    visibility_score = _level_to_score(len(providers), [1, 2, 3, 4], higher_is_better=True)
    if history_months >= 12:
        visibility_score = min(100, visibility_score + 15)

    waste_score = _level_to_score(waste_rate, [25.0, 18.0, 12.0, 6.0], higher_is_better=False)
    commitment_score = _level_to_score(commitment_coverage, [25.0, 40.0, 55.0, 70.0], higher_is_better=True)
    anomaly_score = _level_to_score(anomaly_density, [20.0, 10.0, 5.0, 2.0], higher_is_better=False)

    forecasting_score = 30
    if history_months >= 6:
        forecasting_score = 50
    if history_months >= 12:
        forecasting_score = 70
    if backtesting_mape is not None and backtesting_mape < 15:
        forecasting_score = min(100, forecasting_score + 20)

    automation_score = 20
    if scheduler_enabled:
        automation_score += 40
    if auto_remediate:
        automation_score += 40

    # Savings capture rate
    savings_capture_score = 30
    if current_monthly > 0 and recommendation_savings > 0:
        capture_rate = (recommendation_savings / current_monthly) * 100
        if capture_rate >= 15:
            savings_capture_score = 90
        elif capture_rate >= 10:
            savings_capture_score = 70
        elif capture_rate >= 5:
            savings_capture_score = 50

    dimensions = [
        {"dimension": "Cost Visibility",     "score": visibility_score,      "weight": 0.20},
        {"dimension": "Waste Reduction",      "score": waste_score,           "weight": 0.20},
        {"dimension": "Commitment Coverage",  "score": commitment_score,      "weight": 0.20},
        {"dimension": "Anomaly Detection",    "score": anomaly_score,         "weight": 0.15},
        {"dimension": "Forecasting Quality",  "score": forecasting_score,     "weight": 0.15},
        {"dimension": "Automation Level",     "score": automation_score,      "weight": 0.05},
        {"dimension": "Savings Capture Rate", "score": savings_capture_score, "weight": 0.05},
    ]

    overall_score = round(
        sum(d["score"] * d["weight"] for d in dimensions), 1
    )

    if overall_score >= 80:
        maturity_level = "optimize"
        maturity_label = "Optimize"
    elif overall_score >= 60:
        maturity_level = "run"
        maturity_label = "Run"
    elif overall_score >= 40:
        maturity_level = "walk"
        maturity_label = "Walk"
    else:
        maturity_level = "crawl"
        maturity_label = "Crawl"

    # Find the biggest gap dimensions (lowest-scoring)
    sorted_dims = sorted(dimensions, key=lambda d: d["score"])
    priority_actions = [
        f"Improve {d['dimension']} (current score: {d['score']}/100)"
        for d in sorted_dims[:3]
    ]

    return {
        "generated_at": _utcnow().isoformat(),
        "overall_score": overall_score,
        "maturity_level": maturity_level,
        "maturity_label": maturity_label,
        "dimensions": [
            {**d, "benchmark": MATURITY_THRESHOLDS.get(maturity_level, {})}
            for d in dimensions
        ],
        "priority_actions": priority_actions,
        "next_level": {
            "crawl": "walk",
            "walk": "run",
            "run": "optimize",
            "optimize": None,
        }.get(maturity_level),
        "genai_context": {
            "prompt": (
                "Explain the FinOps maturity assessment in plain language. "
                "Focus on the lowest-scoring dimensions, what they mean in practice, "
                "and give 2-3 specific, actionable steps to advance to the next maturity level."
            ),
            "maturity_level": maturity_label,
            "overall_score": overall_score,
            "priority_dimensions": [d["dimension"] for d in sorted_dims[:3]],
        },
    }


# ---------------------------------------------------------------------------
# Public: Anomaly Scoring (z-score severity ranking)
# ---------------------------------------------------------------------------

def build_anomaly_scores(params: dict[str, Any]) -> dict[str, Any]:
    """Z-score based severity ranking of cost anomalies.

    Accepts a list of anomaly dicts with `service`, `provider`, `change_usd` or `change_percent`,
    and `current_cost_usd`. Returns ranked anomalies with severity scores and financial impact.
    """
    raw_anomalies = params.get("anomalies") or []
    current_monthly = _safe_float(params.get("current_monthly_spend"), 1.0)

    scored = []
    changes: list[float] = []
    for item in raw_anomalies:
        change = _safe_float(item.get("change_usd") or item.get("cost_delta_usd"), 0.0)
        change_pct = _safe_float(item.get("change_percent") or item.get("change", 0.0), 0.0)
        current = _safe_float(item.get("current_cost_usd") or item.get("cost", 0.0), 0.0)
        if change == 0 and change_pct != 0 and current > 0:
            change = current * (change_pct / 100)
        changes.append(abs(change))
        scored.append({
            "service": item.get("service", "unknown"),
            "provider": item.get("cloud") or item.get("provider", "unknown"),
            "change_usd": round(change, 2),
            "change_percent": round(change_pct, 2),
            "current_cost_usd": round(current, 2),
            "_abs_change": abs(change),
        })

    if not changes:
        return {
            "generated_at": _utcnow().isoformat(),
            "anomaly_count": 0,
            "total_financial_impact_usd": 0.0,
            "anomalies": [],
        }

    mean_change = sum(changes) / len(changes)
    variance = sum((c - mean_change) ** 2 for c in changes) / max(len(changes) - 1, 1)
    stddev = math.sqrt(variance) or 1.0

    result_anomalies = []
    for item in scored:
        abs_change = item.pop("_abs_change")
        z = (abs_change - mean_change) / stddev
        impact_pct = (abs_change / max(current_monthly, 1)) * 100
        severity = (
            "critical" if z >= 3.0 or impact_pct >= 20
            else "high" if z >= 2.0 or impact_pct >= 10
            else "medium" if z >= 1.0 or impact_pct >= 5
            else "low"
        )
        result_anomalies.append({
            **item,
            "z_score": round(z, 2),
            "impact_percent_of_monthly": round(impact_pct, 2),
            "severity": severity,
        })

    result_anomalies.sort(key=lambda x: x["z_score"], reverse=True)
    total_impact = sum(abs(a["change_usd"]) for a in result_anomalies)

    return {
        "generated_at": _utcnow().isoformat(),
        "anomaly_count": len(result_anomalies),
        "total_financial_impact_usd": round(total_impact, 2),
        "critical_count": sum(1 for a in result_anomalies if a["severity"] == "critical"),
        "high_count": sum(1 for a in result_anomalies if a["severity"] == "high"),
        "anomalies": result_anomalies,
        "genai_context": {
            "prompt": (
                "Explain the top anomalies in plain language. For each critical or high severity "
                "anomaly, describe likely root causes and immediate actions to investigate. "
                "Quantify the total financial impact in context of overall monthly spend."
            ),
        },
    }


# ---------------------------------------------------------------------------
# Public: Unit Economics
# ---------------------------------------------------------------------------

def build_unit_economics(params: dict[str, Any]) -> dict[str, Any]:
    """Unit cost trends and efficiency ratios.

    Computes cost-per-unit metrics when resource counts are provided,
    and efficiency ratios (waste-per-dollar, savings-per-dollar) from existing analytics.
    """
    current_monthly = _safe_float(params.get("current_monthly_spend"))
    prior_monthly = _safe_float(params.get("prior_monthly_spend"))
    resource_count = int(params.get("resource_count", 0) or 0)
    prior_resource_count = int(params.get("prior_resource_count", 0) or 0)
    waste_usd = _safe_float(params.get("estimated_waste_usd"))
    savings_usd = _safe_float(params.get("identified_savings_usd"))
    anomalies_count = int(params.get("anomalies", 0) or 0)

    cost_per_resource = None
    prior_cost_per_resource = None
    unit_cost_change_pct = None

    if resource_count > 0 and current_monthly > 0:
        cost_per_resource = round(current_monthly / resource_count, 4)
    if prior_resource_count > 0 and prior_monthly > 0:
        prior_cost_per_resource = round(prior_monthly / prior_resource_count, 4)
    if cost_per_resource and prior_cost_per_resource and prior_cost_per_resource > 0:
        unit_cost_change_pct = round(
            (cost_per_resource - prior_cost_per_resource) / prior_cost_per_resource * 100, 2
        )

    # Efficiency ratios
    waste_to_spend_ratio = round(waste_usd / max(current_monthly, 1), 4) if waste_usd else None
    savings_to_spend_ratio = round(savings_usd / max(current_monthly, 1), 4) if savings_usd else None
    anomaly_to_spend_density = round((anomalies_count / max(current_monthly, 1)) * 10000, 4)

    # Dollar efficiency score: 100 = zero waste, zero anomaly density
    dollar_efficiency_score = None
    if waste_to_spend_ratio is not None:
        dollar_efficiency_score = max(0, round(100 - (waste_to_spend_ratio * 100) * 2, 1))

    # Trend label
    trend_label = None
    if unit_cost_change_pct is not None:
        if unit_cost_change_pct > 5:
            trend_label = "deteriorating"
        elif unit_cost_change_pct < -5:
            trend_label = "improving"
        else:
            trend_label = "stable"

    return {
        "generated_at": _utcnow().isoformat(),
        "current_monthly_spend_usd": round(current_monthly, 2),
        "resource_count": resource_count,
        "cost_per_resource_usd": cost_per_resource,
        "prior_cost_per_resource_usd": prior_cost_per_resource,
        "unit_cost_change_percent": unit_cost_change_pct,
        "unit_cost_trend": trend_label,
        "waste_to_spend_ratio": waste_to_spend_ratio,
        "savings_to_spend_ratio": savings_to_spend_ratio,
        "anomaly_density_per_10k_usd": anomaly_to_spend_density,
        "dollar_efficiency_score": dollar_efficiency_score,
        "genai_context": {
            "prompt": (
                "Summarize the unit economics in plain language. Highlight whether cost-per-resource "
                "is trending up or down, explain what the waste-to-spend ratio means in practice, "
                "and recommend what to focus on to improve dollar efficiency."
            ),
        },
    }


# ---------------------------------------------------------------------------
# Public: Cloud Waste Analysis (idle, oversized, unattached, zombie)
# ---------------------------------------------------------------------------

# Waste category profiles: (waste_rate_floor, waste_rate_ceiling, effort)
_WASTE_CATEGORIES: dict[str, dict[str, Any]] = {
    "idle_resources": {
        "description": "Resources running with <5% utilisation over the past 30 days",
        "default_rate": 0.08,
        "remediation": "Schedule shutdowns, implement auto-stop policies",
        "effort": "low",
        "typical_savings_range": (0.06, 0.12),
    },
    "oversized_instances": {
        "description": "Instances where CPU/memory usage is consistently below 40%",
        "default_rate": 0.06,
        "remediation": "Rightsize to next smaller SKU; adopt Graviton/Ampere compute",
        "effort": "medium",
        "typical_savings_range": (0.04, 0.10),
    },
    "unattached_storage": {
        "description": "Volumes, snapshots, and buckets with no recent access",
        "default_rate": 0.04,
        "remediation": "Delete unattached volumes; apply lifecycle rules to object storage",
        "effort": "low",
        "typical_savings_range": (0.02, 0.06),
    },
    "zombie_resources": {
        "description": "Orphaned load balancers, elastic IPs, NAT gateways without traffic",
        "default_rate": 0.03,
        "remediation": "Audit and remove unused networking primitives via IaC drift detection",
        "effort": "medium",
        "typical_savings_range": (0.02, 0.05),
    },
    "dev_test_overrun": {
        "description": "Non-production workloads running 24×7 when only needed during business hours",
        "default_rate": 0.05,
        "remediation": "Implement schedule-based shutdown for dev/test environments",
        "effort": "low",
        "typical_savings_range": (0.04, 0.08),
    },
    "data_transfer_tax": {
        "description": "Cross-region and egress charges from suboptimal data placement",
        "default_rate": 0.02,
        "remediation": "Co-locate data producers and consumers; use CDN for cacheable payloads",
        "effort": "high",
        "typical_savings_range": (0.01, 0.04),
    },
}

_PROVIDER_WASTE_MODIFIERS: dict[str, dict[str, float]] = {
    "aws":   {"idle_resources": 1.10, "oversized_instances": 1.05, "data_transfer_tax": 1.20},
    "azure": {"idle_resources": 0.95, "oversized_instances": 1.00, "dev_test_overrun": 1.10},
    "gcp":   {"zombie_resources": 0.90, "data_transfer_tax": 0.95},
    "oci":   {"idle_resources": 0.85, "unattached_storage": 0.90},
}


def build_cloud_waste_analysis(params: dict[str, Any]) -> dict[str, Any]:
    """Categorise cloud waste into actionable buckets with savings estimates."""
    cost_breakdown = params.get("cost_breakdown") or {}
    providers = _provider_inputs(cost_breakdown)
    current_monthly = _safe_float(params.get("current_monthly_spend"), sum(providers.values()))
    if current_monthly <= 0:
        current_monthly = sum(providers.values()) or 1.0

    # Blend per-provider waste modifiers weighted by spend share
    combined_modifiers: dict[str, float] = {cat: 1.0 for cat in _WASTE_CATEGORIES}
    for provider, cost in providers.items():
        weight = cost / max(current_monthly, 1)
        for cat, modifier in _PROVIDER_WASTE_MODIFIERS.get(provider, {}).items():
            combined_modifiers[cat] = combined_modifiers.get(cat, 1.0) + (modifier - 1.0) * weight

    categories = []
    total_waste_usd = 0.0
    total_savings_potential_usd = 0.0

    for cat_name, cat in _WASTE_CATEGORIES.items():
        effective_rate = cat["default_rate"] * combined_modifiers.get(cat_name, 1.0)
        waste_usd = round(current_monthly * effective_rate, 2)
        low_savings = round(current_monthly * cat["typical_savings_range"][0], 2)
        high_savings = round(current_monthly * cat["typical_savings_range"][1], 2)
        total_waste_usd += waste_usd
        total_savings_potential_usd += low_savings
        effort_cost = {"low": 1, "medium": 2, "high": 4}[cat["effort"]]
        priority_score = round(low_savings / max(effort_cost, 1), 2)

        categories.append({
            "category": cat_name,
            "description": cat["description"],
            "estimated_waste_usd": waste_usd,
            "estimated_waste_rate_percent": round(effective_rate * 100, 1),
            "savings_range_usd": {"low": low_savings, "high": high_savings},
            "remediation": cat["remediation"],
            "effort": cat["effort"],
            "priority_score": priority_score,
        })

    categories.sort(key=lambda c: -c["priority_score"])
    quick_wins = [c for c in categories if c["effort"] == "low"][:3]
    total_waste_rate = round(total_waste_usd / max(current_monthly, 1) * 100, 1)

    return {
        "generated_at": _utcnow().isoformat(),
        "current_monthly_spend_usd": round(current_monthly, 2),
        "total_estimated_waste_usd": round(total_waste_usd, 2),
        "total_waste_rate_percent": total_waste_rate,
        "total_savings_potential_usd": round(total_savings_potential_usd, 2),
        "waste_grade": (
            "A" if total_waste_rate < 8 else
            "B" if total_waste_rate < 15 else
            "C" if total_waste_rate < 22 else "D"
        ),
        "categories": categories,
        "quick_wins": quick_wins,
        "genai_context": {
            "prompt": (
                "Explain the cloud waste analysis to a finance stakeholder. Lead with total waste "
                "cost and grade, describe the top 2 categories, and give next steps for quick wins. "
                "Keep it under 150 words."
            ),
            "total_waste_usd": round(total_waste_usd, 2),
            "top_categories": [c["category"] for c in categories[:3]],
            "quick_wins": [c["category"] for c in quick_wins],
        },
    }


# ---------------------------------------------------------------------------
# Public: Cost Efficiency Score (composite KPI)
# ---------------------------------------------------------------------------

def build_cost_efficiency_score(params: dict[str, Any]) -> dict[str, Any]:
    """Composite FinOps efficiency score (0–100) across 6 weighted dimensions."""
    cost_breakdown = params.get("cost_breakdown") or {}
    providers = _provider_inputs(cost_breakdown)
    current_monthly = _safe_float(params.get("current_monthly_spend"), sum(providers.values()))

    # Commitment dimension
    if providers and current_monthly > 0:
        weighted_commitment = sum(
            PROVIDER_PROFILES.get(p, PROVIDER_PROFILES["aws"])["commitment"] * (c / current_monthly)
            for p, c in providers.items()
        )
    else:
        weighted_commitment = 0.35
    commitment_score = min(100.0, round(weighted_commitment / 0.70 * 100, 1))

    # Waste dimension (default 18% if not supplied)
    waste_rate = _safe_float(params.get("waste_rate_percent"), 18.0) / 100.0
    waste_score = max(0.0, round((1.0 - waste_rate / 0.30) * 100, 1))

    # Tagging dimension (default 55% coverage if not supplied)
    tagging_pct = _safe_float(params.get("tagging_coverage_percent"), 55.0)
    tagging_score = round(min(tagging_pct / 90.0, 1.0) * 100, 1)

    # Anomaly control (default 8 anomalies per $10k)
    anomaly_density = _safe_float(params.get("anomaly_density_per_10k"), 8.0)
    anomaly_score = max(0.0, round((1.0 - anomaly_density / 20.0) * 100, 1))

    # Budget adherence (85–100% = perfect score)
    budget_utilization = _safe_float(params.get("budget_utilization_percent"), 85.0)
    if 85.0 <= budget_utilization <= 100.0:
        budget_score = 100.0
    elif budget_utilization > 100.0:
        budget_score = max(0.0, round(100.0 - (budget_utilization - 100.0) * 3.0, 1))
    else:
        budget_score = round(budget_utilization / 85.0 * 100.0, 1)

    # Forecast accuracy (default 15% MAPE)
    mape = _safe_float(params.get("forecast_mape_percent"), 15.0)
    forecast_score = max(0.0, round((1.0 - mape / 40.0) * 100, 1))

    dimension_scores: dict[str, dict[str, Any]] = {
        "commitment_coverage": {"score": commitment_score, "weight": 0.25, "benchmark": 70.0, "current": round(weighted_commitment * 100, 1), "unit": "%"},
        "waste_efficiency":    {"score": waste_score,      "weight": 0.25, "benchmark": 8.0,  "current": round(waste_rate * 100, 1), "unit": "% waste", "lower_is_better": True},
        "tagging_coverage":    {"score": tagging_score,    "weight": 0.15, "benchmark": 90.0, "current": tagging_pct, "unit": "%"},
        "anomaly_control":     {"score": anomaly_score,    "weight": 0.15, "benchmark": 2.0,  "current": anomaly_density, "unit": "/10k USD", "lower_is_better": True},
        "budget_adherence":    {"score": budget_score,     "weight": 0.10, "benchmark": 95.0, "current": budget_utilization, "unit": "%"},
        "forecast_accuracy":   {"score": forecast_score,   "weight": 0.10, "benchmark": 10.0, "current": mape, "unit": "% MAPE", "lower_is_better": True},
    }

    overall_score = round(
        sum(d["score"] * d["weight"] for d in dimension_scores.values()), 1
    )
    grade = (
        "A+" if overall_score >= 90 else
        "A"  if overall_score >= 80 else
        "B"  if overall_score >= 70 else
        "C"  if overall_score >= 55 else "D"
    )
    sorted_dims = sorted(dimension_scores.items(), key=lambda x: x[1]["score"])
    improvement_focus = [name for name, _ in sorted_dims[:3]]

    return {
        "generated_at": _utcnow().isoformat(),
        "overall_score": overall_score,
        "grade": grade,
        "dimensions": {
            name: {k: v for k, v in d.items() if k != "weight"}
            for name, d in dimension_scores.items()
        },
        "improvement_focus": improvement_focus,
        "interpretation": (
            f"Cloud cost efficiency graded {grade} ({overall_score}/100). "
            + (
                "Excellent — top-tier FinOps performance."
                if overall_score >= 85 else
                "Good progress — address the flagged dimensions to reach top tier."
                if overall_score >= 70 else
                "Room for improvement — prioritise waste reduction and commitment coverage."
                if overall_score >= 55 else
                "Significant optimisation opportunity — start with commitment coverage and waste."
            )
        ),
        "genai_context": {
            "prompt": (
                "Explain the FinOps efficiency score to a CTO. Cover the grade, identify the two "
                "biggest gaps, and recommend what to prioritise first for the most impact. Under 120 words."
            ),
            "overall_score": overall_score,
            "grade": grade,
            "weakest_dimensions": improvement_focus[:2],
        },
    }


# ---------------------------------------------------------------------------
# Public: Commitment Gap Analysis
# ---------------------------------------------------------------------------

_COMMITMENT_TARGETS: dict[str, dict[str, Any]] = {
    "aws":   {"target": 0.70, "instrument": "Savings Plans + Reserved Instances"},
    "azure": {"target": 0.65, "instrument": "Reserved VM Instances + Savings Plans"},
    "gcp":   {"target": 0.60, "instrument": "Committed Use Discounts"},
    "oci":   {"target": 0.55, "instrument": "Universal Credits"},
}


def build_commitment_gap_analysis(params: dict[str, Any]) -> dict[str, Any]:
    """Per-provider commitment coverage gap with savings scenarios and breakeven."""
    cost_breakdown = params.get("cost_breakdown") or {}
    providers = _provider_inputs(cost_breakdown)
    current_monthly = _safe_float(params.get("current_monthly_spend"), sum(providers.values()))

    provider_gaps = []
    total_gap_savings_monthly = 0.0

    for provider, cost in providers.items():
        profile = PROVIDER_PROFILES.get(provider, PROVIDER_PROFILES["aws"])
        rates = COMMITMENT_DISCOUNT_RATES.get(provider, {"1yr": 0.20, "3yr": 0.35})
        target_meta = _COMMITMENT_TARGETS.get(provider, {"target": 0.60, "instrument": "Committed Use"})

        current_coverage = profile["commitment"]
        target_coverage = target_meta["target"]
        gap = max(0.0, target_coverage - current_coverage)
        committable_spend = cost * gap

        rate_1yr = rates.get("1yr_partial", rates.get("1yr", 0.22))
        savings_1yr_monthly = committable_spend * rate_1yr
        upfront_1yr = committable_spend * 12 * rate_1yr * 0.30
        breakeven_1yr = (
            round(upfront_1yr / max(savings_1yr_monthly, 0.01), 1)
            if savings_1yr_monthly > 0 else None
        )

        rate_3yr = rates.get("3yr_partial", rates.get("3yr", 0.38))
        savings_3yr_monthly = committable_spend * rate_3yr
        total_gap_savings_monthly += savings_1yr_monthly

        provider_gaps.append({
            "provider": provider,
            "monthly_cost_usd": round(cost, 2),
            "current_commitment_percent": round(current_coverage * 100, 1),
            "target_commitment_percent": round(target_coverage * 100, 1),
            "gap_percent": round(gap * 100, 1),
            "committable_spend_usd": round(committable_spend, 2),
            "commitment_instrument": target_meta["instrument"],
            "scenarios": {
                "1_year": {
                    "discount_rate_percent": round(rate_1yr * 100, 1),
                    "monthly_savings_usd": round(savings_1yr_monthly, 2),
                    "annual_savings_usd": round(savings_1yr_monthly * 12, 2),
                    "breakeven_months": breakeven_1yr,
                },
                "3_year": {
                    "discount_rate_percent": round(rate_3yr * 100, 1),
                    "monthly_savings_usd": round(savings_3yr_monthly, 2),
                    "annual_savings_usd": round(savings_3yr_monthly * 12, 2),
                },
            },
            "recommendation": (
                f"Move {round(gap * 100):.0f}% of {provider.upper()} spend to 1-year commitments "
                f"to save ~${savings_1yr_monthly:,.0f}/month."
                if gap > 0.05 else
                f"{provider.upper()} coverage is near target — maintain and review at renewal."
            ),
        })

    provider_gaps.sort(key=lambda x: -x["scenarios"]["1_year"]["monthly_savings_usd"])
    overall_coverage = round(
        sum(p["current_commitment_percent"] for p in provider_gaps) / max(len(provider_gaps), 1), 1
    )

    return {
        "generated_at": _utcnow().isoformat(),
        "total_monthly_spend_usd": round(current_monthly, 2),
        "overall_current_commitment_percent": overall_coverage,
        "total_gap_savings_monthly_usd": round(total_gap_savings_monthly, 2),
        "total_annual_opportunity_usd": round(total_gap_savings_monthly * 12, 2),
        "provider_gaps": provider_gaps,
        "priority_provider": provider_gaps[0]["provider"] if provider_gaps else None,
        "genai_context": {
            "prompt": (
                "Explain the commitment gap analysis to a VP of Engineering. Lead with annual savings "
                "opportunity, name the top 1-2 providers, and describe the 1-year breakeven timeline. "
                "Under 120 words."
            ),
            "annual_opportunity_usd": round(total_gap_savings_monthly * 12, 2),
            "top_providers": [p["provider"] for p in provider_gaps[:2]],
        },
    }


def build_optimization_portfolio(params: dict[str, Any]) -> dict[str, Any]:
    """Build a prioritized optimization portfolio balancing savings, ROI, and execution risk."""
    recommendation_rows = params.get("recommendations") or []
    current_monthly = _safe_float(params.get("current_monthly_spend"), 0.0)

    portfolio_items: list[dict[str, Any]] = []
    for row in recommendation_rows:
        if not isinstance(row, dict):
            continue
        monthly_savings = _safe_float(row.get("savings_monthly_usd"), 0.0)
        roi_percent = _safe_float(row.get("roi_percent"), 0.0)
        payback = _safe_float(row.get("payback_months"), 12.0)
        effort = str(row.get("effort", "medium") or "medium").lower()
        confidence = str(row.get("confidence", "medium") or "medium").lower()
        effort_penalty = {"low": 0.0, "medium": 8.0, "high": 15.0}.get(effort, 8.0)
        confidence_bonus = {"high": 10.0, "medium": 4.0, "low": -4.0}.get(confidence, 0.0)

        score = (
            (monthly_savings / max(current_monthly, 1.0) * 1000)
            + (roi_percent * 0.18)
            - (payback * 2.0)
            - effort_penalty
            + confidence_bonus
        )

        portfolio_items.append({
            "id": row.get("id") or row.get("recommendation_id") or "unknown",
            "title": row.get("title") or row.get("description") or "Optimization action",
            "service": row.get("service") or row.get("provider") or "unknown",
            "monthly_savings_usd": round(monthly_savings, 2),
            "annual_savings_usd": round(monthly_savings * 12, 2),
            "roi_percent": round(roi_percent, 1),
            "payback_months": round(payback, 1),
            "effort": effort,
            "confidence": confidence,
            "portfolio_score": round(score, 2),
        })

    portfolio_items.sort(key=lambda item: item["portfolio_score"], reverse=True)
    top_quick_wins = [i for i in portfolio_items if i["effort"] == "low"][:5]
    top_strategic = [i for i in portfolio_items if i["effort"] in {"medium", "high"}][:5]
    total_monthly_savings = sum(i["monthly_savings_usd"] for i in portfolio_items)

    return {
        "generated_at": _utcnow().isoformat(),
        "portfolio_count": len(portfolio_items),
        "total_monthly_savings_usd": round(total_monthly_savings, 2),
        "total_annual_savings_usd": round(total_monthly_savings * 12, 2),
        "ranked_actions": portfolio_items[:15],
        "quick_wins": top_quick_wins,
        "strategic_bets": top_strategic,
        "genai_context": {
            "prompt": (
                "Create an execution plan from this optimization portfolio. Separate immediate quick wins "
                "from strategic initiatives, include expected savings impact, and sequence by portfolio_score."
            ),
            "portfolio_count": len(portfolio_items),
            "total_annual_savings_usd": round(total_monthly_savings * 12, 2),
        },
    }


# ---------------------------------------------------------------------------
# Async wrappers (called by api.py endpoints)
# ---------------------------------------------------------------------------

async def get_forecast(params: dict[str, Any]) -> str:
    return json.dumps(build_forecast(params))


async def get_analytics(params: dict[str, Any]) -> str:
    return json.dumps(build_analytics(params))


async def get_cost_attribution(params: dict[str, Any]) -> str:
    return json.dumps(build_cost_attribution(params))


async def get_commitment_optimization(params: dict[str, Any]) -> str:
    return json.dumps(build_commitment_optimization(params))


async def get_maturity_assessment(params: dict[str, Any]) -> str:
    return json.dumps(build_maturity_assessment(params))


async def get_anomaly_scores(params: dict[str, Any]) -> str:
    return json.dumps(build_anomaly_scores(params))


async def get_unit_economics(params: dict[str, Any]) -> str:
    return json.dumps(build_unit_economics(params))


async def get_cloud_waste_analysis(params: dict[str, Any]) -> str:
    return json.dumps(build_cloud_waste_analysis(params))


async def get_cost_efficiency_score(params: dict[str, Any]) -> str:
    return json.dumps(build_cost_efficiency_score(params))


async def get_commitment_gap_analysis(params: dict[str, Any]) -> str:
    return json.dumps(build_commitment_gap_analysis(params))


async def get_optimization_portfolio(params: dict[str, Any]) -> str:
    return json.dumps(build_optimization_portfolio(params))


async def get_forecast_what_if(params: dict[str, Any]) -> str:
    return json.dumps(build_forecast_what_if(params))


async def get_forecast_stress_test(params: dict[str, Any]) -> str:
    return json.dumps(build_forecast_stress_test(params))
