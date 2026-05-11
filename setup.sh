#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

COLOR_RESET="\033[0m"
COLOR_BLUE="\033[1;34m"
COLOR_GREEN="\033[0;32m"
COLOR_YELLOW="\033[1;33m"
COLOR_RED="\033[0;31m"

RUN_CLEANUP=false
RUN_VERIFY=false
INSTALL_DEV_TOOLS=true
INSTALL_DASHBOARD=true
GENERATE_OPENAPI=true

usage() {
  cat <<'EOF'
OptiOra local setup

Usage:
  ./setup.sh [options]

Options:
  --clean            Run workspace cleanup before setup.
  --verify           Run validation checks after setup.
  --no-dev-tools     Skip pytest/ruff/mypy/black installation.
  --skip-dashboard   Skip dashboard npm install.
  --skip-openapi     Skip OpenAPI client generation.
  -h, --help         Show this help.
EOF
}

log_step() {
  echo
  echo -e "${COLOR_BLUE}==>${COLOR_RESET} $1"
}

log_ok() {
  echo -e "${COLOR_GREEN}[OK]${COLOR_RESET} $1"
}

log_warn() {
  echo -e "${COLOR_YELLOW}[WARN]${COLOR_RESET} $1"
}

log_err() {
  echo -e "${COLOR_RED}[ERROR]${COLOR_RESET} $1"
}

is_true() {
  local raw
  raw="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  [[ "$raw" == "1" || "$raw" == "true" || "$raw" == "yes" || "$raw" == "y" ]]
}

python_supported() {
  local py="$1"
  "$py" - <<'PY' >/dev/null 2>&1
import sys
ok = (3, 10) <= sys.version_info[:2] < (3, 14)
raise SystemExit(0 if ok else 1)
PY
}

resolve_python() {
  local candidate
  for candidate in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$candidate" >/dev/null 2>&1 && python_supported "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

for arg in "$@"; do
  case "$arg" in
    --clean) RUN_CLEANUP=true ;;
    --verify) RUN_VERIFY=true ;;
    --no-dev-tools) INSTALL_DEV_TOOLS=false ;;
    --skip-dashboard) INSTALL_DASHBOARD=false ;;
    --skip-openapi) GENERATE_OPENAPI=false ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log_err "Unknown option: $arg"
      usage
      exit 1
      ;;
  esac
done

log_step "OptiOra fancy local setup"

if [ "$RUN_CLEANUP" = "true" ]; then
  log_step "Cleaning workspace"
  ./scripts/cleanup-workspace.sh
fi

log_step "Checking prerequisites"
if ! command -v npm >/dev/null 2>&1; then
  log_err "npm is required but was not found"
  exit 1
fi

PYTHON_BIN="$(resolve_python || true)"
if [ -z "$PYTHON_BIN" ]; then
  log_err "No supported Python found (requires >=3.10 and <3.14)"
  exit 1
fi
log_ok "Using Python: $PYTHON_BIN"
log_ok "Using npm: $(npm --version)"

log_step "Preparing virtual environment"
if [ -d ".venv" ] && { [ ! -x ".venv/bin/python" ] || ! python_supported ".venv/bin/python"; }; then
  log_warn "Existing .venv uses an unsupported Python version; recreating .venv"
  rm -rf .venv
fi

if [ ! -d ".venv" ]; then
  "$PYTHON_BIN" -m venv .venv
  log_ok "Created .venv"
else
  log_ok "Reusing existing .venv"
fi

.venv/bin/python -m pip install --upgrade pip
.venv/bin/pip install -e .
log_ok "Installed backend package"

if [ "$INSTALL_DEV_TOOLS" = "true" ]; then
  .venv/bin/pip install \
    "pytest>=9,<10" \
    "ruff>=0.1,<0.2" \
    "mypy>=1.5,<2" \
    "black>=23,<24"
  log_ok "Installed backend dev toolchain"
else
  log_warn "Skipped backend dev toolchain install"
fi

if [ "$INSTALL_DASHBOARD" = "true" ]; then
  log_step "Installing dashboard dependencies"
  (
    cd dashboard
    npm install
  )
  log_ok "Installed dashboard dependencies"
else
  log_warn "Skipped dashboard dependency install"
fi

if [ "$GENERATE_OPENAPI" = "true" ]; then
  log_step "Generating OpenAPI client"
  PYTHONPATH=. .venv/bin/python scripts/generate_openapi_client.py
  log_ok "Generated dashboard OpenAPI client"
else
  log_warn "Skipped OpenAPI client generation"
fi

if [ "$RUN_VERIFY" = "true" ]; then
  log_step "Running verification"
  .venv/bin/python -m py_compile $(find ./optiora_backend -name '*.py')
  .venv/bin/python -m pytest -q tests/test_config.py
  ./scripts/check-animated-svg-routes.sh
  if [ "$INSTALL_DASHBOARD" = "true" ]; then
    (
      cd dashboard
      npm run type-check
      npm run lint
    )
  fi
  log_ok "Verification checks passed"
fi

cat <<'EOF'

Setup complete.

Next commands:
  .venv/bin/optiora
  cd dashboard && npm run dev

Optional full verification:
  .venv/bin/python -m pytest -q
  cd dashboard && npm run build
  terraform -chdir=terraform validate
EOF
