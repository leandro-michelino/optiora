#!/usr/bin/env bash
# Public-dashboard verification for a running OptiOra deployment.
#
# Usage:
#   HOST=http://<instance-ip> bash tests/smoke_test_0_9.sh
#
# Optional overrides:
#   API_BASE=http://<instance-ip>:8000
#   DASHBOARD_BASE=http://<instance-ip>:3000
#   SMOKE_CREDENTIAL_JSON='{"provider":"aws",...}'
#   SMOKE_SCAN_POLL_SECONDS=180

set -euo pipefail

HOST="${HOST:-http://localhost}"
API_BASE="${API_BASE:-${HOST}:8000}"
DASHBOARD_BASE="${DASHBOARD_BASE:-${HOST}:3000}"
SMOKE_CREDENTIAL_JSON="${SMOKE_CREDENTIAL_JSON:-}"
SMOKE_SCAN_POLL_SECONDS="${SMOKE_SCAN_POLL_SECONDS:-180}"
TMP_DIR="$(mktemp -d)"
PASS=0
FAIL=0
SKIP=0

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

_skip() {
    local label="$1"
    local reason="$2"
    echo "  [SKIP] $label -- $reason"
    SKIP=$((SKIP + 1))
}

_http_status() {
    curl -sS -o /dev/null -w "%{http_code}" "$@"
}

_http_body() {
    curl -sS "$@"
}

_json_get() {
    local payload="$1"
    local path="$2"
    printf '%s' "$payload" | python3 - "$path" <<'PY'
import json
import sys

path = sys.argv[1].split(".")
data = json.load(sys.stdin)
value = data
for part in path:
    if part == "":
        continue
    if isinstance(value, list):
        value = value[int(part)]
    else:
        value = value.get(part)
if isinstance(value, bool):
    print("true" if value else "false")
elif value is None:
    print("")
elif isinstance(value, (dict, list)):
    print(json.dumps(value))
else:
    print(value)
PY
}

_json_number_ge() {
    local payload="$1"
    local path="$2"
    local minimum="$3"
    printf '%s' "$payload" | python3 - "$path" "$minimum" <<'PY'
import json
import sys

path = sys.argv[1].split(".")
minimum = float(sys.argv[2])
value = json.load(sys.stdin)
for part in path:
    if part == "":
        continue
    if isinstance(value, list):
        value = value[int(part)]
    else:
        value = value.get(part)
try:
    sys.exit(0 if float(value) >= minimum else 1)
except Exception:
    sys.exit(1)
PY
}

_json_array_len_ge() {
    local payload="$1"
    local path="$2"
    local minimum="$3"
    printf '%s' "$payload" | python3 - "$path" "$minimum" <<'PY'
import json
import sys

path = sys.argv[1].split(".")
minimum = int(sys.argv[2])
value = json.load(sys.stdin)
for part in path:
    if part == "":
        continue
    if isinstance(value, list):
        value = value[int(part)]
    else:
        value = value.get(part)
sys.exit(0 if isinstance(value, list) and len(value) >= minimum else 1)
PY
}

_request_json_status() {
    local method="$1"
    local url="$2"
    local payload="$3"
    curl -sS -o /dev/null -w "%{http_code}" \
        -X "$method" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$url"
}

_request_json_body() {
    local method="$1"
    local url="$2"
    local payload="$3"
    curl -sS \
        -X "$method" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$url"
}

_request_json_once() {
    local method="$1"
    local url="$2"
    local payload="$3"
    local response_file="$4"
    curl -sS \
        -o "$response_file" \
        -w "%{http_code}" \
        -X "$method" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$url"
}

_wait_for_scan_terminal_state() {
    local scan_id="$1"
    local deadline=$((SECONDS + SMOKE_SCAN_POLL_SECONDS))
    local progress_body=""
    while [ "$SECONDS" -lt "$deadline" ]; do
        progress_body=$(_http_body "${API_BASE}/api/v1/scanning/${scan_id}/progress" || true)
        state=$(_json_get "$progress_body" "state")
        if [ "$state" = "completed" ] || [ "$state" = "failed" ]; then
            printf '%s' "$progress_body"
            return 0
        fi
        sleep 5
    done
    printf '%s' "$progress_body"
    return 1
}

echo ""
echo "=== OptiOra Deployment Verification ==="
echo "API:       $API_BASE"
echo "Dashboard: $DASHBOARD_BASE"
echo ""

echo "--- 1. Backend health ---"
status=$(_http_status "${API_BASE}/health")
[ "$status" = "200" ] && _check "GET /health returns 200" "ok" || _check "GET /health returns 200" "HTTP $status"

health_body=$(_http_body "${API_BASE}/health")
[ "$(_json_get "$health_body" "status")" = "healthy" ] \
    && _check "/health reports healthy" "ok" \
    || _check "/health reports healthy" "body: $health_body"

status=$(_http_status "${API_BASE}/api/v1/info")
[ "$status" = "200" ] && _check "GET /api/v1/info returns 200" "ok" || _check "GET /api/v1/info returns 200" "HTTP $status"

echo ""
echo "--- 2. Public dashboard routes ---"
for route in "" "/dashboard" "/dashboard/costs" "/dashboard/forecasting" "/dashboard/ai-insights" "/dashboard/anomalies" "/dashboard/recommendations" "/dashboard/operations" "/dashboard/settings"; do
    status=$(_http_status "${DASHBOARD_BASE}${route}")
    [ "$status" = "200" ] \
        && _check "GET ${route:-/} returns 200" "ok" \
        || _check "GET ${route:-/} returns 200" "HTTP $status"
done

dashboard_body=$(_http_body "${DASHBOARD_BASE}/dashboard" || true)
echo "$dashboard_body" | grep -qi "login\|sign.in\|password" \
    && _check "Dashboard does not show login wall" "login form detected -- check public mode" \
    || _check "Dashboard does not show login wall" "ok"

echo ""
echo "--- 3. CSV template and import ---"
status=$(_http_status "${API_BASE}/api/v1/imports/costs/template.csv")
[ "$status" = "200" ] \
    && _check "GET /imports/costs/template.csv returns 200" "ok" \
    || _check "GET /imports/costs/template.csv returns 200" "HTTP $status"

template_body=$(_http_body "${API_BASE}/api/v1/imports/costs/template.csv")
echo "$template_body" | grep -q "provider,cost_usd" \
    && _check "Template CSV contains provider and cost_usd columns" "ok" \
    || _check "Template CSV contains provider and cost_usd columns" "missing expected header"

upload_response=$(_http_body -X POST \
    -F "file=@-;filename=smoke-test.csv;type=text/csv" \
    "${API_BASE}/api/v1/imports/costs/csv" <<'EOF'
provider,cost_usd,service_name,account_identifier,account_name,account_type,parent_account_identifier,region,currency
aws,250.00,EC2,smoke-acct-1,AWS Smoke,account,aws-root,us-east-1,USD
azure,150.00,Compute,smoke-sub-1,Azure Smoke,subscription,mg-smoke,eastus,USD
EOF
)

[ "$(_json_get "$upload_response" "rows_imported")" = "2" ] \
    && _check "CSV upload imports 2 rows" "ok" \
    || _check "CSV upload imports 2 rows" "response: $upload_response"

summary_body=$(_http_body "${API_BASE}/api/v1/imports/costs/summary")
[ "$(_json_get "$summary_body" "has_data")" = "true" ] \
    && _check "Import summary shows active data" "ok" \
    || _check "Import summary shows active data" "body: $summary_body"

[ "$(_json_get "$summary_body" "rows_imported")" = "2" ] \
    && _check "Import summary row count matches upload" "ok" \
    || _check "Import summary row count matches upload" "body: $summary_body"

echo ""
echo "--- 4. Imported CSV becomes active cost source ---"
costs_body=$(_http_body "${API_BASE}/api/v1/costs")
_json_number_ge "$costs_body" "totalCost" "400" \
    && _check "/api/v1/costs totalCost reflects uploaded CSV" "ok" \
    || _check "/api/v1/costs totalCost reflects uploaded CSV" "body: $costs_body"

forecast_body=$(_http_body "${API_BASE}/api/v1/forecast")
_json_number_ge "$forecast_body" "current_monthly_spend_usd" "400" \
    && _check "/api/v1/forecast reflects imported spend" "ok" \
    || _check "/api/v1/forecast reflects imported spend" "body: $forecast_body"

_json_number_ge "$forecast_body" "cost_context.total_cost" "400" \
    && _check "/api/v1/forecast exposes imported cost_context" "ok" \
    || _check "/api/v1/forecast exposes imported cost_context" "body: $forecast_body"

analytics_body=$(_http_body "${API_BASE}/api/v1/analytics")
_json_number_ge "$analytics_body" "current_monthly_spend_usd" "400" \
    && _check "/api/v1/analytics reflects imported spend" "ok" \
    || _check "/api/v1/analytics reflects imported spend" "body: $analytics_body"

rollup_body=$(_http_body "${API_BASE}/api/v1/provider-accounts/rollups")
_json_array_len_ge "$rollup_body" "items" "1" \
    && _check "/api/v1/provider-accounts/rollups returns hierarchy items" "ok" \
    || _check "/api/v1/provider-accounts/rollups returns hierarchy items" "body: $rollup_body"

echo ""
echo "--- 5. Provider diagnostics, exports, and AI route ---"
diagnostics_body=$(_http_body "${API_BASE}/api/v1/provider-diagnostics")
if python3 - "$diagnostics_body" <<'PY'
import json
import sys
data = json.loads(sys.argv[1])
sys.exit(0 if isinstance(data, list) and len(data) >= 1 else 1)
PY
then
    _check "/api/v1/provider-diagnostics returns provider rows" "ok"
else
    _check "/api/v1/provider-diagnostics returns provider rows" "body: $diagnostics_body"
fi

for endpoint in "/api/v1/alerts.csv" "/api/v1/audit-logs.csv" "/api/v1/reports/executive-summary.csv" "/api/v1/reports/executive-summary.xls" "/api/v1/scanning/history.csv"; do
    status=$(_http_status "${API_BASE}${endpoint}")
    [ "$status" = "200" ] \
        && _check "GET ${endpoint} returns 200" "ok" \
        || _check "GET ${endpoint} returns 200" "HTTP $status"
done

exec_body=$(_http_body "${API_BASE}/api/v1/reports/executive-summary.csv")
echo "$exec_body" | grep -q "Total Monthly Cost USD" \
    && _check "Executive summary CSV contains finance headers" "ok" \
    || _check "Executive summary CSV contains finance headers" "body: $exec_body"

ai_status=$(_request_json_status "POST" "${DASHBOARD_BASE}/api/ai/chat" '{"message":"Summarize the current workspace cost source.","conversationHistory":[]}')
[ "$ai_status" = "200" ] \
    && _check "POST /api/ai/chat returns 200" "ok" \
    || _check "POST /api/ai/chat returns 200" "HTTP $ai_status"

echo ""
echo "--- 6. FinOps Analytics endpoints ---"
for endpoint in \
    "/api/v1/analytics/cloud-waste" \
    "/api/v1/analytics/efficiency-score" \
    "/api/v1/analytics/commitment-gap" \
    "/api/v1/analytics/unit-economics" \
    "/api/v1/analytics/scorecards" \
    "/api/v1/inventory" \
    "/api/v1/kubernetes/cost-allocation" \
    "/api/v1/virtual-tags/rules" \
    "/api/v1/virtual-tags/preview" \
    "/api/v1/recommendations/rightsizing"; do
    status=$(_http_status "${API_BASE}${endpoint}")
    [ "$status" = "200" ] \
        && _check "GET ${endpoint} returns 200" "ok" \
        || _check "GET ${endpoint} returns 200" "HTTP $status"
done

# Virtual tag rule roundtrip
vtag_create_body=$(_request_json_body "POST" "${API_BASE}/api/v1/virtual-tags/rules" \
    '{"tag_key":"smoke-env","tag_value":"verification","match_provider":"aws","priority":1}')
vtag_id=$(printf '%s' "$vtag_create_body" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || true)
if [ -n "$vtag_id" ]; then
    _check "POST /api/v1/virtual-tags/rules roundtrip creates rule" "ok"
    del_status=$(_http_status -X DELETE "${API_BASE}/api/v1/virtual-tags/rules/${vtag_id}")
    [ "$del_status" = "204" ] \
        && _check "DELETE /api/v1/virtual-tags/rules/{id} returns 204" "ok" \
        || _check "DELETE /api/v1/virtual-tags/rules/{id} returns 204" "HTTP $del_status"
else
    _check "POST /api/v1/virtual-tags/rules roundtrip creates rule" "body: $vtag_create_body"
fi

echo ""
echo "--- 7. Optional live credential and scan flow ---"
if [ -z "$SMOKE_CREDENTIAL_JSON" ]; then
    _skip "Credential validation/add + scan flow" "Set SMOKE_CREDENTIAL_JSON with a real provider payload to verify live credential flow."
else
    validate_response_file="${TMP_DIR}/validate.json"
    validate_status=$(_request_json_once "POST" "${API_BASE}/api/v1/credentials/validate" "$SMOKE_CREDENTIAL_JSON" "$validate_response_file")
    validate_body="$(cat "$validate_response_file")"
    [ "$validate_status" = "200" ] \
        && _check "POST /api/v1/credentials/validate returns 200" "ok" \
        || _check "POST /api/v1/credentials/validate returns 200" "HTTP $validate_status"

    [ "$(_json_get "$validate_body" "is_valid")" = "true" ] \
        && _check "Credential validation reports is_valid=true" "ok" \
        || _check "Credential validation reports is_valid=true" "body: $validate_body"

    add_response_file="${TMP_DIR}/add.json"
    add_status=$(_request_json_once "POST" "${API_BASE}/api/v1/credentials/add" "$SMOKE_CREDENTIAL_JSON" "$add_response_file")
    [ "$add_status" = "200" ] \
        && _check "POST /api/v1/credentials/add returns 200" "ok" \
        || _check "POST /api/v1/credentials/add returns 200" "HTTP $add_status"

    provider="$(_json_get "$SMOKE_CREDENTIAL_JSON" "provider")"
    listed_credentials=$(_http_body "${API_BASE}/api/v1/credentials")
    echo "$listed_credentials" | grep -qi "\"provider\":\"${provider}\"" \
        && _check "Credential list includes added provider" "ok" \
        || _check "Credential list includes added provider" "body: $listed_credentials"

    approve_status=$(_request_json_status "POST" "${API_BASE}/api/v1/scanning/approve" '{"scan_frequency":"daily","auto_remediate":false}')
    [ "$approve_status" = "200" ] \
        && _check "POST /api/v1/scanning/approve returns 200" "ok" \
        || _check "POST /api/v1/scanning/approve returns 200" "HTTP $approve_status"

    start_payload="{\"providers\":[\"${provider}\"]}"
    start_response_file="${TMP_DIR}/start.json"
    start_status=$(_request_json_once "POST" "${API_BASE}/api/v1/scanning/start" "$start_payload" "$start_response_file")
    start_body="$(cat "$start_response_file")"
    [ "$start_status" = "200" ] \
        && _check "POST /api/v1/scanning/start returns 200" "ok" \
        || _check "POST /api/v1/scanning/start returns 200" "HTTP $start_status"

    scan_id="$(_json_get "$start_body" "scan_id")"
    if [ -n "$scan_id" ]; then
        _check "Scan start returns scan_id" "ok"
    else
        _check "Scan start returns scan_id" "body: $start_body"
    fi

    if [ -n "$scan_id" ]; then
        if progress_body=$(_wait_for_scan_terminal_state "$scan_id"); then
            terminal_state="$(_json_get "$progress_body" "state")"
            [ "$terminal_state" = "completed" ] \
                && _check "Scan reaches completed state" "ok" \
                || _check "Scan reaches completed state" "body: $progress_body"
        else
            _check "Scan reaches completed state" "timed out waiting for $scan_id"
        fi

        history_body=$(_http_body "${API_BASE}/api/v1/scanning/history")
        echo "$history_body" | grep -q "\"scan_id\":\"${scan_id}\"" \
            && _check "Scan history contains started scan" "ok" \
            || _check "Scan history contains started scan" "body: $history_body"

        diff_status=$(_http_status "${API_BASE}/api/v1/scanning/${scan_id}/diff")
        [ "$diff_status" = "200" ] \
            && _check "GET /api/v1/scanning/${scan_id}/diff returns 200" "ok" \
            || _check "GET /api/v1/scanning/${scan_id}/diff returns 200" "HTTP $diff_status"

        diff_csv_status=$(_http_status "${API_BASE}/api/v1/scanning/${scan_id}/diff.csv")
        [ "$diff_csv_status" = "200" ] \
            && _check "GET /api/v1/scanning/${scan_id}/diff.csv returns 200" "ok" \
            || _check "GET /api/v1/scanning/${scan_id}/diff.csv returns 200" "HTTP $diff_csv_status"
    fi
fi

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed, ${SKIP} skipped ==="
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo "VERIFICATION FAILED -- resolve the failed checks before declaring the environment ready."
    exit 1
fi

echo "VERIFICATION PASSED -- deployment meets the current OptiOra public-dashboard verification gate."
exit 0
