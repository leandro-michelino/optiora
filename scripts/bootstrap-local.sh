#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

args=("$@")
normalized_dev_tools="$(printf '%s' "${BOOTSTRAP_INSTALL_DEV_TOOLS:-true}" | tr '[:upper:]' '[:lower:]')"
if [[ "$normalized_dev_tools" != "1" && "$normalized_dev_tools" != "true" && "$normalized_dev_tools" != "yes" && "$normalized_dev_tools" != "y" ]]; then
  args=(--no-dev-tools "${args[@]}")
fi

exec "$ROOT_DIR/setup.sh" "${args[@]}"
