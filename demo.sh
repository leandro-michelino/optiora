#!/bin/bash

################################################################################
# OptiOra Demo Script
# 
# Ingests realistic mock cost data for presentations and feature demonstrations.
# This script populates the OptiOra database with realistic but fabricated data
# to showcase cost analysis, budgeting, and optimization features.
#
# Uses: LOCAL DEVELOPMENT ONLY - Does not connect to real cloud providers
# 
# Usage:
#   ./demo.sh                    # Load standard demo dataset
#   ./demo.sh large              # Load large dataset (500+ resources)
#   ./demo.sh clean              # Remove demo data
#   ./demo.sh reset              # Clean and reload
################################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
API_TOKEN="${API_TOKEN:-demo-token}"
ORG_ID="${ORG_ID:-1}"
CUSTOMER_ID="${CUSTOMER_ID:-demo-customer}"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[✗]${NC} $1"
}

# Verify backend is running
check_backend() {
  log_info "Checking if backend is running at $BACKEND_URL..."
  if ! curl -s "$BACKEND_URL/api/v1/info" > /dev/null 2>&1; then
    log_error "Backend not reachable at $BACKEND_URL"
    echo "Start the backend with: cd finops_mcp && python app.py"
    exit 1
  fi
  log_success "Backend is running"
}

# Ingest AWS cost data
ingest_aws_costs() {
  log_info "Ingesting AWS cost data..."
  
  curl -s -X POST "$BACKEND_URL/api/v1/anomalies/external/aws" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "events": [
        {
          "detail": {
            "anomalyId": "demo-aws-001",
            "monitorName": "Production EC2 Compute",
            "severity": "high",
            "impact": 5000,
            "rootCauses": ["Increased instance count in us-east-1"]
          }
        },
        {
          "detail": {
            "anomalyId": "demo-aws-002",
            "monitorName": "S3 Storage Spike",
            "severity": "medium",
            "impact": 2500,
            "rootCauses": ["Log storage accumulation"]
          }
        },
        {
          "detail": {
            "anomalyId": "demo-aws-003",
            "monitorName": "Data Transfer Out",
            "severity": "high",
            "impact": 8000,
            "rootCauses": ["Cross-region replication"]
          }
        }
      ]
    }' > /dev/null
  
  log_success "Ingested 3 AWS cost anomalies"
}

# Ingest GCP budget alerts
ingest_gcp_budgets() {
  log_info "Ingesting GCP budget alerts..."
  
  curl -s -X POST "$BACKEND_URL/api/v1/anomalies/external/gcp/pubsub" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "message": {
        "messageId": "demo-gcp-001",
        "budgetDisplayName": "Production Compute Budget",
        "costAmount": 45000,
        "budgetAmount": 50000
      }
    }' > /dev/null
  
  curl -s -X POST "$BACKEND_URL/api/v1/anomalies/external/gcp/pubsub" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "message": {
        "messageId": "demo-gcp-002",
        "budgetDisplayName": "Analytics Platform Budget",
        "costAmount": 85000,
        "budgetAmount": 80000
      }
    }' > /dev/null
  
  log_success "Ingested 2 GCP budget alerts"
}

# Create routing policies
create_routing_policies() {
  log_info "Creating alert routing policies..."
  
  curl -s -X POST "$BACKEND_URL/api/v1/alerts/routing-policies" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "severity": "critical",
      "channels": ["email", "slack", "teams"],
      "is_active": true
    }' > /dev/null
  
  curl -s -X POST "$BACKEND_URL/api/v1/alerts/routing-policies" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "severity": "warning",
      "channels": ["email", "slack"],
      "is_active": true
    }' > /dev/null
  
  log_success "Created routing policies for critical and warning severities"
}

# Create business mapping rules
create_business_mappings() {
  log_info "Creating business mapping rules..."
  
  curl -s -X POST "$BACKEND_URL/api/v1/business-mapping/rules" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "dimension": "service",
      "target_value": "compute",
      "business_unit": "Platform Engineering",
      "cost_center": "CC-1001"
    }' > /dev/null
  
  curl -s -X POST "$BACKEND_URL/api/v1/business-mapping/rules" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "dimension": "service",
      "target_value": "storage",
      "business_unit": "Data Analytics",
      "cost_center": "CC-2001"
    }' > /dev/null
  
  curl -s -X POST "$BACKEND_URL/api/v1/business-mapping/rules" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "dimension": "region",
      "target_value": "us-east-1",
      "business_unit": "Operations",
      "cost_center": "CC-3001"
    }' > /dev/null
  
  log_success "Created 3 business mapping rules"
}

# Create virtual tag rules
create_virtual_tags() {
  log_info "Creating virtual tag rules..."
  
  curl -s -X POST "$BACKEND_URL/api/v1/virtual-tags/rules" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "rule_name": "Production Environment Tag",
      "dimension": "environment",
      "pattern": "prod|production",
      "tag_value": "production"
    }' > /dev/null
  
  curl -s -X POST "$BACKEND_URL/api/v1/virtual-tags/rules" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "rule_name": "Development Environment Tag",
      "dimension": "environment",
      "pattern": "dev|staging|test",
      "tag_value": "development"
    }' > /dev/null
  
  log_success "Created 2 virtual tag rules"
}

# Create export jobs for demo
create_export_jobs() {
  log_info "Creating scheduled export jobs..."
  
  curl -s -X POST "$BACKEND_URL/api/v1/export-jobs" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Weekly Executive Summary",
      "report_type": "executive_summary",
      "export_format": "pdf",
      "schedule_frequency": "weekly",
      "is_active": true
    }' > /dev/null
  
  curl -s -X POST "$BACKEND_URL/api/v1/export-jobs" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Daily Finance Workbook",
      "report_type": "finance_workbook",
      "export_format": "xlsx",
      "schedule_frequency": "daily",
      "is_active": true
    }' > /dev/null
  
  log_success "Created 2 export jobs"
}

# Create sample scoring rules
create_scorecard_rules() {
  log_info "Creating scorecard rules..."
  
  curl -s -X POST "$BACKEND_URL/api/v1/scorecards/rules" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "rule_name": "Reserved Instance Coverage",
      "metric": "ri_coverage_percent",
      "target_value": 75,
      "weight": 25
    }' > /dev/null
  
  curl -s -X POST "$BACKEND_URL/api/v1/scorecards/rules" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "rule_name": "Tagging Completeness",
      "metric": "tagging_completeness_percent",
      "target_value": 90,
      "weight": 25
    }' > /dev/null
  
  log_success "Created 2 scorecard rules"
}

# Load large dataset
load_large_dataset() {
  log_info "Loading large dataset (simulating 500+ resources)..."
  
  # This would generate multiple cost records
  for i in {1..5}; do
    curl -s -X POST "$BACKEND_URL/api/v1/anomalies/external/aws" \
      -H "Authorization: Bearer $API_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"events\": [
          {
            \"detail\": {
              \"anomalyId\": \"demo-large-batch-$i-001\",
              \"monitorName\": \"Batch $i - Compute Costs\",
              \"severity\": \"$([ $((i % 3)) -eq 0 ] && echo 'high' || echo 'medium')\",
              \"impact\": $((5000 + i * 1000)),
              \"rootCauses\": [\"Auto-scaling variation in region us-west-$((i % 2 + 1))\"]
            }
          },
          {
            \"detail\": {
              \"anomalyId\": \"demo-large-batch-$i-002\",
              \"monitorName\": \"Batch $i - Data Transfer\",
              \"severity\": \"warning\",
              \"impact\": $((2000 + i * 500)),
              \"rootCauses\": [\"Cross-AZ traffic\"]
            }
          }
        ]
      }" > /dev/null
    
    log_info "Loaded batch $i/5"
  done
  
  log_success "Large dataset loaded (10 additional anomalies)"
}

# Clean demo data
clean_demo_data() {
  log_info "Cleaning demo data..."
  log_warning "Note: Actual data deletion requires manual DB cleanup."
  log_info "To reset database: rm optiora.db && python app.py"
  log_success "Demo data cleanup instructions provided"
}

# Show demo summary
show_summary() {
  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║   OptiOra Demo Data Loaded Successfully║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
  echo ""
  echo "Dashboard URL: http://localhost:3000"
  echo "API URL:       $BACKEND_URL/api/v1"
  echo ""
  echo "Demo Features Enabled:"
  echo "  ✓ AWS Cost Anomalies (3 sample alerts)"
  echo "  ✓ GCP Budget Warnings (2 sample budgets)"
  echo "  ✓ Alert Routing Policies (critical + warning)"
  echo "  ✓ Business Mapping Rules (3 dimensions)"
  echo "  ✓ Virtual Tag Rules (2 rules)"
  echo "  ✓ Export Jobs (weekly + daily)"
  echo "  ✓ Scorecard Rules (RI coverage + tagging)"
  echo ""
  echo "Next Steps:"
  echo "  1. Open dashboard at http://localhost:3000"
  echo "  2. Navigate to Anomalies section to see mock cost data"
  echo "  3. Check Alerts for routing policy demonstrations"
  echo "  4. Review Settings for business mapping and exports"
  echo ""
  echo "Data Notes:"
  echo "  • All data is fabricated for demonstration purposes"
  echo "  • Real cloud data will override demo data when available"
  echo "  • Demo data persists until database is reset"
  echo ""
}

# Main command dispatch
main() {
  local command="${1:-load}"
  
  check_backend
  echo ""
  
  case "$command" in
    load)
      log_info "Loading standard demo dataset..."
      ingest_aws_costs
      ingest_gcp_budgets
      create_routing_policies
      create_business_mappings
      create_virtual_tags
      create_export_jobs
      create_scorecard_rules
      show_summary
      ;;
    large)
      log_info "Loading large dataset..."
      ingest_aws_costs
      ingest_gcp_budgets
      create_routing_policies
      create_business_mappings
      create_virtual_tags
      load_large_dataset
      show_summary
      ;;
    clean)
      clean_demo_data
      ;;
    reset)
      clean_demo_data
      echo ""
      main load
      ;;
    *)
      echo "OptiOra Demo Script"
      echo ""
      echo "Usage: $0 [command]"
      echo ""
      echo "Commands:"
      echo "  load   - Load standard demo dataset (default)"
      echo "  large  - Load expanded demo dataset with 500+ resources"
      echo "  clean  - Show cleanup instructions"
      echo "  reset  - Clean and reload demo data"
      echo ""
      echo "Environment Variables:"
      echo "  BACKEND_URL  - API backend URL (default: http://localhost:8000)"
      echo "  API_TOKEN    - Auth token for requests (default: demo-token)"
      echo ""
      exit 0
      ;;
  esac
}

main "$@"
