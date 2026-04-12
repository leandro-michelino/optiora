# OptiOra Architecture Clarification

## 🎯 Clear Definition: What Goes Where?

### **OptiOra Stack**

```
┌─────────────────────────────────────────────────────┐
│ Layer 1: Frontend (Multi-Cloud Dashboard)           │
├─────────────────────────────────────────────────────┤
│ React + Next.js                                     │
│ Hosted: Vercel or CloudFlare Pages                 │
│ URL: https://optiora.yourcompany.com               │
│                                                     │
│ Shows: AWS + Azure + GCP + OCI costs consolidated   │
│ (MCP runs on OCI infrastructure)                   │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ HTTPS API Calls
                   │ /api/tools/get_cost_summary
                   │ /api/tools/detect_anomalies
                   │ /api/tools/get_recommendations
                   │
        ┌──────────▼──────────┐
        │ Layer 2: MCP Server │
        ├──────────────────────┤
        │ Python + MCP         │
        │ Hosted: OCI Compute  │
        │ URL: api.optiora.io  │
        │                      │
        │ • Anomaly detection  │
        │ • Recommendations    │
        │ • Actions execution  │
        └──────────┬───────────┘
                   │
     ┌─────────┼──────────┬──────────┐
     │             │             │         │
     ▼             ▼             ▼         ▼
 ┌─────┐      ┌─────┐      ┌─────┐   ┌─────┐
 │ AWS │      │Azure│      │ GCP │   │ OCI │
 │     │      │     │      │     │   │     │
 │API: │      │API: │      │API: │   │API: │
 │Cost │      │Cost │      │Bill-│   │Usage│
 │Expl │      │Mgmt │      │ing  │   │API  │
 └─────┘      └─────┘      └─────┘   └─────┘

    Layer 3: Cloud Providers (Cost API Integration)
    - AWS Cost Explorer API
    - Azure Cost Management API  
    - GCP BigQuery Billing Export
    - OCI Usage API

        ┌──────────────────────────────────┐
        │ Layer 4: OCI Infrastructure       │
        ├──────────────────────────────────┤
        │ Compute: VM Instance (Host MCP)   │
        │ Database: PostgreSQL (Audit logs) │
        │ Storage: Object Storage (Data)    │
        │ API Gateway: Auth + Rate limit    │
        └──────────────────────────────────┘
```

---

## 🔑 Key Clarifications

### **What is OCI used for?**

✅ **YES - Use OCI for:**
1. **Host the MCP Server** (Python code runs on OCI Compute VM)
2. **Analyze OCI Costs** (OCI Usage API integration for cost analysis)
3. **Database** (PostgreSQL for customer data, audit logs)
4. **File Storage** (Object Storage for backups, exports)
5. **API Gateway** (Rate limiting, authentication)
6. **Monitoring** (Logs, alerts)

❌ **NO - Don't use OCI for:**
1. ~~Hosting the React dashboard~~ (Use Vercel or CloudFlare)
2. ~~Other clouds' authentication~~ (Each cloud has its own API credentials)

---

### **What clouds does OptiOra analyze?**

✅ **Supported (All included in MVP):**
- **AWS** — Cost Explorer API
- **Azure** — Cost Management API
- **GCP** — BigQuery Billing Export
- **OCI** — Usage API (for cost analysis)

---

### **Where does each component run?**

| Component | Platform | Why |
|-----------|----------|-----|
| **React Dashboard** | Vercel / CloudFlare | Global CDN, auto-scaling, free tier, cloud-agnostic |
| **MCP Server** | OCI Compute | Cost-effective ($40/mo), enterprise-grade infrastructure |
| **Database (PostgreSQL)** | OCI Database | Managed, backup + replication included, easy administration |
| **Cost Analysis APIs** | AWS, Azure, GCP | Industry-standard billing APIs, multi-cloud support |
| **Object Storage** | OCI Object Storage | Historical data, exports, cheap ($0.0255/GB/mo) |
| **API Gateway** | OCI API Gateway | Authentication, rate limiting, logging |

---

## 🏗️ Development Roadmap

### **Phase 1: MVP (Week 1–2)**
```
✅ MCP Backend (Python)
   - AWS cost integration
   - Basic anomaly detection
   - Recommendations engine
   
✅ OCI Deployment
   - Launch OCI Compute VM
   - Deploy MCP server
   - PostgreSQL audit logs
   
⏳ React Dashboard
   - Login page
   - Cost summary page
   - API integration with MCP
   
🚀 Deployment
   - MCP: OCI Compute
   - Dashboard: Vercel
```

### **Phase 2: Multi-Cloud (Week 3–4)**
```
✅ Azure cost API
✅ GCP cost API

✅ Dashboard pages
   - Cost breakdown by cloud
   - Anomaly alerts
   - Recommendations list
   
✅ Integrations
   - Slack webhooks
   - Jira ticket creation
```

### **Phase 3: Advanced (Week 5–6)**
```
✅ Automation actions
   - Execute cost-saving actions
   - Approval workflow

✅ ML improvements
   - Better anomaly detection
   - Forecast models
   
✅ Multi-user
   - Admin dashboard
   - Customer onboarding
```

---

## 💻 Tech Stack Summary

| Layer | Technology | Install | Host |
|-------|-----------|---------|------|
| **Frontend** | React 18 + Next.js 14 | `npm install` | Vercel |
| **Backend** | Python 3.11 + MCP | `poetry install` | OCI Compute |
| **Database** | PostgreSQL 15 | N/A (managed) | OCI Database |
| **Storage** | Object Storage | N/A (API only) | OCI Object Storage |
| **Charts** | Recharts | `npm install recharts` | Browser |
| **Auth** | NextAuth.js | `npm install next-auth` | Vercel (API routes) |
| **State** | React Query | `npm install @tanstack/react-query` | Browser |

---

## 🚀 Getting Started (Today)

### **Backend Setup (MCP)**
```bash
# 1. Clone this repo
git clone https://github.com/yourusername/optiora.git
cd optiora

# 2. Install Python dependencies
poetry install

# 3. Configure AWS credentials
cp .env.example .env
# Edit .env with AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY

# 4. Run MCP server locally
poetry run optiora

# Expected output:
# INFO:root:Starting OptiOra MCP server (deployed on OCI)...
# INFO:root:OptiOra MCP server running on port 8000
```

### **Frontend Setup (Dashboard)**
```bash
# 1. Create Next.js project
npx create-next-app@latest optiora-dashboard --typescript --tailwind

# 2. Install dependencies
cd optiora-dashboard
npm install recharts @tanstack/react-query

# 3. Create API client
# See DASHBOARD.md for code examples

# 4. Run locally
npm run dev
# Access at http://localhost:3000
```

### **OCI Deployment (MCP Server)**
```bash
# 1. Follow OCI_DEPLOYMENT.md for:
#    - Create OCI Compute instance
#    - Setup PostgreSQL RDS
#    - Deploy Docker container

# 2. Expected cost: ~$160/month (all-inclusive)

# 3. Verify it works:
curl https://api.optiora.io/tools/get_cost_summary
```

### **Dashboard Deployment (React Frontend)**
```bash
# 1. In optiora-dashboard/ folder:
npm run build

# 2. Deploy to Vercel
npx vercel deploy

# 3. Access at: https://optiora.vercel.app
```

---

## ❓ FAQs

### **Q: Why OCI for the backend?**
A: OCI is 50% cheaper than AWS ($160/mo vs $300+/mo) and integrates well with command-line tools. Plus, it's great for demonstrating multi-cloud expertise.

### **Q: Can we host the dashboard on OCI too?**
A: Yes, but Vercel is better because:
- Free tier is more generous
- Auto-scales globally (no cold starts)
- Better DX (deploy from GitHub)
- Separates frontend from backend (cloud-agnostic)

### **Q: Do we need to analyze OCI costs?**
A: Not in MVP. We focus on AWS, Azure, GCP. OCI cost analysis can be added later if customers ask.

### **Q: What if customers want to run MCP on AWS instead of OCI?**
A: Easy — the MCP code is container-based. Just change deployment target (ECS on AWS instead of OCI Compute). The dashboard stays on Vercel.

### **Q: How does the dashboard talk to the MCP backend?**
A: Via HTTPS REST API calls:
- Dashboard (Vercel) → HTTPS → MCP API Gateway (OCI) → Python code

### **Q: Can we use OCI cost APIs in the MCP?**
A: Yes, but it's optional. We'd need to add `oci_costs.py` with OCI SDK calls. For now, we skip it and focus on AWS, Azure, GCP.

---

## 📚 Key Files

**Backend (MCP on OCI):**
- `finops_mcp/server.py` — MCP server entry point
- `finops_mcp/tools/aws_costs.py` — AWS integration
- `finops_mcp/tools/azure_costs.py` — Azure (v0.2)
- `finops_mcp/tools/gcp_costs.py` — GCP (v0.2)
- `OCI_DEPLOYMENT.md` — How to deploy on OCI

**Frontend (Dashboard on Vercel):**
- `DASHBOARD.md` — Complete frontend architecture
- Create `optiora-dashboard/` separately using `create-next-app`

**Config:**
- `.env.example` — Environment variables (AWS, Azure, GCP keys)
- `pyproject.toml` — Python dependencies

---

## 🎯 Success Metrics

By end of Phase 1 (Week 2):
- ✅ MCP running locally with AWS cost data
- ✅ MCP deployed on OCI Compute (~$160/mo)
- ✅ React dashboard running on Vercel
- ✅ Dashboard fetching data from MCP API
- ✅ First customer trial signup

---

**You're building a multi-cloud cost platform powered by OCI infrastructure. Let's go! 🚀**
