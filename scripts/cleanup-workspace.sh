#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Cleaning duplicate copy artifacts and generated local caches..."

# Remove common duplicate-copy and editor/OS artifacts from Finder, Downloads,
# and one-off merge/edit workflows.
find . \
  \( -path './.git' -o -path './.venv' -o -path './.venv313' -o -path './dashboard/node_modules' -o -path './dashboard/.next' \) -prune \
  -o -type f \( \
    -name '* ([0-9]).*' \
    -o -name '* ([0-9])' \
    -o -iname '* copy.*' \
    -o -iname '* copy' \
    -o -name '*.bak' \
    -o -name '*.orig' \
    -o -name '*.rej' \
    -o -name '*.tmp' \
    -o -name '.DS_Store' \
    -o -name 'Thumbs.db' \
  \) \
  -print -delete

# Remove Python and pytest cache directories.
find . \
  \( -path './.git' -o -path './.venv' -o -path './.venv313' -o -path './dashboard/node_modules' -o -path './dashboard/.next' \) -prune \
  -o -type d \( -name '__pycache__' -o -name '.pytest_cache' -o -name '.mypy_cache' -o -name '.ruff_cache' \) \
  -print -exec rm -rf {} +

rm -rf \
  .tmp \
  tmp \
  artifacts \
  .coverage \
  htmlcov \
  .tox \
  dashboard/.next \
  dashboard/out \
  dashboard/build \
  dashboard/dist \
  dashboard/test-results \
  dashboard/playwright-report \
  terraform/.terraform

rm -f \
  dashboard/tsconfig.tsbuildinfo \
  terraform/tfplan \
  terraform/crash.log \
  terraform/crash.*.log

echo "Preserved dependency/runtime state: .venv, dashboard/node_modules, optiora.db, terraform/*.tfstate, terraform/terraform.tfvars."
echo "Cleanup complete."
