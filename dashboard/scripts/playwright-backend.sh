#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TMP_DIR="${ROOT_DIR}/.tmp"
DB_PATH="${TMP_DIR}/optiora-e2e.db"

mkdir -p "$TMP_DIR"
rm -f "$DB_PATH"

export ENABLE_AUTH="${ENABLE_AUTH:-false}"
export ENVIRONMENT="${ENVIRONMENT:-test}"
export SECRET_KEY="${SECRET_KEY:-optiora-e2e-secret-key}"
export DATABASE_URL="${DATABASE_URL:-sqlite:///${DB_PATH}}"

cd "$ROOT_DIR"
"${ROOT_DIR}/.venv/bin/alembic" -c "${ROOT_DIR}/alembic.ini" upgrade head >/dev/null
exec "${ROOT_DIR}/.venv/bin/optiora" --host 127.0.0.1 --port 8000
