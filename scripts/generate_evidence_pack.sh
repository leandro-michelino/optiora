#!/usr/bin/env bash
# Generate dated deployment evidence artifacts for release gating.
#
# The script records command + log artifacts for:
# - deploy
# - migration
# - smoke
# - live credential flow
# - rollback
#
# Usage examples:
#   ./scripts/generate_evidence_pack.sh
#
#   EVIDENCE_DEPLOY_CMD="./deploy/deploy-oci.sh full" \
#   EVIDENCE_MIGRATION_CMD="cd /opt/optiora && ./venv/bin/alembic upgrade head" \
#   EVIDENCE_SMOKE_CMD="./deploy/deploy-oci.sh verify" \
#   EVIDENCE_LIVE_CREDENTIAL_CMD="SMOKE_CREDENTIAL_JSON='{\"provider\":\"aws\"}' ./deploy/deploy-oci.sh verify" \
#   EVIDENCE_ROLLBACK_CMD="./deploy/deploy-oci.sh restart" \
#   ./scripts/generate_evidence_pack.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP_UTC="$(date -u +%Y%m%d-%H%M%SZ)"
PACK_ROOT="${EVIDENCE_OUTPUT_DIR:-${ROOT_DIR}/artifacts/evidence}"
PACK_DIR="${PACK_ROOT}/${STAMP_UTC}"
MANIFEST_FILE="${PACK_DIR}/manifest.tsv"
SUMMARY_FILE="${PACK_DIR}/SUMMARY.md"
FAILED=0

DEPLOY_CMD="${EVIDENCE_DEPLOY_CMD:-}"
MIGRATION_CMD="${EVIDENCE_MIGRATION_CMD:-}"
SMOKE_CMD="${EVIDENCE_SMOKE_CMD:-./deploy/deploy-oci.sh verify}"
LIVE_CREDENTIAL_CMD="${EVIDENCE_LIVE_CREDENTIAL_CMD:-}"
ROLLBACK_CMD="${EVIDENCE_ROLLBACK_CMD:-}"

mkdir -p "$PACK_DIR"

touch "$MANIFEST_FILE"

log_info() {
    printf '[INFO] %s\n' "$1"
}

_escape_md() {
    printf '%s' "$1" | sed 's/|/\\|/g'
}

record_step() {
    local step="$1"
    local status="$2"
    local note="$3"
    local command_file="$4"
    local log_file="$5"
    printf '%s\t%s\t%s\t%s\t%s\n' \
        "$step" "$status" "$note" "$command_file" "$log_file" >> "$MANIFEST_FILE"
}

run_step() {
    local step="$1"
    local command="$2"
    local command_file="${PACK_DIR}/${step}.command.txt"
    local log_file="${PACK_DIR}/${step}.log"

    if [ -z "${command//[[:space:]]/}" ]; then
        printf '<not provided>\n' > "$command_file"
        printf '[SKIP] %s command not provided.\n' "$step" > "$log_file"
        record_step "$step" "skipped" "command not provided" "$(basename "$command_file")" "$(basename "$log_file")"
        return 0
    fi

    printf '%s\n' "$command" > "$command_file"
    {
        printf '[%s] STEP=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$step"
        printf 'COMMAND: %s\n\n' "$command"
    } > "$log_file"

    set +e
    (
        cd "$ROOT_DIR"
        bash -c "$command"
    ) >> "$log_file" 2>&1
    local status=$?
    set -e

    if [ "$status" -eq 0 ]; then
        record_step "$step" "passed" "ok" "$(basename "$command_file")" "$(basename "$log_file")"
        return 0
    fi

    FAILED=1
    record_step "$step" "failed" "exit code ${status}" "$(basename "$command_file")" "$(basename "$log_file")"
    return 0
}

generate_metadata() {
    local commit_ref branch_ref
    commit_ref="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")"
    branch_ref="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"

    {
        echo "generated_at_utc=${STAMP_UTC}"
        echo "workspace=${ROOT_DIR}"
        echo "git_branch=${branch_ref}"
        echo "git_commit=${commit_ref}"
        echo "api_base=${API_BASE:-}"
        echo "dashboard_base=${DASHBOARD_BASE:-}"
        echo "smoke_credential_json_present=$([ -n "${SMOKE_CREDENTIAL_JSON:-}" ] && echo true || echo false)"
    } > "${PACK_DIR}/metadata.env"

    git -C "$ROOT_DIR" status --short > "${PACK_DIR}/git-status.txt" 2>/dev/null || true
}

generate_summary() {
    {
        echo "# Deployment Evidence Pack"
        echo ""
        echo "- Generated (UTC): ${STAMP_UTC}"
        echo "- Workspace: ${ROOT_DIR}"
        echo ""
        echo "## Step Results"
        echo ""
        echo "| Step | Status | Command File | Log File | Notes |"
        echo "| --- | --- | --- | --- | --- |"
        while IFS=$'\t' read -r step status note command_file log_file; do
            printf '| %s | %s | %s | %s | %s |\n' \
                "$(_escape_md "$step")" \
                "$(_escape_md "$status")" \
                "$(_escape_md "$command_file")" \
                "$(_escape_md "$log_file")" \
                "$(_escape_md "$note")"
        done < "$MANIFEST_FILE"
        echo ""
        echo "## Command Inputs"
        echo ""
        printf -- '- `deploy`: %s\n' "${DEPLOY_CMD:-<not provided>}"
        printf -- '- `migration`: %s\n' "${MIGRATION_CMD:-<not provided>}"
        printf -- '- `smoke`: %s\n' "${SMOKE_CMD:-<not provided>}"
        printf -- '- `live_credential_flow`: %s\n' "${LIVE_CREDENTIAL_CMD:-<not provided>}"
        printf -- '- `rollback`: %s\n' "${ROLLBACK_CMD:-<not provided>}"
    } > "$SUMMARY_FILE"
}

log_info "Writing evidence pack to: ${PACK_DIR}"

generate_metadata
run_step "deploy" "$DEPLOY_CMD"
run_step "migration" "$MIGRATION_CMD"
run_step "smoke" "$SMOKE_CMD"
run_step "live_credential_flow" "$LIVE_CREDENTIAL_CMD"
run_step "rollback" "$ROLLBACK_CMD"
generate_summary

log_info "Evidence summary: ${SUMMARY_FILE}"

if [ "$FAILED" -ne 0 ]; then
    log_info "Evidence pack generated with failed step(s)."
    exit 1
fi

log_info "Evidence pack generated successfully."
exit 0
