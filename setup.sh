#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_INSTALL_TOOLS="${AUTO_INSTALL_TOOLS:-false}"
SKIP_BACKEND=false
SKIP_DASHBOARD=false
SKIP_TERRAFORM=false
INTERACTIVE=false
PYTHON_CMD=""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
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

print_banner() {
  cat <<EOF
${CYAN}${BOLD}
============================================================
                    OPTIORA SETUP WIZARD
============================================================${NC}
EOF
}

print_section() {
  echo
  echo -e "${CYAN}${BOLD}>> $1${NC}"
}

prompt_value() {
  local label="$1"
  local default_value="${2:-}"
  local answer

  if [[ -n "$default_value" ]]; then
    read -r -p "$label [$default_value]: " answer
    if [[ -z "$answer" ]]; then
      echo "$default_value"
      return 0
    fi
    echo "$answer"
    return 0
  fi

  read -r -p "$label: " answer
  echo "$answer"
}

prompt_yes_no() {
  local label="$1"
  local default_yes="${2:-true}"
  local answer
  local suffix="[Y/n]"

  if [[ "$default_yes" != "true" ]]; then
    suffix="[y/N]"
  fi

  read -r -p "$label $suffix " answer
  case "${answer,,}" in
    y|yes) return 0 ;;
    n|no) return 1 ;;
    "") [[ "$default_yes" == "true" ]] && return 0 || return 1 ;;
    *) [[ "$default_yes" == "true" ]] && return 0 || return 1 ;;
  esac
}

read_tfvar() {
  local key="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    return 0
  fi
  sed -n "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*\"\(.*\)\"[[:space:]]*$/\1/p" "$file" | head -n 1
}

upsert_tfvar() {
  local key="$1"
  local value="$2"
  local file="$3"
  local escaped
  local tmp_file

  escaped="${value//\"/\\\"}"
  tmp_file="$(mktemp)"

  if [[ ! -f "$file" ]]; then
    touch "$file"
  fi

  if grep -Eq "^[[:space:]]*${key}[[:space:]]*=" "$file"; then
    awk -v k="$key" -v v="$escaped" '
      BEGIN { updated = 0 }
      $0 ~ "^[[:space:]]*" k "[[:space:]]*=" {
        print k " = \"" v "\""
        updated = 1
        next
      }
      { print }
      END {
        if (updated == 0) {
          print k " = \"" v "\""
        }
      }
    ' "$file" > "$tmp_file"
  else
    cat "$file" > "$tmp_file"
    echo "${key} = \"${escaped}\"" >> "$tmp_file"
  fi

  mv "$tmp_file" "$file"
}

python_supported() {
  local cmd="$1"
  "$cmd" -c 'import sys; sys.exit(0 if (3, 10) <= sys.version_info[:2] < (3, 14) else 1)' \
    >/dev/null 2>&1
}

resolve_python_cmd() {
  local candidates=("python3" "python3.13" "python3.12" "python3.11" "python3.10")
  local version

  for candidate in "${candidates[@]}"; do
    if ! command -v "$candidate" >/dev/null 2>&1; then
      continue
    fi

    if python_supported "$candidate"; then
      PYTHON_CMD="$candidate"
      version="$("$candidate" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")')"
      log_ok "Using ${candidate} (${version}) for backend setup"
      return 0
    fi
  done

  log_err "No supported Python interpreter found. OptiOra currently supports Python 3.10 through 3.13."
  exit 1
}

usage() {
  cat <<'EOF'
OptiOra setup script

Usage:
  ./setup.sh [options]

Options:
  --auto-install-tools  Install missing core tools with Homebrew (macOS) when possible.
  --interactive         Run interactive Terraform + Ansible end-to-end wizard.
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
      --interactive)
        INTERACTIVE=true
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
    "${PYTHON_CMD}" -m venv .venv
    log_ok "Created virtual environment at .venv"
  else
    if ! .venv/bin/python -c 'import sys; sys.exit(0 if (3, 10) <= sys.version_info[:2] < (3, 14) else 1)' >/dev/null 2>&1; then
      local venv_version
      venv_version=$(.venv/bin/python -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")' 2>/dev/null || echo "unknown")
      log_err "Existing .venv uses unsupported Python ${venv_version}. Remove .venv and rerun setup."
      exit 1
    fi
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

run_interactive_tf_ansible() {
  local tfvars_path="${ROOT_DIR}/terraform/terraform.tfvars"
  local inv_path="${ROOT_DIR}/ansible/inventory.yml"
  local compartment_id
  local laptop_cidr
  local obj_namespace
  local host_ip
  local ssh_user
  local ssh_key

  print_section "Interactive Infrastructure Wizard"
  log_info "This flow configures Terraform variables, optionally applies Terraform,"
  log_info "then prepares Ansible inventory and optionally runs provisioning."

  if [[ ! -f "$tfvars_path" && -f "${ROOT_DIR}/terraform/terraform.tfvars.example" ]]; then
    cp "${ROOT_DIR}/terraform/terraform.tfvars.example" "$tfvars_path"
    log_warn "Created terraform/terraform.tfvars from example"
  fi

  compartment_id="$(prompt_value "OCI compartment OCID (compartment_id)" "$(read_tfvar compartment_id "$tfvars_path")")"
  laptop_cidr="$(prompt_value "Laptop ingress CIDR (laptop_cidr)" "$(read_tfvar laptop_cidr "$tfvars_path")")"
  obj_namespace="$(prompt_value "OCI Object Storage namespace (oci_object_storage_namespace)" "$(read_tfvar oci_object_storage_namespace "$tfvars_path")")"

  if [[ -z "$compartment_id" || -z "$laptop_cidr" || -z "$obj_namespace" ]]; then
    log_err "compartment_id, laptop_cidr, and oci_object_storage_namespace are required."
    return 1
  fi

  upsert_tfvar "compartment_id" "$compartment_id" "$tfvars_path"
  upsert_tfvar "laptop_cidr" "$laptop_cidr" "$tfvars_path"
  upsert_tfvar "oci_object_storage_namespace" "$obj_namespace" "$tfvars_path"
  log_ok "Updated terraform/terraform.tfvars"

  print_section "Terraform"
  TMPDIR=/tmp terraform -chdir="${ROOT_DIR}/terraform" init
  TMPDIR=/tmp terraform -chdir="${ROOT_DIR}/terraform" validate
  TMPDIR=/tmp terraform -chdir="${ROOT_DIR}/terraform" plan -out=tfplan

  if prompt_yes_no "Apply Terraform plan now?" false; then
    TMPDIR=/tmp terraform -chdir="${ROOT_DIR}/terraform" apply tfplan
    log_ok "Terraform apply completed"
  else
    log_warn "Terraform apply skipped"
  fi

  print_section "Ansible Inventory"
  if [[ ! -f "$inv_path" && -f "${ROOT_DIR}/ansible/inventory.example.yml" ]]; then
    cp "${ROOT_DIR}/ansible/inventory.example.yml" "$inv_path"
    log_warn "Created ansible/inventory.yml from example"
  fi

  host_ip="$(prompt_value "Compute instance public IP (ansible_host)" "")"
  ssh_user="$(prompt_value "SSH user (ansible_user)" "opc")"
  ssh_key="$(prompt_value "SSH private key path" "~/.ssh/id_ed25519")"

  if [[ -z "$host_ip" ]]; then
    log_err "ansible_host is required to continue."
    return 1
  fi

  cat > "$inv_path" <<EOF
all:
  children:
    optiora:
      hosts:
        optiora-prod:
          ansible_host: ${host_ip}
          ansible_user: ${ssh_user}
          ansible_ssh_private_key_file: ${ssh_key}
EOF
  log_ok "Wrote ansible/inventory.yml"

  print_section "Provision Host With Ansible"
  if prompt_yes_no "Run ansible-playbook now?" true; then
    ansible-playbook -i "${ROOT_DIR}/ansible/inventory.yml" "${ROOT_DIR}/ansible/playbooks/site.yml"
    log_ok "Ansible provisioning completed"

    cat <<EOF

${CYAN}${BOLD}=================== DEPLOYMENT SUMMARY ===================${NC}
Dashboard:   http://${host_ip}:3000/dashboard
AI insights: http://${host_ip}:3000/dashboard/ai-insights
Cost advisor:http://${host_ip}:3000/dashboard/cost-advisor
API health:  http://${host_ip}:8000/health
API info:    http://${host_ip}:8000/api/v1/info
${CYAN}${BOLD}==========================================================${NC}
EOF
  else
    log_warn "Skipped ansible-playbook execution"
  fi
}

main() {
  print_banner
  log_info "Starting OptiOra environment bootstrap in ${ROOT_DIR}"

  ensure_tool terraform terraform "Infrastructure provisioning"
  ensure_tool python3 python "Backend runtime"
  ensure_tool node node "Dashboard runtime"
  ensure_tool npm node "Dashboard package manager"
  ensure_tool jq jq "Utility used by deployment scripts"
  resolve_python_cmd

  log_info "Checking optional deployment tools..."
  check_optional_tool oci oci-cli "OCI provisioning and deployment"
  check_optional_tool ssh openssh "Remote VM access"
  check_optional_tool scp openssh "Artifact copy to VM"
  check_optional_tool tar gnu-tar "Packaging deployment bundles"
  check_optional_tool base64 coreutils "Encoding values in deployment flows"
  check_optional_tool ansible-playbook ansible "Host provisioning"

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

  if [[ "$SKIP_TERRAFORM" == "false" && "$INTERACTIVE" == "false" ]]; then
    setup_terraform
  elif [[ "$INTERACTIVE" == "true" ]]; then
    log_info "Skipping standalone Terraform preflight (handled in interactive wizard)"
  else
    log_warn "Skipping Terraform setup"
  fi

  if [[ "$INTERACTIVE" == "true" ]]; then
    ensure_tool ansible-playbook ansible "Host provisioning"
    run_interactive_tf_ansible
  fi

  cat <<'EOF'

Setup complete.

Next steps:
  1) Backend: source .venv/bin/activate && optiora
  2) Dashboard: cd dashboard && npm run dev
  3) Terraform plan (example):
     terraform -chdir=terraform plan -var="compartment_id=<ocid>" -var="laptop_cidr=<ip>/32"
  4) End-to-end wizard:
     ./setup.sh --interactive
EOF
}

main
