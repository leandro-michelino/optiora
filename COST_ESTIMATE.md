# OptiOra Deployment - Cost Estimate

## Monthly Cost Breakdown (OCI Self-Hosted)

### 1. Compute Resources

#### Frontend Application Server (React/Next.js on App Service)
- **Instance Type:** OCI App Service (Standard - 2 ECPU, 4GB RAM)
- **Instances:** 2 (for HA)
- **Monthly Cost:** `2 × $0.08/hour × 730 hours = $116.80`
- **Estimated:** **$120/month**

#### Backend API Server (Python MCP on Container)
- **Instance Type:** OCI Container Instances (2 OCPU, 4GB RAM)
- **Instances:** 2 (for HA)
- **Monthly Cost:** `2 × $0.10/hour × 730 hours = $146`
- **Estimated:** **$150/month**

**Compute Subtotal: $270/month**

---

### 2. Database Services

#### PostgreSQL Database (OCI DBaaS)
- **Configuration:** Single node, 2 OCPU, 10GB storage
- **Monthly Cost:** `$0.275/OCPU-hour × 2 × 730 = $402.50`
- **Storage:** `$0.25/GB/month × 10 = $2.50`
- **Subtotal:** **$405/month**

#### Automated Backups (30-day retention)
- **Backup Storage:** `$0.03/GB/month × 10 = $0.30`
- **Estimated:** **$10/month** (conservative)

**Database Subtotal: $415/month**

---

### 3. Networking & Load Balancing

#### OCI Load Balancer
- **Hourly Rate:** `$0.025/hour × 730 = $18.25`
- **Data Processing:** `$0.006/GB × 100GB avg/month = $0.60`
- **Estimated:** **$25/month**

#### OCI WAF (Web Application Firewall)
- **Hourly Rate:** `$0.01/hour × 730 = $7.30`
- **Estimated:** **$10/month**

#### Bandwidth (Outbound)
- **First 10TB/month:** Free
- **Average Outbound:** ~50GB/month → **Free**

**Networking Subtotal: $35/month**

---

### 4. Storage Services

#### Object Storage (for logs, backups)
- **Standard tier:** `$0.0255/GB/month × 50GB = $1.28`
- **Estimated:** **$5/month**

#### Block Volume (for database backups)
- **Storage:** `$0.0425/GB/month × 20GB = $0.85`
- **Estimated:** **$5/month**

**Storage Subtotal: $10/month**

---

### 5. API & Data Transfer

#### OCI API Gateway
- **API calls:** `$0.01/1000 calls × 10M calls/month = $100`
- **Estimated:** **$100/month**

#### Bandwidth (Inbound)
- **Free tier included**
- **Estimated:** **$0/month**

**API Subtotal: $100/month**

---

### 6. Monitoring & Logging

#### OCI Monitoring (metrics, alarms)
- **Metric samples:** `$0.003/sample × 100K samples/day = $9/day = $270/month`
- **Conservative estimate:** **$100/month**

#### OCI Logging (application logs)
- **Log storage:** `$0.50/GB × 10GB/month = $5`
- **Log ingestion:** `$0.50/GB × 10GB/month = $5`
- **Estimated:** **$15/month**

**Monitoring Subtotal: $115/month**

---

### 7. Credential Management & Security

#### OCI Vault (for API keys, passwords)
- **Vault creation:** `$10/month per vault`
- **Key operations:** `$0.02/operation × 1000 ops/month = $20`
- **Estimated:** **$30/month**

#### Secrets Management
- **Included with Vault**
- **Estimated:** **$0/month**

**Security Subtotal: $30/month**

---

### 8. Optional Enhancement Services

#### Email Service (Notification alerts)
- **SendGrid API:** `$20/month` for 40K emails
- **Estimated:** **$20/month** (optional)

#### Slack/Teams Integration
- **Webhook calls:** Free
- **Estimated:** **$0/month**

---

## Summary Table

| Component | Cost/Month |
|-----------|-----------|
| **Frontend Compute** | $120 |
| **Backend Compute** | $150 |
| **Database (PostgreSQL)** | $415 |
| **Load Balancer** | $25 |
| **WAF** | $10 |
| **Storage** | $10 |
| **API Gateway** | $100 |
| **Monitoring & Logging** | $115 |
| **Security & Vault** | $30 |
| **Notifications (optional)** | $20 |
| **TOTAL (without optional)** | **$975/month** |
| **TOTAL (with optional)** | **$995/month** |

---

## Annual Costs

- **Standard Deployment:** `$975 × 12 = $11,700/year`
- **With Enhanced Services:** `$995 × 12 = $11,940/year`

---

## Cost Optimization Opportunities

### 1. **Reduce to Single Instance (Dev/Test)**
- **Frontend:** 1 instance × $60 = $60
- **Backend:** 1 instance × $75 = $75
- **Database:** Reduced tier $200
- **Total Reduction:** Save ~$400/month → **$595/month ($7,140/year)**

### 2. **Use Compute VMs instead of Managed Services**
- **Standard VMs (VM.Standard2.1):** `$0.034/hour × 730 = $24.82 each`
- **2 Frontend + 2 Backend servers:** `4 × $25 = $100/month`
- **Total Reduction:** Save ~$170/month → **$805/month ($9,660/year)**

### 3. **Consolidate Database (PostgreSQL on VM)**
- **Self-managed PostgreSQL:** ~$50/month (included in VM)
- **Total Reduction:** Save ~$365/month → **$610/month ($7,320/year)**

### 4. **Remove WAF for MVP**
- **Savings:** $10/month → **$965/month**

---

## High-Availability Deployment (Recommended)

| Environment | Monthly | Annual |
|-----------|---------|--------|
| **MVP/Dev** | $595 | $7,140 |
| **Staging** | $750 | $9,000 |
| **Production** | $995 | $11,940 |
| **All 3 Combined** | $2,340 | $28,080 |

---

## Comparison with Competitors

| Platform | FrontEnd | Backend | Database | Total/Month |
|----------|----------|---------|----------|------------|
| **OptiOra (OCI)** | $120 | $150 | $415 | **$975** |
| Vercel (Next.js) | $150 | — | — | **$150+** |
| AWS (equivalent) | $180 | $200 | $500 | **$880** |
| Google Cloud | $160 | $170 | $450 | **$780** |

**OptiOra on OCI is cost-competitive** and provides self-sovereign deployment.

---

## SaaS Model vs Self-Hosted

### SaaS Pricing (OptiOra Cloud - future option)
- **Starter:** $499/month (single cloud)
- **Professional:** $1,499/month (multi-cloud)
- **Enterprise:** $5,000+/month + 15% savings share

### Self-Hosted Pricing (Current)
- **Infrastructure:** $975/month (fixed cost)
- **Software:** Open-source (free)
- **Support:** Community or paid enterprise support

**Break-even:** ~2 customers on Starter tier cover infrastructure costs

---

## ROI & Revenue Projection

### Year 1 Projection (Self-Hosted Model)
```
Infrastructure Costs:  $11,940
Customer Acquisition:  $5,000 (marketing)
Development:           $30,000 (1 part-time dev)
Total Year 1 Cost:    ~$47,000

Conservative Revenue (2 Professional customers):
- 2 × $1,499 × 12 = $35,976

Year 1 Loss: -$11,024 (but foundation built)
```

### Year 2 Projection
```
Infrastructure:        $11,940
Development:           $40,000
Sales & Marketing:     $15,000
Total Cost:           ~$67,000

Revenue (Growth to 5 Professional customers):
- 5 × $1,499 × 12 = $89,880

Year 2 Net Profit: +$22,880
```

---

## Deployment Recommendation

For **MVP Launch:**
1. ✅ Deploy to OCI with HA setup ($995/month)
2. ✅ Use managed services (easier operations)
3. ✅ Monitor costs closely
4. ✅ Scale compute down if traffic is low

For **Production Scale:**
1. Consider cost optimization (reduce from 2→1 instances per tier)
2. Implement auto-scaling during peak hours
3. Use reserved capacity discounts (30% savings)
4. Monitor and optimize database queries

---

## Next Steps

1. **Validate with OCI Pricing Calculator:** https://www.oracle.com/cloud/price-list/
2. **Provision staging environment** and monitor actual costs
3. **Set up billing alerts** in OCI Console
4. **Document actual vs. estimated costs** monthly
5. **Adjust capacity based on usage patterns**

---

## Appendix: OCI Pricing References

- **Compute:** https://www.oracle.com/cloud/price-list/compute/
- **Database:** https://www.oracle.com/cloud/price-list/database/
- **Networking:** https://www.oracle.com/cloud/price-list/networking/
- **Storage:** https://www.oracle.com/cloud/price-list/storage/

**Last Updated:** April 2026  
**Next Review:** June 2026
