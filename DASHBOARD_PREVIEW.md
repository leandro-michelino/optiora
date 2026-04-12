# OptiOra Dashboard Preview

## 🎨 Live Dashboard Interface

The OptiOra dashboard is now running at **http://localhost:3000**

### Dashboard Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           OptiOra Dashboard                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────┐  Cloud Settings                          🌙      │
│  │ SIDEBAR            │  - Add Cloud Provider                            │
│  │ Overview           │  - Connected Providers (AWS, Azure, GCP, OCI)   │
│  │ Costs              │  - Scanning Approval Workflow                   │
│  │ Anomalies          │  - User Preferences                             │
│  │ Recommendations    │  ├─ Email Notifications                         │
│  │ AI Insights        │  ├─ Weekly Summary Report                       │
│  │ Cost Advisor       │  └─ High-likelihood Recommendations Only        │
│  │ Forecasting        │                                                 │
│  │ Settings           │  Account Section                                │
│  │                    │  - Email Address                                │
│  │                    │  - Organization Name                            │
│  │                    │  - Billing Alert Threshold                      │
│  └────────────────────┘  └─────────────────────────────────────────────┘
│
│  MAIN CONTENT AREA (Changes based on sidebar selection)
│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Main Dashboard Pages

### 1. **Overview** (Dashboard Home)
**Purpose:** Quick view of cloud spending across all providers

```
┌─────────────────────────────────────────────────────────────────┐
│ Dashboard Overview                              Last 30 days    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ Total Monthly    │  │ Savings          │  │ Anomalies    │ │
│  │ Spend            │  │ Potential        │  │ Detected     │ │
│  │ $11,250          │  │ $935 (8.3%)      │  │ 3 alerts     │ │
│  │ ↑2.5% vs month   │  │                   │  │ ⚠️ Review    │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
│                                                                  │
│  Top Spending Services (This Month)                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ AWS EC2 Instances          $3,500  ████████░░  31%    │   │
│  │ Azure Virtual Machines     $2,100  ████░░░░░░  19%    │   │
│  │ GCP Compute Engine         $2,050  ████░░░░░░  18%    │   │
│  │ OCI Compute                $1,200  ██░░░░░░░░  11%    │   │
│  │ Storage Services           $1,400  ███░░░░░░░  12%    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Quick Actions                                                   │
│  [+ Add Cloud Provider] [📊 View Detailed Report] [⚙️ Settings]│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 2. **Costs** (Multi-Cloud Cost Breakdown)
**Purpose:** Detailed cost analysis by cloud provider and service

```
┌─────────────────────────────────────────────────────────────────┐
│ Cloud Costs Analysis                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Summary Cards                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ Total Monthly    │  │ Savings          │  │ Potential    │ │
│  │ Spend            │  │ Potential        │  │ ROI          │ │
│  │ $9,250           │  │ $935 (8.3%)      │  │ 4.2 months   │ │
│  │ ↑1.2% from last  │  │ Recommended      │  │ to break     │ │
│  │ month            │  │ actions          │  │ even         │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
│                                                                  │
│  Bar Chart: This Month vs Last Month by Provider               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ AWS    │███████│ $4,100  │███████│ $4,050      │░░░│    │   │
│  │ Azure  │█████░│ $3,400  │█████░│ $3,200      │░░░│    │   │
│  │ GCP    │█████│ $2,350  │█████│ $2,100      │░░░│    │   │
│  │ OCI    │███░│ $1,500  │███░│ $1,400      │░░░│    │   │
│  │        └─────────────────────────────────────────────────┘   │
│  │        This Month          Last Month                        │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Pie Chart: Cost Distribution by Cloud Provider                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    AWS (44.4%)                          │   │
│  │              ╱─────────────)\                           │   │
│  │            ╱ Azure        ││ GCP                       │   │
│  │          ╱  (36.8%)  OCI ││ (25.4%)                   │   │
│  │        ╱              (16.2%)                          │   │
│  │      ╱─────────────────                                │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 3. **Anomalies** (Cost Alert Detection)
**Purpose:** Identify unusual spending patterns and alerts

```
┌─────────────────────────────────────────────────────────────────┐
│ Cost Anomalies & Alerts                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Alert Summary                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ Critical         │  │ High Risk        │  │ Medium Risk  │ │
│  │ Anomalies        │  │ Anomalies        │  │ Anomalies    │ │
│  │ 1 alert          │  │ 2 alerts         │  │ 4 alerts     │ │
│  │ 🔴 Action needed │  │ 🟠 Review soon   │  │ 🟡 Monitor   │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
│                                                                  │
│  Anomalies List (Sorted by severity)                            │
│                                                                  │
│  🔴 CRITICAL: AWS Reserved Instance Expiration                │
│     └─ Impact: $850/month increase expected in 5 days         │
│     └─ Action: Renew RI or switch to on-demand                │
│     └─ [View Details]  [Take Action]                          │
│                                                                  │
│  🟠 HIGH: Azure Blob Storage 45% increase                     │
│     └─ Impact: +$240 from last month                          │
│     └─ Cause: Possible data replication issue detected        │
│     └─ [View Details]  [Take Action]                          │
│                                                                  │
│  🟠 HIGH: GCP Compute Instance in wrong region               │
│     └─ Impact: $180/month excess cost                         │
│     └─ Root cause: Deployment in us-central1 vs cheaper us    │
│     └─ [View Details]  [Take Action]                          │
│                                                                  │
│  🟡 MED: OCI Network Bandwidth overage                         │
│     └─ Impact: +$92 this month                                │
│     └─ Cause: Data transfer exceeded monthly quota            │
│     └─ [View Details]  [Take Action]                          │
│                                                                  │
│  🟡 MED: Unused AWS NAT Gateway                               │
│     └─ Impact: $32/month wasted                               │
│     └─ Status: Running but idle                               │
│     └─ [View Details]  [Take Action]                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4. **Recommendations** (AI-Generated Cost Optimization)
**Purpose:** Actionable optimization recommendations

```
┌──────────────────────────────────────────────────────────────┐
│ Cost Optimization Recommendations                            │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ Total Potential Savings: $935/month (8.3% reduction)        │
│ Estimated ROI: 4.2 months to break even                     │
│                                                               │
│ 🚀 Recommended Actions (Sorted by savings)                  │
│                                                               │
│ 1️⃣  RIGHT-SIZE AWS EC2 INSTANCES                           │
│    Current: t3.xlarge (4 vCPU, 16GB) - Underutilized       │
│    Recommendation: Switch to t3.medium (2 vCPU, 4GB)        │
│    Savings: $280/month (58% reduction)                      │
│    Risk Level: LOW ✓                                         │
│    Likelihood of Success: 95%                                │
│    [Implement]  [Learn More]                                │
│                                                               │
│ 2️⃣  BUY AWS RESERVED INSTANCES                              │
│    Current: On-demand EC2 instances (20 instances)          │
│    Recommendation: Purchase 1-year RIs (30% discount)       │
│    Savings: $320/month when fully adopted                    │
│    Risk Level: LOW ✓                                         │
│    Likelihood of Success: 87%                                │
│    Upfront Cost: $4,200 (breaks even in 13 months)          │
│    [Implement]  [Learn More]                                │
│                                                               │
│ 3️⃣  DELETE UNATTACHED STORAGE VOLUMES                       │
│    Current: 12 GB volumes not in use (AWS + Azure + GCP)    │
│    Recommendation: Delete orphaned volumes                   │
│    Savings: $85/month (cleanup-only, immediate benefit)     │
│    Risk Level: LOW ✓                                         │
│    [Implement]  [Learn More]                                │
│                                                               │
│ 4️⃣  SWITCH TO ARM-BASED INSTANCES                           │
│    Current: x86-64 compute (Graviton instance available)    │
│    Recommendation: Use AWS Graviton2 (20% cheaper)          │
│    Savings: $250/month                                       │
│    Risk Level: MEDIUM ⚠️ (Requires code compatibility)      │
│    Likelihood of Success: 72%                                │
│    [Implement]  [Learn More]                                │
│                                                               │
│ 5️⃣  USE AUTO-SCALING FOR BATCH JOBS                         │
│    Current: Constant fleet of 10 workers (peak demand only) │
│    Recommendation: Auto-scale to [2-10] based on queue      │
│    Savings: $175/month (30% reduction - off-peak)           │
│    Risk Level: MEDIUM ⚠️ (Slight latency increase)          │
│    [Implement]  [Learn More]                                │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

### 5. **AI Insights** (Claude AI Analysis)
**Purpose:** Deep dive analysis of spending patterns

```
┌─────────────────────────────────────────────────────────────────┐
│ AI Insights (Powered by Claude AI)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ 🤖 Analysis Summary (Last 7 days)                              │
│                                                                  │
│ 1. SPENDING TREND ANALYSIS                                     │
│    The overall cloud spend increased 2.5% week-over-week due   │
│    to:                                                          │
│    └─ 60% from increased database replication (Azure)         │
│    └─ 25% from new staging environment (AWS)                  │
│    └─ 15% from batch processing spike (GCP)                   │
│                                                                  │
│    Forecast: $410 increase expected by end of month if trend  │
│    continues. Recommend implementing auto-scaling.             │
│                                                                  │
│ 2. COST DRIVER ANOMALIES                                       │
│    Detected potential waste in OCI:                            │
│    └─ Idle compute instance (no CPU > 5% for 72 hrs)         │
│    └─ Oversized database (20 GB allocated, 2 GB used)         │
│    └─ Network bandwidth spike Tuesday @ 14:00 UTC             │
│                                                                  │
│    Action: Recommend reviewing application logs for Tuesday.  │
│                                                                  │
│ 3. PROVIDER COMPARISON INSIGHT                                 │
│    AWS cost/performance ratio: 1.2 (baseline)                 │
│    Azure cost/performance ratio: 1.8 (30% higher)             │
│    GCP cost/performance ratio: 1.0 (20% cheaper)              │
│    OCI cost/performance ratio: 0.9 (10% cheaper)              │
│                                                                  │
│    Recommendation: Consider migrating non-critical AWS        │
│    workloads to GCP for 20% monthly savings.                  │
│                                                                  │
│ [📊 View Full Analysis]  [💬 Ask AI Questions]                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 6. **Cost Advisor** (AI Chat Interface)
**Purpose:** Interactive chat with Claude AI about costs

```
┌─────────────────────────────────────────────────────────────────┐
│ Cost Advisor Chat                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  💬 Chat with Claude AI about your cloud costs                │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Assistant: Hello! I'm your OptiOra Cost Advisor.         │  │
│  │            I can help you understand your cloud          │  │
│  │            spending, find savings opportunities, and     │  │
│  │            optimize your infrastructure.                 │  │
│  │                                                          │  │
│  │            What would you like to know?                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  User: Why is my AWS bill $400 higher this month?             │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Assistant: Looking at your data, the $400 increase is   │  │
│  │            primarily due to:                            │  │
│  │                                                          │  │
│  │            1. New EC2 instances (t3.large) for          │  │
│  │               staging: +$210                            │  │
│  │            2. Increased RDS backup storage: +$85         │  │
│  │            3. NAT gateway processing fees: +$105         │  │
│  │                                                          │  │
│  │            Quick fix: Delete staging instances when     │  │
│  │            not in use to save $210/month.               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  User: How much can I save per month with your                │
│        recommendations?                                        │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Assistant: Based on your infrastructure analysis, you   │  │
│  │            can save approximately $935/month (8.3%):    │  │
│  │                                                          │  │
│  │            - Right-size instances: $280/month           │  │
│  │            - Reserved instances: $320/month             │  │
│  │            - Clean up storage: $85/month                │  │
│  │            - Auto-scaling: $250/month                   │  │
│  │            - Other optimizations: $120/month            │  │
│  │                                                          │  │
│  │            I recommend starting with right-sizing       │  │
│  │            (lowest risk, immediate savings).             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [Type your question...]  [Send]  [Clear Chat]  [Export]      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 7. **Forecasting** (12-Month Cost Projection)
**Purpose:** Predict future spending and budget planning

```
┌──────────────────────────────────────────────────────────────┐
│ 12-Month Cost Forecast                                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ Current Run Rate: $9,250/month                              │
│ Projected Year 1: $116,875                                  │
│ Budget Impact: -8.3% if recommendations implemented         │
│                                                               │
│ Line Chart: Projected spend over 12 months                 │
│ ┌────────────────────────────────────────────────────────┐  │
│ │                                                        │  │
│ │ $12k   │                              ╱╲              │  │
│ │        │                            ╱    ╲            │  │
│ │ $10k   │          ╱╲            ╱        ╲   (Peak Q4)│  │
│ │        │        ╱    ╲    ╱╲    ╱          ╲          │  │
│ │ $8k    │  ╱╲  ╱        ╲╱    ╲╱            ╲╱       │  │
│ │        │ ╱    ╲                                        │  │
│ │ $6k    └────────────────────────────────────────────────  │
│ │        Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec│  │
│ │                                                        │  │
│ │ Blue line: Current trend (baseline)                   │  │
│ │ Green line: With recommended optimizations            │  │
│ │                                                        │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                               │
│ Scenario Planning                                           │
│                                                               │
│ ✅ Scenario: Implement All Recommendations                 │
│    Q1 Spend: $25,200 (Month 1-3)                          │
│    Q2 Spend: $24,100 (Optimizations take effect M4)      │
│    Q3 Spend: $24,800 (Seasonal increase + growth)        │
│    Q4 Spend: $27,400 (Holiday season peak)               │
│    Total: $101,520 (-13% vs baseline)                    │
│                                                               │
│ ⚠️  Scenario: Do Nothing (Business as Usual)              │
│    Year 1: $116,875 (projected current path)              │
│                                                               │
│ ⚡ Scenario: Aggressive Consolidation                      │
│    Migrate 50% to GCP (cheaper), scale down AWS           │
│    Year 1: $87,500 (-25% reduction, higher effort)        │
│                                                               │
│ [Download Report]  [Share forecast]  [Adjust scenario]      │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

### 8. **Settings** (Cloud Provider Setup)
**Purpose:** Add/manage cloud provider credentials

```
┌──────────────────────────────────────────────────────────────┐
│ Cloud Settings                                              │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ Add Cloud Provider                                           │
│ ┌────────────────────┐  ┌─────────────────────────────────┐ │
│ │ Select Provider:   │  │ AWS Credentials                 │ │
│ │ [AWS      ▼]       │  │ ├─ Access Key ID                │ │
│ │ - AWS              │  │ ├─ Secret Access Key            │ │
│ │ - Azure            │  │ ├─ Default Region              │ │
│ │ - GCP              │  │ └─ [Validate]  [Save]           │ │
│ │ - OCI              │  │                                 │ │
│ └────────────────────┘  └─────────────────────────────────┘ │
│                                                               │
│ Connected Providers                                         │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ AWS          ✓ Valid          [Delete]               │   │
│ │ Azure        ✓ Valid          [Delete]               │   │
│ │ GCP          ✓ Valid          [Delete]               │   │
│ │ OCI          ✓ Valid          [Delete]               │   │
│ │                                                       │   │
│ │ Setup Status                                          │   │
│ │ ✓ 4 cloud providers connected                        │   │
│ │ ✓ Credentials validated                             │   │
│ │ ✓ Ready to scan                                     │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                               │
│ Preferences                                                 │
│ ☑ Email Notifications                                      │
│   └─ Receive alerts when anomalies detected               │
│ ☑ Weekly Summary Report                                    │
│   └─ Get weekly cost analysis via email                   │
│ ☑ High-likelihood Recommendations Only                    │
│   └─ Show only recommendations with 70%+ success rate    │
│                                                               │
│ Account                                                     │
│ Email: user@company.com      Organization: ACME Corp       │
│ Billing Threshold: $10,000   Alert when spend exceeds     │
│                                                               │
│ [Save Settings]  [Download API Key]  [Sign Out]           │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 🎨 Design Features

### Color Scheme (Dark Mode)
- **Background:** Slate 900-950 (#0f172a - #030712)
- **Cards:** Slate 800 (#1e293b)
- **Text:** Slate 50/100 (#f8fafc / #f1f5f9)
- **Accents:**
  - Success: Emerald 500 (#10b981)
  - Warning: Amber 500 (#f59e0b)
  - Critical: Red 600 (#dc2626)
  - Primary: Blue 500 (#3b82f6)

### Components Used
- **Charts:** Recharts (BarChart, PieChart, LineChart, AreaChart)
- **Icons:** Lucide React (TrendingUp, TrendingDown, AlertCircle, CheckCircle2, etc.)
- **Styling:** Tailwind CSS 4 with dark mode support
- **Responsive:** Mobile-first design, optimized for tablet & desktop

---

## 🔌 Backend Integration

The dashboard connects to the Python MCP server at `/api`:

### API Endpoints Used
```
GET  /api/status              - Server health check
POST /api/credentials         - Add cloud provider credentials
GET  /api/credentials/{id}    - Retrieve credentials
DELETE /api/credentials/{id}  - Remove credentials

POST /api/scan               - Initiate cost scanning
GET  /api/scan/status        - Check scan progress
GET  /api/costs              - Retrieve cost data
GET  /api/anomalies          - Get detected anomalies
GET  /api/recommendations    - Fetch optimization recommendations
POST /api/execute-action     - Execute a recommendation

POST /api/ai/analyze         - Claude AI analysis endpoint
```

### Real-time Features
- WebSocket support for live updates (if backend implements)
- Auto-refresh cost data every 5 minutes
- Real-time anomaly alerts
- Streaming AI responses in chat

---

## 📱 Responsive Breakpoints

| Device | Width | Layout |
|--------|-------|--------|
| Mobile | < 640px | Single column, hamburger menu |
| Tablet | 640-1024px | Sidebar collapsed by default |
| Desktop | > 1024px | Full sidebar + content |
| Ultra-wide | > 1920px | Expanded card grid |

---

## 🚀 Performance Optimizations

- **Next.js 16** with Turbopack for fast rebuilds (514ms startup)
- **Code splitting** per page/route
- **Image optimization** with next/image
- **CSS-in-JS** with Tailwind for minimal CSS payload
- **API caching** with SWR (stale-while-revalidate)
- **Lazy loading** for heavy components
- **Bundle size:** ~2MB gzipped (production)

---

## 🔐 Security Features

- **Credential encryption** at rest (OCI Vault)
- **Instance Principal** auth (no API keys on dashboard)
- **CORS protection** for API calls
- **CSP headers** to prevent injection attacks
- **Rate limiting** on sensitive endpoints
- **Audit logging** of all user actions
- **Session management** with JWT tokens (optional)

---

## 📊 Example Data Flow

```
User opens Dashboard (http://localhost:3000)
    ↓
Next.js loads React components (Turbopack)
    ↓
Dashboard layout renders with sidebar + content
    ↓
useEffect hooks trigger API calls to backend:
    GET /api/costs              → Chart data
    GET /api/anomalies          → Alert list
    GET /api/recommendations    → Suggestions
    ↓
Backend (Python MCP) queries cloud provider APIs:
    AWS Cost Explorer API
    Azure Cost Management API
    GCP Billing API
    OCI CE Reports API
    ↓
Backend returns aggregated data (JSON)
    ↓
React components render charts & cards
    ↓
Charts display with Recharts (interactive, zoom, tooltip)
    ↓
User can interact:
    - Click anomalies to drill down
    - Execute recommendations
    - Chat with AI advisor
    - Export reports
```

---

## 🎯 Next Steps - Deploy to OCI

To deploy this dashboard to production on OCI:

```bash
# Use the deployment script
./deploy/deploy-oci.sh

# Or manually deploy container:
./deploy/deploy-oci.sh container

# Check deployment status
./deploy/deploy-oci.sh status

# View logs
./deploy/deploy-oci.sh logs
```

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for complete instructions.

---

**Dashboard Status:** ✅ Running at http://localhost:3000  
**Backend Status:** Running (Python MCP server)  
**Ready for Deployment:** ✅ Yes, use `./deploy/deploy-oci.sh compute`
