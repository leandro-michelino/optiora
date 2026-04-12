#!/bin/bash

################################################################################
# OptiOra Project Verification Script
# 
# Verifies that your system is properly configured to run OptiOra locally
# and prepare for OCI deployment
################################################################################

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

log_pass() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASS++))
}

log_fail() {
    echo -e "${RED}❌ $1${NC}"
    ((FAIL++))
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((WARN++))
}

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Main verification
main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║          OptiOra Project Verification                      ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    
    # Check Python
    log_header "Python Environment"
    
    if command -v python3 &> /dev/null; then
        PY_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
        log_pass "Python 3 found: $PY_VERSION"
        
        # Check Python version
        if python3 -c "import sys; exit(0 if sys.version_info >= (3, 10) else 1)" 2>/dev/null; then
            log_pass "Python 3.10+ requirement met"
        else
            log_fail "Python must be 3.10 or higher (current: $PY_VERSION)"
        fi
    else
        log_fail "Python 3 not found"
    fi
    
    # Check virtual environment
    if [ -d ".venv" ]; then
        log_pass "Virtual environment exists (.venv)"
    else
        log_warn "Virtual environment not found (.venv)"
        log_info "Create with: python3 -m venv .venv"
    fi
    
    # Check Node.js
    log_header "Node.js Environment"
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version 2>&1)
        log_pass "Node.js found: $NODE_VERSION"
        
        # Check version
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | cut -d'v' -f2)
        if [ "$NODE_MAJOR" -ge 18 ]; then
            log_pass "Node.js 18+ requirement met"
        else
            log_fail "Node.js must be 18 or higher (current: $NODE_VERSION)"
        fi
    else
        log_fail "Node.js not found (required for frontend)"
    fi
    
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version 2>&1)
        log_pass "npm found: v$NPM_VERSION"
    else
        log_fail "npm not found"
    fi
    
    # Check OCI
    log_header "OCI Configuration"
    
    if command -v oci &> /dev/null; then
        OCI_VERSION=$(oci --version 2>&1 | head -1)
        log_pass "OCI CLI found: $OCI_VERSION"
    else
        log_warn "OCI CLI not found (required for deployment)"
        log_info "Install with: brew install oci-cli"
    fi
    
    if [ -f ~/.oci/config ]; then
        log_pass "OCI config found (~/.oci/config)"
    else
        log_warn "OCI config not found (required for deployment)"
        log_info "Create with: oci setup config"
    fi
    
    # Check project files
    log_header "Project Structure"
    
    if [ -f "pyproject.toml" ]; then
        log_pass "pyproject.toml found"
    else
        log_fail "pyproject.toml not found"
    fi
    
    if [ -f ".env.example" ]; then
        log_pass ".env.example found"
    else
        log_fail ".env.example not found"
    fi
    
    if [ -d "finops_mcp" ]; then
        PYTHON_FILES=$(find finops_mcp -name "*.py" | wc -l)
        log_pass "Backend found ($PYTHON_FILES Python files)"
    else
        log_fail "Backend (finops_mcp) not found"
    fi
    
    if [ -d "dashboard" ]; then
        if [ -f "dashboard/package.json" ]; then
            log_pass "Frontend found (dashboard)"
        else
            log_fail "Frontend package.json not found"
        fi
    else
        log_fail "Frontend (dashboard) not found"
    fi
    
    if [ -f "deploy/deploy-oci.sh" ]; then
        if [ -x "deploy/deploy-oci.sh" ]; then
            log_pass "Deploy script found and executable"
        else
            log_warn "Deploy script found but not executable"
            log_info "Fix with: chmod +x deploy/deploy-oci.sh"
        fi
    else
        log_fail "Deploy script not found"
    fi
    
    # Check dependencies
    log_header "Dependencies"
    
    if [ -f "dashboard/node_modules/.package-lock.json" ] || [ -d "dashboard/node_modules" ]; then
        log_pass "Frontend dependencies installed"
    else
        log_warn "Frontend dependencies not installed"
        log_info "Install with: cd dashboard && npm install"
    fi
    
    # Check documentation
    log_header "Documentation"
    
    DOCS=(
        "README.md"
        "SETUP.md"
        "OCI_DEPLOYMENT.md"
        "ARCHITECTURE_COMPLETE.md"
        "PROJECT_STATUS.md"
    )
    
    for doc in "${DOCS[@]}"; do
        if [ -f "$doc" ]; then
            log_pass "$doc found"
        else
            log_fail "$doc not found"
        fi
    done
    
    # Docker check (should NOT exist)
    log_header "OCI-Only Validation"
    
    if [ ! -f "Dockerfile" ] && [ ! -f "docker-compose.yml" ]; then
        log_pass "No Docker files found (OCI-only enforced)"
    else
        if [ -f "Dockerfile" ]; then
            log_fail "Dockerfile should not exist (OCI-only model)"
        fi
        if [ -f "docker-compose.yml" ]; then
            log_fail "docker-compose.yml should not exist (OCI-only model)"
        fi
    fi
    
    # Summary
    log_header "Verification Summary"
    
    TOTAL=$((PASS + FAIL + WARN))
    
    echo ""
    echo "Results:"
    echo "  ${GREEN}✅ Passed: $PASS${NC}"
    
    if [ $WARN -gt 0 ]; then
        echo "  ${YELLOW}⚠️  Warnings: $WARN${NC}"
    fi
    
    if [ $FAIL -gt 0 ]; then
        echo "  ${RED}❌ Failed: $FAIL${NC}"
    fi
    
    echo "  Total: $TOTAL"
    echo ""
    
    if [ $FAIL -eq 0 ]; then
        echo -e "${GREEN}✅ All critical checks passed!${NC}"
        echo ""
        echo "Next steps:"
        echo "  1. Test backend: poetry run python -m finops_mcp.server"
        echo "  2. Test frontend: cd dashboard && npm run dev"
        echo "  3. Deploy: ./deploy/deploy-oci.sh compute"
        echo ""
        return 0
    else
        echo -e "${RED}❌ Some checks failed. Fix above issues before proceeding.${NC}"
        echo ""
        return 1
    fi
}

main
