#!/usr/bin/env bash
# Release 0.9 smoke test — verifies a running OptiOra deployment end-to-end.
#
# Usage:
#   HOST=http://<instance-ip> bash tests/smoke_test_0_9.sh
#
# Set HOST to the base URL of the deployment (no trailing slash).
# Exits 0 on success, 1 on any failure.

set -euo pipefail

HOST="${HOST:-http://localhost}"
API="${HOST}:8000"
DASHBOARD="${HOST}:3000"

PASS=0
FAIL=0

_check() {
    local label="$1"
    local result="$2"
    if [ "$result" = "ok" ]; then
        echo "  [PASS] $label"
        PASS=$((PASS + 1))
    else
        echo "  [FAIL] $label — $result"
        FAIL=$((FAIL + 1))
    fi
}

_http_status() {
    curl -s -o /dev/null -w "%{http_code}" "$@"
}

_http_body() {
    curl -s "$@"
}

echo ""
echo "=== OptiOra Release 0.9 Smoke Test ==="
echo "API:       $API"
echo "Dashboard: $DASHBOARD"
echo ""

# ------------------------------------------------------------------
# 1. Backend health
# ------------------------------------------------------------------
echo "--- 1. Backend health ---"

status=$(_http_status "${API}/api/v1/health")
[ "$status" = "200" ] && _check "GET /api/v1/health returns 200" "ok" \
    || _check "GET /api/v1/health returns 200" "HTTP $status"

body=$(_http_body "${API}/api/v1/health")
echo "$body" | grep -q '"status":"healthy"' \
    && _check "/health body contains status:healthy" "ok" \
    || _check "/health body contains status:healthy" "body: $body"

status=$(_http_status "${API}/api/v1/info")
[ "$status" = "200" ] && _check "GET /api/v1/info returns 200" "ok" \
    || _check "GET /api/v1/info returns 200" "HTTP $status"

# ------------------------------------------------------------------
# 2. Dashboard accessibility (no login wall in public mode)
# ------------------------------------------------------------------
echo ""
echo "--- 2. Dashboard accessibility ---"

status=$(_http_status "${DASHBOARD}")
[ "$status" = "200" ] \
    && _check "Dashboard root returns 200" "ok" \
    || _check "Dashboard root returns 200" "HTTP $status"

body=$(_http_body "${DASHBOARD}/dashboard" 2>/dev/null || true)
echo "$body" | grep -qi "login\|sign.in\|password" \
    && _check "Dashboard does not show login wall" "login form detected — check ENABLE_AUTH=false" \
    || _check "Dashboard does not show login wall" "ok"

# ------------------------------------------------------------------
# 3. CSV template download
# ------------------------------------------------------------------
echo ""
echo "--- 3. CSV template ---"

status=$(_http_status "${API}/api/v1/imports/costs/template.csv")
[ "$status" = "200" ] \
    && _check "GET /imports/costs/template.csv returns 200" "ok" \
    || _check "GET /imports/costs/template.csv returns 200" "HTTP $status"

body=$(_http_body "${API}/api/v1/imports/costs/template.csv")
echo "$body" | grep -q "provider" \
    && _check "Template CSV contains provider column" "ok" \
    || _check "Template CSV contains provider column" "missing provider column"

# ------------------------------------------------------------------
# 4. CSV import
# ------------------------------------------------------------------
echo ""
echo "--- 4. CSV import ---"

upload_response=$(_http_body -X POST \
    -F "file=@-;filename=smoke-test.csv;type=text/csv" \
    "${API}/api/v1/imports/costs/csv" <<'EOF'
provider,cost_usd,service_name,account_identifier,region,currency
aws,250.00,EC2,smoke-acct-1,us-east-1,USD
azure,150.00,Compute,smoke-sub-1,eastus,USD
EOF
)

echo "$upload_response" | grep -q '"rows_imported":2' \
    && _check "CSV upload imports 2 rows" "ok" \
    || _check "CSV upload imports 2 rows" "response: $upload_response"

summary_body=$(_http_body "${API}/api/v1/imports/costs/summary")
echo "$summary_body" | grep -q '"has_data":true' \
    && _check "Import summary shows has_data:true" "ok" \
    || _check "Import summary shows has_data:true" "body: $summary_body"

# ------------------------------------------------------------------
# 5. Dashboard data endpoints
# ------------------------------------------------------------------
echo ""
echo "--- 5. Dashboard data endpoints ---"

for endpoint in costs forecast analytics anomalies recommendations; do
    status=$(_http_status "${API}/api/v1/${endpoint}")
    [ "$status" = "200" ] \
        && _check "GET /api/v1/${endpoint} returns 200" "ok" \
        || _check "GET /api/v1/${endpoint} returns 200" "HTTP $status"
done

costs_body=$(_http_body "${API}/api/v1/costs")
echo "$costs_body" | grep -q '"totalCost"' \
    && _check "/costs body contains totalCost" "ok" \
    || _check "/costs body contains totalCost" "body: $costs_body"

costs_value=$(echo "$costs_body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('totalCost',0))" 2>/dev/null || echo "0")
python3 -c "import sys; sys.exit(0 if float('$costs_value') >= 400 else 1)" 2>/dev/null \
    && _check "/costs totalCost reflects uploaded CSV (>=400)" "ok" \
    || _check "/costs totalCost reflects uploaded CSV (>=400)" "got $costs_value"

forecast_body=$(_http_body "${API}/api/v1/forecast")
echo "$forecast_body" | grep -q '"cost_context"' \
    && _check "/forecast body contains cost_context" "ok" \
    || _check "/forecast body contains cost_context" "body: $forecast_body"

# ------------------------------------------------------------------
# 6. Provider account rollups
# ------------------------------------------------------------------
echo ""
echo "--- 6. Provider account rollups ---"

rollup_body=$(_http_body "${API}/api/v1/provider-accounts/rollups")
echo "$rollup_body" | grep -q '"items"' \
    && _check "/provider-accounts/rollups returns items" "ok" \
    || _check "/provider-accounts/rollups returns items" "body: $rollup_body"

# ------------------------------------------------------------------
# 7. Exports
# ------------------------------------------------------------------
echo ""
echo "--- 7. Exports ---"

status=$(_http_status "${API}/api/v1/alerts.csv")
[ "$status" = "200" ] \
    && _check "GET /alerts.csv returns 200" "ok" \
    || _check "GET /alerts.csv returns 200" "HTTP $status"

status=$(_http_status "${API}/api/v1/audit-logs.csv")
[ "$status" = "200" ] \
    && _check "GET /audit-logs.csv returns 200" "ok" \
    || _check "GET /audit-logs.csv returns 200" "HTTP $status"

status=$(_http_status "${API}/api/v1/reports/executive-summary.csv")
[ "$status" = "200" ] \
    && _check "GET /reports/executive-summary.csv returns 200" "ok" \
    || _check "GET /reports/executive-summary.csv returns 200" "HTTP $status"

status=$(_http_status "${API}/api/v1/reports/executive-summary.xls")
[ "$status" = "200" ] \
    && _check "GET /reports/executive-summary.xls returns 200" "ok" \
    || _check "GET /reports/executive-summary.xls returns 200" "HTTP $status"

exec_body=$(_http_body "${API}/api/v1/reports/executive-summary.csv")
echo "$exec_body" | grep -q "Total Monthly Cost USD" \
    && _check "Executive summary CSV contains Total Monthly Cost USD" "ok" \
    || _check "Executive summary CSV contains Total Monthly Cost USD" "missing expected field"

# ------------------------------------------------------------------
# 8. Scan history (may be empty on fresh deploy)
# ------------------------------------------------------------------
echo ""
echo "--- 8. Scan history ---"

status=$(_http_status "${API}/api/v1/scanning/history")
[ "$status" = "200" ] \
    && _check "GET /scanning/history returns 200" "ok" \
    || _check "GET /scanning/history returns 200" "HTTP $status"

status=$(_http_status "${API}/api/v1/scanning/history.csv")
[ "$status" = "200" ] \
    && _check "GET /scanning/history.csv returns 200" "ok" \
    || _check "GET /scanning/history.csv returns 200" "HTTP $status"

status=$(_http_status "${API}/api/v1/scanning/scheduler/status")
[ "$status" = "200" ] \
    && _check "GET /scanning/scheduler/status returns 200" "ok" \
    || _check "GET /scanning/scheduler/status returns 200" "HTTP $status"

# ------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------
echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo "SMOKE TEST FAILED — resolve the above failures before declaring 0.9 complete."
    exit 1
else
    echo "SMOKE TEST PASSED — deployment meets Release 0.9 exit gate requirements."
    exit 0
fi
