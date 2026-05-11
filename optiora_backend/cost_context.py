"""Helpers for building provider cost context outside the API route module."""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict, Iterable, Optional

SUPPORTED_CONTEXT_PROVIDERS = ("aws", "azure", "gcp", "oci")
COST_SOURCE_PRIORITY = ["live_provider_api", "cost_snapshots_live", "csv_import"]


class LiveDataPolicyError(RuntimeError):
    """Raised when live-provider-only policy cannot be satisfied."""


def _no_data_context(
    *,
    period: str,
    cloud_provider: str,
    provider_errors: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    response: Dict[str, Any] = {
        "period": period,
        "cloud_provider": cloud_provider,
        "total_cost": 0.0,
        "breakdown": {},
        "region_breakdown": [],
        "source": "no_data_available",
        "no_data": True,
        "source_priority": COST_SOURCE_PRIORITY,
    }
    if provider_errors:
        response["provider_errors"] = provider_errors
    return response


async def fetch_provider_cost_summary(
    provider: str,
    period: str,
    *,
    credentials: Optional[Dict[str, Any]] = None,
    fetchers: Dict[str, Callable[[Dict[str, Any]], Awaitable[str]]],
    safe_json_load: Callable[[str, Dict[str, Any]], Dict[str, Any]],
) -> Dict[str, Any]:
    fetcher = fetchers.get(provider)
    if fetcher is None:
        return {"error": f"Unsupported provider: {provider}"}
    params: Dict[str, Any] = {"period": period, "cloud_provider": provider}
    if credentials:
        params["credentials"] = credentials
    raw = await fetcher(params)
    return safe_json_load(raw, {"error": "Invalid tool response"})


def build_imported_cost_context(
    membership: Any,
    db: Any,
    *,
    cloud_provider: str = "all",
    organization_id_for_membership: Callable[[Any], int],
    customer_id_for_org: Callable[[Any], str],
    get_imported_cost_rows: Callable[[Any, int, str, str], list[Any]],
    imported_cost_summary: Callable[[list[Any]], Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    resolved_org_id = organization_id_for_membership(membership)
    customer_id = customer_id_for_org(membership)
    rows = get_imported_cost_rows(
        db,
        resolved_org_id,
        customer_id,
        cloud_provider,
    )
    if not rows:
        return None

    breakdown: Dict[str, Dict[str, float]] = {}
    region_breakdown: Dict[str, float] = {}
    total_cost = 0.0
    for row in rows:
        provider = str(getattr(row, "provider", "") or "").strip().lower()
        if not provider:
            continue
        cost = float(getattr(row, "cost_usd", 0.0) or 0.0)
        total_cost += cost
        provider_bucket = breakdown.setdefault(provider, {"cost": 0.0, "percentage": 0.0})
        provider_bucket["cost"] = round(provider_bucket["cost"] + cost, 2)
        region_name = str(getattr(row, "region", "") or "").strip()
        if region_name:
            region_breakdown[region_name] = round(region_breakdown.get(region_name, 0.0) + cost, 2)

    if total_cost > 0:
        for provider in breakdown:
            breakdown[provider]["percentage"] = round(
                (breakdown[provider]["cost"] / total_cost) * 100,
                1,
            )

    summary = imported_cost_summary(rows)
    last_imported_at = summary.get("last_imported_at")
    return {
        "period": "imported",
        "cloud_provider": cloud_provider,
        "total_cost": round(total_cost, 2),
        "breakdown": breakdown,
        "region_breakdown": [
            {"region": region, "cost_usd": round(cost, 2)}
            for region, cost in sorted(region_breakdown.items(), key=lambda item: item[1], reverse=True)
        ],
        "source": "csv_import",
        "source_priority": COST_SOURCE_PRIORITY,
        "rows_imported": summary["rows_imported"],
        "last_imported_at": last_imported_at.isoformat() if last_imported_at else None,
    }


async def build_live_cost_context(
    membership: Any,
    db: Any,
    *,
    period: str = "month",
    cloud_provider: str = "all",
    require_live_provider_data: bool = False,
    provider_diagnostics: Callable[[], Iterable[Any]],
    imported_cost_context_builder: Callable[[Any, Any, str], Optional[Dict[str, Any]]],
    cost_summary_for_provider: Callable[[str, str], Awaitable[Dict[str, Any]]],
    allow_imported_fallback: bool = True,
) -> Dict[str, Any]:
    requested_providers = (
        list(SUPPORTED_CONTEXT_PROVIDERS)
        if cloud_provider == "all"
        else [cloud_provider]
    )
    configured_live_providers = {
        str(getattr(diagnostic, "provider", "")).strip().lower()
        for diagnostic in provider_diagnostics()
        if bool(getattr(diagnostic, "configured", False))
        and str(getattr(diagnostic, "provider", "")).strip().lower() in requested_providers
    }

    if require_live_provider_data:
        if cloud_provider == "all":
            providers = [
                provider
                for provider in requested_providers
                if provider in configured_live_providers
            ]
            if not providers:
                raise LiveDataPolicyError(
                    "Live provider data is required, but no providers are configured for runtime API access. "
                    "Configure at least one provider (AWS/Azure/GCP/OCI) on this backend host, "
                    "or set REQUIRE_LIVE_PROVIDER_DATA=false to allow imported CSV fallback."
                )
        else:
            providers = requested_providers
            if providers[0] not in configured_live_providers:
                raise LiveDataPolicyError(
                    f"Live provider data is required for '{providers[0]}', but runtime credentials are not configured. "
                    "Configure provider credentials on this backend host, "
                    "or set REQUIRE_LIVE_PROVIDER_DATA=false to allow imported CSV fallback."
                )
    else:
        providers = [
            provider
            for provider in requested_providers
            if provider in configured_live_providers
        ]

    if not configured_live_providers and not require_live_provider_data:
        if not allow_imported_fallback:
            return _no_data_context(period=period, cloud_provider=cloud_provider)
        imported_context = imported_cost_context_builder(membership, db, cloud_provider)
        if imported_context is not None:
            return imported_context
        return _no_data_context(period=period, cloud_provider=cloud_provider)

    breakdown: Dict[str, Dict[str, float]] = {}
    region_breakdown: Dict[str, float] = {}
    provider_errors: Dict[str, str] = {}
    successful_provider_calls = 0
    total_cost = 0.0
    provider_api_sources: Dict[str, str] = {}

    for provider in providers:
        summary = await cost_summary_for_provider(provider, period)
        if "error" in summary:
            provider_errors[provider] = str(summary.get("error") or "Unknown provider error")
            continue

        successful_provider_calls += 1
        cost = float(summary.get("total_cost_usd", 0) or 0)
        total_cost += cost
        breakdown[provider] = {"cost": round(cost, 2), "percentage": 0.0}
        provider_api_sources[provider] = str(
            summary.get("api_source")
            or summary.get("data_source")
            or summary.get("source")
            or "live_provider_api"
        )
        for region_row in summary.get("region_breakdown", []):
            region_name = str(region_row.get("region") or "global")
            region_cost = float(region_row.get("cost_usd") or 0.0)
            region_breakdown[region_name] = region_breakdown.get(region_name, 0.0) + region_cost

    if total_cost > 0:
        for provider in breakdown:
            breakdown[provider]["percentage"] = round(
                (breakdown[provider]["cost"] / total_cost) * 100,
                1,
            )

    if require_live_provider_data and successful_provider_calls == 0:
        provider_error_summary = ", ".join(
            f"{provider}: {error}" for provider, error in sorted(provider_errors.items())
        )
        raise LiveDataPolicyError(
            "Live provider data is required, but all provider API calls failed. "
            f"Provider errors: {provider_error_summary or 'unknown'}"
        )

    if successful_provider_calls == 0:
        if not allow_imported_fallback:
            return _no_data_context(
                period=period,
                cloud_provider=cloud_provider,
                provider_errors=provider_errors,
            )
        imported_context = imported_cost_context_builder(membership, db, cloud_provider)
        if imported_context is not None:
            imported_context = dict(imported_context)
            if provider_errors:
                imported_context["provider_errors"] = provider_errors
            return imported_context
        return _no_data_context(
            period=period,
            cloud_provider=cloud_provider,
            provider_errors=provider_errors,
        )

    response = {
        "period": period,
        "cloud_provider": cloud_provider,
        "total_cost": round(total_cost, 2),
        "breakdown": breakdown,
        "source": (
            "live_provider_api_partial"
            if provider_errors
            else "live_provider_api"
            if configured_live_providers
            else "no_data_available"
        ),
        "source_priority": COST_SOURCE_PRIORITY,
        "provider_api_sources": provider_api_sources,
        "region_breakdown": [
            {"region": region, "cost_usd": round(cost, 2)}
            for region, cost in sorted(region_breakdown.items(), key=lambda item: item[1], reverse=True)
        ],
    }

    if provider_errors:
        response["provider_errors"] = provider_errors

    return response
