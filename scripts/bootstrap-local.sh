#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[bootstrap] Setting up Python environment..."
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install --upgrade pip
.venv/bin/pip install -e .
if [[ "${BOOTSTRAP_INSTALL_DEV_TOOLS:-true}" =~ ^([Tt][Rr][Uu][Ee]|[Yy][Ee][Ss]|1)$ ]]; then
  echo "[bootstrap] Installing backend dev toolchain (pytest, ruff, mypy, black)..."
  .venv/bin/pip install \
    "pytest>=9,<10" \
    "ruff>=0.1,<0.2" \
    "mypy>=1.5,<2" \
    "black>=23,<24"
fi

echo "[bootstrap] Installing dashboard dependencies..."
(
  cd dashboard
  npm install
)

echo "[bootstrap] Generating OpenAPI client..."
PYTHONPATH=. .venv/bin/python scripts/generate_openapi_client.py

cat <<'EOF'

Bootstrap complete.

Run backend:
  .venv/bin/optiora

Run dashboard:
  cd dashboard && npm run dev

EOF
