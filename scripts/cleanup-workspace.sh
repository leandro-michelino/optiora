#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Cleaning duplicate copy artifacts and generated local caches..."

# Remove common duplicate-copy files from Finder/Downloads style naming.
find . \
  \( -path './.git' -o -path './.venv' -o -path './.venv313' -o -path './dashboard/node_modules' -o -path './dashboard/.next' \) -prune \
  -o -type f \( -name '* (1).*' -o -name '* (1)' -o -name '*.orig' -o -name '*.rej' -o -name '*.tmp' \) \
  -print -delete

# Remove Python and pytest cache directories.
find . \
  \( -path './.git' -o -path './.venv' -o -path './.venv313' -o -path './dashboard/node_modules' -o -path './dashboard/.next' \) -prune \
  -o -type d \( -name '__pycache__' -o -name '.pytest_cache' -o -name '.mypy_cache' -o -name '.ruff_cache' \) \
  -print -exec rm -rf {} +

rm -rf \
  .tmp \
  tmp \
  dashboard/.next \
  dashboard/test-results \
  dashboard/playwright-report \
  terraform/.terraform

rm -f \
  dashboard/tsconfig.tsbuildinfo \
  terraform/tfplan

echo "Preserved dependency/runtime state: .venv, dashboard/node_modules, optiora.db, terraform/*.tfstate, terraform/terraform.tfvars."
echo "Cleanup complete."
