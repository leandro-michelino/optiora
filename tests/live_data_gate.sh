#!/usr/bin/env bash
# Release-critical live-data gate for dashboard routes and backing APIs.
#
# Usage:
#   API_BASE=http://<instance-ip>:8000 DASHBOARD_BASE=http://<instance-ip>:3000 bash tests/live_data_gate.sh
# Optional:
#   SMOKE_CURL_INSECURE=true   # pass -k for self-signed HTTPS

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8000}"
DASHBOARD_BASE="${DASHBOARD_BASE:-http://localhost:3000}"
SMOKE_CURL_INSECURE="${SMOKE_CURL_INSECURE:-false}"
TMP_DIR="$(mktemp -d)"
FAIL=0
PASS=0

CURL_OPTS=(-sS)
if [ "$SMOKE_CURL_INSECURE" = "true" ]; then
    CURL_OPTS+=(-k)
fi

cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

_check() {
    local label="$1"
    local result="$2"
    if [ "$result" = "ok" ]; then
        echo "  [PASS] $label"
        PASS=$((PASS + 1))
    else
        echo "  [FAIL] $label -- $result"
        FAIL=$((FAIL + 1))
    fi
}

_http_status() {
    curl "${CURL_OPTS[@]}" -o /dev/null -w "%{http_code}" "$@"
}

_fetch_json_200() {
    local endpoint="$1"
    local output_file="$2"
    local status
    status=$(curl "${CURL_OPTS[@]}" -o "$output_file" -w "%{http_code}" "${API_BASE}${endpoint}")
    if [ "$status" != "200" ]; then
        return 1
    fi
    return 0
}

_check_route_and_apis() {
    local route="$1"
    shift
    local route_status
    route_status=$(_http_status "${DASHBOARD_BASE}${route}")
    [ "$route_status" = "200" ] \
        && _check "GET ${route} returns 200 (release-critical route)" "ok" \
        || _check "GET ${route} returns 200 (release-critical route)" "HTTP ${route_status}"

    for endpoint in "$@"; do
        local status
        status=$(_http_status "${API_BASE}${endpoint}")
        [ "$status" = "200" ] \
            && _check "Backing API ${endpoint} returns 200 for ${route}" "ok" \
            || _check "Backing API ${endpoint} returns 200 for ${route}" "HTTP ${status}"
    done
}

echo ""
echo "=== OptiOra Live Data Gate ==="
echo "API:       $API_BASE"
echo "Dashboard: $DASHBOARD_BASE"
echo ""

echo "--- 1. Release-critical routes and backing APIs ---"
_check_route_and_apis "/dashboard" \
    "/api/v1/costs" \
    "/api/v1/analytics" \
    "/api/v1/provider-diagnostics"
_check_route_and_apis "/dashboard/costs" \
    "/api/v1/costs" \
    "/api/v1/reports/cost-trend?period_type=monthly&lookback=3" \
    "/api/v1/recommendations?limit=5"
_check_route_and_apis "/dashboard/forecasting" \
    "/api/v1/forecast?months=12" \
    "/api/v1/reports/cost-trend?period_type=monthly&lookback=3"
_check_route_and_apis "/dashboard/recommendations" \
    "/api/v1/recommendations?limit=10" \
    "/api/v1/recommendations/rightsizing?limit=6"
_check_route_and_apis "/dashboard/anomalies" \
    "/api/v1/anomalies?limit=10" \
    "/api/v1/provider-diagnostics"
_check_route_and_apis "/dashboard/operations" \
    "/api/v1/scanning/history?limit=5" \
    "/api/v1/alerts?limit=5" \
    "/api/v1/audit-logs?limit=5" \
    "/api/v1/provider-diagnostics"

echo ""
echo "--- 2. Live-source / fallback policy contract ---"

provider_diagnostics_file="${TMP_DIR}/provider_diagnostics.json"
imported_summary_file="${TMP_DIR}/imported_summary.json"
costs_file="${TMP_DIR}/costs.json"
trend_file="${TMP_DIR}/trend.json"
forecast_file="${TMP_DIR}/forecast.json"

if _fetch_json_200 "/api/v1/provider-diagnostics" "$provider_diagnostics_file"; then
    _check "Fetch provider diagnostics payload" "ok"
else
    _check "Fetch provider diagnostics payload" "non-200 response"
fi

if _fetch_json_200 "/api/v1/imports/costs/summary" "$imported_summary_file"; then
    _check "Fetch imported cost summary payload" "ok"
else
    _check "Fetch imported cost summary payload" "non-200 response"
fi

if _fetch_json_200 "/api/v1/costs" "$costs_file"; then
    _check "Fetch costs payload" "ok"
else
    _check "Fetch costs payload" "non-200 response"
fi

if _fetch_json_200 "/api/v1/reports/cost-trend?period_type=monthly&lookback=3" "$trend_file"; then
    _check "Fetch cost trend payload" "ok"
else
    _check "Fetch cost trend payload" "non-200 response"
fi

if _fetch_json_200 "/api/v1/forecast?months=12" "$forecast_file"; then
    _check "Fetch forecast payload" "ok"
else
    _check "Fetch forecast payload" "non-200 response"
fi

if [ "$FAIL" -eq 0 ]; then
    contract_output_file="${TMP_DIR}/contract_check.txt"
    if python3 - "$provider_diagnostics_file" "$imported_summary_file" "$costs_file" "$trend_file" "$forecast_file" >"$contract_output_file" 2>&1 <<'PY'
import json
import sys
from pathlib import Path

provider_diagnostics = json.loads(Path(sys.argv[1]).read_text())
imported_summary = json.loads(Path(sys.argv[2]).read_text())
costs = json.loads(Path(sys.argv[3]).read_text())
trend = json.loads(Path(sys.argv[4]).read_text())
forecast = json.loads(Path(sys.argv[5]).read_text())

errors = []

if not isinstance(provider_diagnostics, list):
    errors.append("/api/v1/provider-diagnostics must return a JSON list.")

configured_providers = [
    row.get("provider")
    for row in provider_diagnostics
    if isinstance(row, dict) and bool(row.get("configured"))
]
has_imported = bool(imported_summary.get("has_data"))
if not configured_providers and not has_imported:
    errors.append(
        "No configured live providers and no imported CSV summary. "
        "Release-critical routes would be unverified/fallback."
    )

if not isinstance(costs, dict):
    errors.append("/api/v1/costs must return a JSON object.")
else:
    cost_context = costs.get("cost_context")
    if not isinstance(cost_context, dict):
        errors.append("/api/v1/costs is missing cost_context metadata.")
    else:
        source = str(cost_context.get("source") or "").strip().lower()
        blocked_sources = {"", "unknown", "fallback", "placeholder", "mock", "demo", "live_backend"}
        if source in blocked_sources:
            errors.append(f"Invalid cost_context.source for release gate: {source or '<empty>'}.")
        provider_errors = cost_context.get("provider_errors")
        if source.startswith("live_provider_api") and isinstance(provider_errors, dict) and provider_errors:
            serialized = ", ".join(f"{k}: {v}" for k, v in sorted(provider_errors.items()))
            errors.append(
                "Live provider source contains provider_errors, refusing release gate: "
                f"{serialized}"
            )

    if not isinstance(costs.get("totalCost"), (int, float)):
        errors.append("/api/v1/costs totalCost must be numeric.")
    if not isinstance(costs.get("breakdown"), dict):
        errors.append("/api/v1/costs breakdown must be an object.")

trend_source = str(trend.get("data_source") or "").strip().lower()
if trend_source in {"", "empty", "fallback", "placeholder", "mock", "demo"}:
    errors.append(f"Invalid trend data_source for release gate: {trend_source or '<empty>'}.")

if not isinstance(forecast.get("current_monthly_spend_usd"), (int, float)):
    errors.append("/api/v1/forecast current_monthly_spend_usd must be numeric.")
history_source = str(forecast.get("history_source") or "").strip().lower()
if history_source in {"placeholder", "mock", "demo"}:
    errors.append(f"Invalid forecast history_source for release gate: {history_source}.")

if errors:
    for item in errors:
        print(item)
    raise SystemExit(1)

print(
    "Contract checks passed:"
    f" configured_providers={configured_providers or ['none']},"
    f" imported_summary.has_data={has_imported},"
    f" costs.source={costs.get('cost_context', {}).get('source')},"
    f" trend.data_source={trend.get('data_source')},"
    f" forecast.history_source={forecast.get('history_source')}"
)
PY
    then
        _check "Fallback/placeholder policy contract passes" "ok"
    else
        contract_summary="$(tr '\n' ' ' < "$contract_output_file" | sed 's/[[:space:]]\+/ /g')"
        _check "Fallback/placeholder policy contract passes" "$contract_summary"
    fi
fi

echo ""
echo "=== Live Data Gate Results: ${PASS} passed, ${FAIL} failed ==="

if [ "$FAIL" -gt 0 ]; then
    echo "LIVE DATA GATE FAILED -- fix fallback/placeholder signals before release."
    exit 1
fi

echo "LIVE DATA GATE PASSED -- release-critical routes are backed by non-fallback data paths."
exit 0
