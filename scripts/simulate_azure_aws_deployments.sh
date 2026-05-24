#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${ROOT_DIR}/artifacts/cloud-simulations"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
REPORT_FILE="${ARTIFACT_DIR}/simulation-${TIMESTAMP}.md"

mkdir -p "${ARTIFACT_DIR}"

PASS=0
FAIL=0

run_check() {
  local label="$1"
  local cmd="$2"
  {
    echo "## ${label}"
    echo
    echo '```bash'
    echo "${cmd}"
    echo '```'
    echo
  } >> "${REPORT_FILE}"

  if output="$(eval "${cmd}" 2>&1)"; then
    PASS=$((PASS + 1))
    {
      echo "**Status:** PASS"
      echo
      echo '```text'
      printf '%s\n' "${output}"
      echo '```'
      echo
    } >> "${REPORT_FILE}"
  else
    FAIL=$((FAIL + 1))
    {
      echo "**Status:** FAIL"
      echo
      echo '```text'
      printf '%s\n' "${output}"
      echo '```'
      echo
    } >> "${REPORT_FILE}"
  fi
}

{
  echo "# OptiOra Cloud Deployment Simulation"
  echo
  echo "- Timestamp (UTC): ${TIMESTAMP}"
  echo "- Mode: read-only API checks (no resource creation or mutation)"
  echo
} > "${REPORT_FILE}"

run_check "AWS identity" "aws sts get-caller-identity"
run_check "AWS regions" "aws ec2 describe-regions --query 'Regions[].RegionName' --output text"
run_check "AWS VPC inventory" "aws ec2 describe-vpcs --query 'Vpcs[].{VpcId:VpcId,Cidr:CidrBlock,State:State}' --output table"
run_check "Azure account context" "az account show -o table"
run_check "Azure resource groups" "az group list --query '[].{name:name,location:location}' -o table"
run_check "Azure resources" "az resource list --query '[0:20].{name:name,type:type,resourceGroup:resourceGroup,location:location}' -o table"

{
  echo "## Summary"
  echo
  echo "- Passed checks: ${PASS}"
  echo "- Failed checks: ${FAIL}"
  echo
  if [ "${FAIL}" -eq 0 ]; then
    echo "All cloud simulation checks passed."
  else
    echo "One or more checks failed. Review the sections above."
  fi
} >> "${REPORT_FILE}"

printf '%s\n' "Simulation report: ${REPORT_FILE}"
if [ "${FAIL}" -gt 0 ]; then
  exit 1
fi

