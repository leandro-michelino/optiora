#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://127.0.0.1:8000}"
export NEXT_PUBLIC_ENABLE_AUTH="${NEXT_PUBLIC_ENABLE_AUTH:-false}"

cd "$ROOT_DIR"
exec npm run dev -- --hostname 127.0.0.1 --port 3000
