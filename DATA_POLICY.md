# OptiOra Data Policy & GenAI Scope Guidelines

## 1. Real Data Usage Policy

### Principle: Production Uses Real Data Only

OptiOra is designed to work with **real, production cloud cost data** from your AWS, Azure, GCP, and OCI environments. There is **no fake or hardcoded data** in the core system.

#### Data Sources
- **Cloud Provider APIs**: Direct API calls to AWS Cost Explorer, Azure Cost Management, GCP BigQuery, OCI Cost Analysis
- **External Ingestion**: AWS EventBridge, GCP Pub/Sub, webhook endpoints
- **Manual Imports**: CSV uploads for finance team data or backfill scenarios
- **Connector Framework**: CloudHealth, Spot (Cloudyn), OpenCost integrations

#### Data Integrity
✅ All cost data comes from authoritative cloud provider sources
✅ No fabricated or synthetic cost data in production
✅ Audit logging for all data ingestion
✅ Data validation on import (schema, currency, ranges)

---

## 2. Demo & Presentation Workflows

### Using Demo Data for Presentations

For **demos and presentations only**, use the `demo.sh` script to load realistic but fabricated data:

```bash
# Load standard demo dataset
./demo.sh load

# Load large dataset (simulating 500+ resources)
./demo.sh large

# Clean demo data
./demo.sh clean

# Reset and reload
./demo.sh reset
```

### Demo Data Characteristics
- **Realistic values**: Cost amounts match real-world patterns ($2K–$50K anomalies)
- **Diverse scenarios**: Multiple cloud providers, services, and regions
- **Named examples**: EC2 compute, S3 storage, data transfer, GCP budgets
- **Audit trail**: Demo data is clearly marked in logs

### Demo Data Scope
- AWS anomalies (3 samples)
- GCP budget alerts (2 samples)
- Alert routing policies
- Business mapping rules
- Virtual tag rules
- Export jobs
- Scorecard rules

**Important**: Demo data is environment-isolated and does not affect production deployments.

---

## 3. GenAI Scope Restrictions

### Principle: FinOps Context Only

OptiOra's GenAI assistant is **strictly scoped to FinOps and cloud infrastructure domains**. Out-of-scope queries are automatically rejected.

### GenAI Allowed Topics
✅ Cloud cost analysis (AWS, Azure, GCP, OCI)
✅ Budget management and forecasting
✅ Resource optimization and rightsizing
✅ Unit economics and cost allocation
✅ Cloud infrastructure analysis
✅ FinOps best practices and governance
✅ Chargeback models and cost attribution
✅ Reserved instances and commitment discounts

### GenAI Blocked Topics
❌ Politics, current events, elections
❌ Personal finance or investment advice
❌ General knowledge outside FinOps
❌ Legal, HR, or employment advice
❌ Medical, health, or personal advice
❌ Entertainment, sports, recipes
❌ Any topic unrelated to cloud infrastructure

### Enforcement

#### Client-Side Validation
- JavaScript scope checker blocks queries before API call
- Keywords checked against FinOps domain vocabulary
- Blocked phrases rejected with user-friendly message

#### Server-Side Validation
- Python `genai_scope.py` provides comprehensive scope validation
- Relevance scoring (0.0–1.0) with threshold enforcement
- Detailed reason for rejection
- Audit logging of blocked queries

#### GenAI System Prompt
- Explicit instructions constraining model to FinOps context
- Refusal patterns for out-of-scope topics
- Data grounding on customer's OptiOra metrics only

### Example Interactions

#### ✅ Accepted Query
```
User: "We're seeing a spike in EC2 costs in us-east-1. What could be causing this?"
Assistant: "Based on your cost data, the most likely causes are..."
```

#### ❌ Rejected Query
```
User: "What do you think about cryptocurrency as an investment?"
Assistant: "This GenAI assistant is restricted to FinOps and cloud cost analysis. 
Please ask about: cost optimization, budget tracking, resource allocation, 
or cloud infrastructure analysis."
```

---

## 4. Data Privacy & Environment Isolation

### Customer Data Isolation
- Each organization has isolated data store (`organization_id` partitioning)
- Multi-tenant isolation enforced at database layer
- RBAC controls (OWNER, ADMIN, ANALYST, READONLY)
- Audit logs track all data access

### GenAI Context Boundaries
- GenAI receives **only customer's own data** (no cross-customer data leakage)
- System prompt includes customer's actual cost metrics
- Responses grounded in customer's OptiOra deployment

### Credential Security
- No credentials exposed in responses
- API keys stored encrypted
- External ingest tokens rate-limited
- Audit trail for all authentication attempts

---

## 5. Deployment Guidance

### Production Deployment
1. **Disable demo data**: Remove or don't execute `demo.sh`
2. **Connect real cloud accounts**: Configure AWS/Azure/GCP/OCI credentials
3. **Enable authentication**: Set `ENABLE_AUTH=true`
4. **GenAI scope active**: Scope validation enabled by default
5. **Monitor logs**: Review audit logs for data ingestion

### Development/Testing Deployment
1. **Use demo.sh for demos**: Load sample data for feature showcases
2. **GenAI scope enforced**: Even in dev, scope restrictions active
3. **Keep isolation**: Never mix production and demo data in same org

### Demo Deployment (External Presentations)
1. **Load demo data**: `./demo.sh load`
2. **Disable real integrations**: Comment out cloud provider credentials
3. **Use GenAI**: Scope restrictions still enforced; only FinOps queries allowed
4. **Reset after demo**: `./demo.sh clean`

---

## 6. Data Quality & Validation

### Cost Data Validation
- **Schema validation**: Required fields (provider, cost_usd, period)
- **Range checks**: Negative costs rejected, extreme outliers flagged
- **Duplicate detection**: Idempotency keys prevent re-ingestion
- **Timestamp validation**: Dates within reasonable bounds

### Import Process
```
CSV/API → Validation → Audit Log → Database
           ↓
        On Error: Reject & Log
```

### Audit Trail
- All data ingestion logged with: timestamp, source, count, actor
- Failed imports captured with error reason
- Data retention policy: 90 days default, configurable

---

## 7. Demo Data Examples

### AWS Anomaly (Real Pattern)
```json
{
  "anomalyId": "demo-aws-001",
  "monitorName": "Production EC2 Compute",
  "severity": "high",
  "impact": 5000,
  "rootCauses": ["Increased instance count in us-east-1"]
}
```

### GCP Budget Alert (Real Pattern)
```json
{
  "budgetDisplayName": "Production Compute Budget",
  "costAmount": 45000,
  "budgetAmount": 50000
}
```

Both use realistic AWS/GCP patterns while being clearly marked as demo data.

---

## 8. GenAI Scope Validation Examples

### Query: Calculate Reserved Instance ROI
**Scope Score**: 0.95 (In Scope) ✅
- Keywords: "Reserved Instance", "ROI", "cost optimization"
- System: Accepts and routes to GenAI

### Query: Who won the last election?
**Scope Score**: 0.0 (Out of Scope) ❌
- Keywords: None (no FinOps keywords)
- Blocked phrase: "election"
- System: Rejects with scope error

### Query: How can we reduce our cloud spend?
**Scope Score**: 0.85 (In Scope) ✅
- Keywords: "reduce", "cloud", "spend"
- System: Accepts and routes to GenAI

### Query: What's a good recipe for pasta?
**Scope Score**: 0.0 (Out of Scope) ❌
- Keywords: None
- Blocked phrase: "recipe"
- System: Rejects with scope error

---

## 9. Configuration

### Environment Variables

```bash
# GenAI Scope Enforcement
GENAI_STRICT_MODE=true              # Enable strict scope validation (default)
GENAI_MIN_SCORE_THRESHOLD=0.65      # Minimum relevance score (0.0-1.0)

# Data Policy
REQUIRE_LIVE_PROVIDER_DATA=true     # Prefer live provider data over demo/CSV-only mode
RETENTION_ENABLED=false             # Archive and purge cold cost rows when true
RETENTION_HOT_MONTHS=3              # Keep this many months in the database
RETENTION_RUN_INTERVAL_HOURS=24     # Background retention interval
OCI_ARCHIVE_BUCKET=                 # Object Storage bucket for NDJSON archives
OCI_ARCHIVE_NAMESPACE=              # Object Storage namespace

# Demo Mode
DEMO_MODE=false                     # Set true to load demo data on startup
DEMO_DATA_AUTO_RELOAD=false         # Reload demo data on restart

# Cloud Provider Integrations
AWS_COST_API_ENABLED=true           # Connect to real AWS Cost Explorer
AZURE_COST_API_ENABLED=true         # Connect to real Azure Cost Management
GCP_COST_API_ENABLED=true           # Connect to real GCP BigQuery
OCI_COST_API_ENABLED=true           # Connect to real OCI Cost Analysis

# Authentication
ENABLE_AUTH=true                    # Require authentication for API calls
RBAC_ENABLED=true                   # Enable role-based access control
```

### Runtime Checks

```bash
# Check GenAI scope enforcement status
curl http://localhost:8000/api/v1/info | grep genai

# View audit log for blocked GenAI queries
curl http://localhost:8000/api/v1/audit-logs?action=genai_blocked

# List current data sources
curl http://localhost:8000/api/v1/connectors
```

---

## 10. Support & Troubleshooting

### Q: My GenAI query was rejected. How do I fix it?
**A**: Rephrase your question to focus on FinOps topics:
- ❌ "Tell me a joke" → ✅ "How can I optimize our compute costs?"
- ❌ "What's the weather?" → ✅ "Which regions have highest data transfer costs?"

### Q: Can I use demo.sh in production?
**A**: No. `demo.sh` is for presentations and testing only. Use real cloud credentials in production.

### Q: How do I verify all data is from real sources?
**A**: Check the data source field in cost records:
```sql
SELECT source, COUNT(*) FROM cost_records GROUP BY source;
-- Real sources: aws, azure, gcp, oci, csv_import, connector_name
-- Demo sources: demo-aws, demo-gcp (only if demo.sh was used)
```

### Q: Can I extend GenAI scope to other domains?
**A**: Scope restrictions are security controls. For domain-specific extensions, contact your implementation team.

---

## Summary

| Aspect | Policy |
|--------|--------|
| **Production Data** | Real cloud provider APIs only |
| **Demo Data** | `demo.sh` for presentations |
| **GenAI Scope** | FinOps & cloud infrastructure only |
| **Data Isolation** | Multi-tenant with org-level partition |
| **Validation** | Schema, ranges, duplicates checked |
| **Audit Trail** | All data access logged |
| **Enforcement** | Client + server-side validation |

OptiOra is designed for **production financial operations** with **secure, real data** and **focused GenAI assistance** constrained to cloud cost optimization.
