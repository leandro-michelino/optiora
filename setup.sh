#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_INSTALL_TOOLS="${AUTO_INSTALL_TOOLS:-false}"
SKIP_BACKEND=false
SKIP_DASHBOARD=false
SKIP_TERRAFORM=false

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_ok() {
  echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_err() {
  echo -e "${RED}[ERROR]${NC} $1"
}

usage() {
  cat <<'EOF'
OptiOra setup script

Usage:
  ./setup.sh [options]

Options:
  --auto-install-tools  Install missing core tools with Homebrew (macOS) when possible.
  --skip-backend        Skip Python backend setup.
  --skip-dashboard      Skip Next.js dashboard setup.
  --skip-terraform      Skip Terraform init/validate setup.
  -h, --help            Show help.

Environment:
  AUTO_INSTALL_TOOLS=true   Same effect as --auto-install-tools.

What this sets up:
  1) Core tools (terraform, python3, node, npm, jq)
  2) Backend virtualenv + Python dependencies
  3) Dashboard Node dependencies
  4) Terraform init + validate and tfvars scaffold
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --auto-install-tools)
      AUTO_INSTALL_TOOLS=true
      shift
      ;;
    --skip-backend)
      SKIP_BACKEND=true
      shift
      ;;
    --skip-dashboard)
      SKIP_DASHBOARD=true
      shift
      ;;
    --skip-terraform)
      SKIP_TERRAFORM=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log_err "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

brew_install() {
  local pkg="$1"
  if command -v brew >/dev/null 2>&1; then
    log_info "Installing ${pkg} with Homebrew..."
    brew list "$pkg" >/dev/null 2>&1 || brew install "$pkg"
    return 0
  fi
  return 1
}

ensure_tool() {
  local cmd="$1"
  local brew_pkg="$2"
  local purpose="$3"

  if command -v "$cmd" >/dev/null 2>&1; then
    log_ok "Found ${cmd} (${purpose})"
    return 0
  fi

  log_warn "Missing ${cmd} (${purpose})"
  if [[ "$AUTO_INSTALL_TOOLS" == "true" ]]; then
    if brew_install "$brew_pkg"; then
      if command -v "$cmd" >/dev/null 2>&1; then
        log_ok "Installed ${cmd}"
        return 0
      fi
    fi
  fi

  cat <<EOF
Install ${cmd} and rerun setup:
  macOS (Homebrew): brew install ${brew_pkg}
EOF
  exit 1
}

check_optional_tool() {
  local cmd="$1"
  local brew_pkg="$2"
  local purpose="$3"

  if command -v "$cmd" >/dev/null 2>&1; then
    log_ok "Found ${cmd} (${purpose})"
    return 0
  fi

  log_warn "Missing optional tool ${cmd} (${purpose})"
  if [[ "$AUTO_INSTALL_TOOLS" == "true" ]]; then
    if brew_install "$brew_pkg"; then
      if command -v "$cmd" >/dev/null 2>&1; then
        log_ok "Installed ${cmd}"
        return 0
      fi
    fi
  fi

  cat <<EOF
Optional install:
  macOS (Homebrew): brew install ${brew_pkg}
EOF
}

setup_backend() {
  log_info "Setting up Python backend..."
  cd "${ROOT_DIR}"

  if [[ ! -d ".venv" ]]; then
    python3 -m venv .venv
    log_ok "Created virtual environment at .venv"
  else
    log_ok "Virtual environment already exists"
  fi

  # shellcheck disable=SC1091
  source .venv/bin/activate
  python -m pip install --upgrade pip setuptools wheel
  python -m pip install -e .
  deactivate
  log_ok "Backend dependencies installed"

  if [[ ! -f ".env" && -f ".env.example" ]]; then
    cp .env.example .env
    log_warn "Created .env from .env.example. Update values before running in production."
  fi
}

setup_dashboard() {
  log_info "Setting up dashboard dependencies..."
  cd "${ROOT_DIR}/dashboard"
  if [[ -f "package-lock.json" ]]; then
    npm ci
  else
    npm install
  fi
  log_ok "Dashboard dependencies installed"
}

setup_terraform() {
  log_info "Setting up Terraform workspace..."
  cd "${ROOT_DIR}"

  if [[ ! -f "terraform/terraform.tfvars" && -f "terraform/terraform.tfvars.example" ]]; then
    cp terraform/terraform.tfvars.example terraform/terraform.tfvars
    log_warn "Created terraform/terraform.tfvars from example. Replace placeholder values."
  fi

  TMPDIR=/tmp terraform -chdir=terraform init
  TMPDIR=/tmp terraform -chdir=terraform validate
  log_ok "Terraform initialized and validated"
}

main() {
  log_info "Starting OptiOra environment bootstrap in ${ROOT_DIR}"

  ensure_tool terraform terraform "Infrastructure provisioning"
  ensure_tool python3 python "Backend runtime"
  ensure_tool node node "Dashboard runtime"
  ensure_tool npm node "Dashboard package manager"
  ensure_tool jq jq "Utility used by deployment scripts"

  log_info "Checking optional deployment tools..."
  check_optional_tool oci oci-cli "OCI provisioning and deployment"
  check_optional_tool ssh openssh "Remote VM access"
  check_optional_tool scp openssh "Artifact copy to VM"
  check_optional_tool tar gnu-tar "Packaging deployment bundles"
  check_optional_tool base64 coreutils "Encoding values in deployment flows"

  if [[ "$SKIP_BACKEND" == "false" ]]; then
    setup_backend
  else
    log_warn "Skipping backend setup"
  fi

  if [[ "$SKIP_DASHBOARD" == "false" ]]; then
    setup_dashboard
  else
    log_warn "Skipping dashboard setup"
  fi

  if [[ "$SKIP_TERRAFORM" == "false" ]]; then
    setup_terraform
  else
    log_warn "Skipping Terraform setup"
  fi

  cat <<'EOF'

Setup complete.

Next steps:
  1) Backend: source .venv/bin/activate && python -m finops_mcp.app
  2) Dashboard: cd dashboard && npm run dev
  3) Terraform plan (example):
     terraform -chdir=terraform plan -var="compartment_id=<ocid>" -var="laptop_cidr=<ip>/32"
EOF
}

main
