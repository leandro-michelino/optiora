#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f ../.env ]; then
  echo "[dev] Copying .env.example to .env" >&2
  cp ../.env.example ../.env
fi

if [ ! -f .env.local ]; then
  echo "[dev] Copying ../.env.example to .env.local (frontend)" >&2
  cp ../.env.example .env.local
fi

echo "[dev] Starting backend (port 8000) and frontend (port 3000)"
(
  cd ..
  if [ ! -d .venv ]; then
    python3 -m venv .venv
  fi
  source .venv/bin/activate
  pip install -e . >/dev/null
  python -m finops_mcp.app --port 8000
) &

npm run dev