# OptiOra System Architecture

## 🏗️ Complete Architecture Overview

OptiOra is a **multi-cloud FinOps platform** consisting of:
- **MCP Server** (Python backend) - Cost analysis engine hosted on OCI
- **React Dashboard** (Next.js frontend) - Self-hosted on OCI (not Vercel/CloudFlare)
- **PostgreSQL Database** (OCI) - Customer data, credentials, and audit logs
- **Cloud APIs** (AWS, Azure, GCP, OCI) - Cost data integrations
- **Credential Management** - Secure storage and validation of cloud credentials
- **Scanning Permissions** - Customer consent workflow before cost analysis

---

## System Architecture Diagram (OCI Self-Hosted)

```
┌──────────────────────────────────────────────────────────────────────┐
│                    ORACLE CLOUD INFRASTRUCTURE                       │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────┐              ┌────────────────────┐         │
│  │  OCI Load Balancer │              │  OCI App Service   │         │
│  │  (HTTPS Termination)│──┬───────────│  (React Frontend)  │         │
│  └────────────────────┘  │           └────────────────────┘         │
│                          │            - Next.js 14                   │
│                          │            - React 18 Dashboard          │
│              ┌───────────┤            - Tailwind CSS                 │
│              │           │            - Light/Dark Theme            │
│              │           │                                          │
│              ▼           ▼                                          │
│         ┌──────────────────────────┐                               │
│         │  OCI Compute Instances   │                               │
│         │  (Python MCP Backend)    │                               │
│         ├──────────────────────────┤                               │
│         │ finops_mcp/server.py     │                               │
│         │ - MCP Protocol Handler   │                               │
│         │ - API REST Endpoints     │                               │
│         │ - Credential Manager     │                               │
│         │ - Scanning Orchestrator  │                               │
│         │                          │                               │
│         │ Tools:                   │                               │
│         │ ├─ AWS Costs            │                               │
│         │ ├─ Azure Costs          │                               │
│         │ ├─ GCP Costs            │                               │
│         │ ├─ OCI Costs            │                               │
│         │ ├─ Anomalies            │                               │
│         │ ├─ Recommendations      │                               │
│         │ └─ Actions              │                               │
│         └──────────┬───────────────┘                               │
│                    │                                               │
│                    │ SQL / Connection Pooling                      │
│                    ▼                                               │
│         ┌────────────────────────┐                                │
│         │  OCI PostgreSQL (DBaaS)│                                │
│         ├────────────────────────┤                                │
│         │ Tables:                │                                │
│         │ ├─ customers           │                                │
│         │ ├─ cloud_credentials   │ ◄─── NEW: Encrypted storage   │
│         │ ├─ scanning_permissions│ ◄─── NEW: Consent tracking   │
│         │ ├─ scan_history        │ ◄─── NEW: Audit trail       │
│         │ ├─ cost_snapshots      │                                │
│         │ ├─ cost_anomalies      │                                │
│         │ ├─ cost_recommendations│                                │
│         │ ├─ cost_actions        │                                │
│         │ ├─ api_keys            │                                │
│         │ └─ audit_logs          │                                │
│         └────────────────────────┘                                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
         │ Cloud SDKs      │ Cloud SDKs      │ Cloud SDKs 
         │ (boto3)         │ (azure-sdk)     │ (google-cloud)
         ▼                 ▼                 ▼
    ┌─────────────────────────────────────────────┐
    │  MULTI-CLOUD COST DATA SOURCES              │
    ├─────────────────────────────────────────────┤
    │ AWS Cost Explorer    │ Last Hour Costs     │
    │ Azure Cost Mgmt      │ User-Provided Creds │
    │ GCP Billing          │ Validated on Add    │
    │ OCI Usage API        │ Encrypted Storage   │
    └─────────────────────────────────────────────┘
```

---

## New Credential Management Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ CUSTOMER ONBOARDING WORKFLOW                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  STEP 1: Add Credentials                                           │
│  ┌─────────────────────────────────┐                               │
│  │ Dashboard Settings              │                               │
│  │ ├─ AWS: Access Key + Secret    │                               │
│  │ ├─ Azure: Tenant + Client ID   │                               │
│  │ ├─ GCP: Service Account JSON   │                               │
│  │ └─ OCI: Config File            │                               │
│  └──────────────┬──────────────────┘                               │
│                 │ POST /api/v1/credentials/validate                │
│                 ▼                                                   │
│  ┌─────────────────────────────────┐                               │
│  │ Credential Validator            │ ◄─── NEW SERVICE             │
│  │ ├─ Test AWS Cost Explorer      │                               │
│  │ ├─ Test Azure Cost Management   │                               │
│  │ ├─ Test GCP BigQuery           │                               │
│  │ └─ Test OCI Usage API          │                               │
│  └──────────────┬──────────────────┘                               │
│                 │ Returns: valid/invalid + test_cost               │
│                 ▼                                                   │
│  ┌─────────────────────────────────┐                               │
│  │ Encryption & Storage            │                               │
│  │ → Encrypt with customer KMS key │                               │
│  │ → Store in cloud_credentials    │                               │
│  │ → Log validation in audit table │                               │
│  └──────────────┬──────────────────┘                               │
│                 │                                                   │
│  STEP 2: Approve Scanning                                          │
│  ┌─────────────────────────────────┐                               │
│  │ Scanning Approval Form          │                               │
│  │ ├─ Review providers             │                               │
│  │ ├─ Select scan frequency        │                               │
│  │ ├─ Configure auto-remediate     │                               │
│  │ └─ Provide notification email   │                               │
│  └──────────────┬──────────────────┘                               │
│                 │ POST /api/v1/scanning/approve                    │
│                 ▼                                                   │
│  ┌─────────────────────────────────┐                               │
│  │ Store Permission                │ ◄─── NEW: scanning_permissions│
│  │ State: APPROVED                 │                               │
│  └──────────────┬──────────────────┘                               │
│                 │                                                   │
│  STEP 3: Start Cost Analysis                                       │
│  ┌─────────────────────────────────┐                               │
│  │ POST /api/v1/scanning/start     │                               │
│  │ Validates:                      │                               │
│  │ ├─ Credentials exist            │                               │
│  │ ├─ Credentials valid            │                               │
│  │ └─ Scanning approved            │                               │
│  └──────────────┬──────────────────┘                               │
│                 │ Background Task                                   │
│                 ▼                                                   │
│  ┌─────────────────────────────────┐                               │
│  │ Run Cost Analysis               │                               │
│  │ ├─ Load encrypted credentials   │                               │
│  │ ├─ Query cloud cost APIs        │                               │
│  │ ├─ Detect anomalies             │                               │
│  │ ├─ Generate recommendations     │                               │
│  │ └─ Store results                │                               │
│  └──────────────┬──────────────────┘                               │
│                 │                                                   │
│                 ▼                                                   │
│  ┌─────────────────────────────────┐                               │
│  │ Results in Dashboard            │                               │
│  │ ├─ Cost breakdown               │                               │
│  │ ├─ Anomaly alerts               │                               │
│  │ └─ Savings opportunities        │                               │
│  └─────────────────────────────────┘                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```
                            │
         ┌──────────────────┴──────────────────┐
         │                                     │
         ▼                                     ▼
┌─────────────────────────────────────────────────────────┐
│          MCP SERVER LAYER (Python Backend)              │
│          Hosted: OCI Compute Instance                   │
│          Port: 8000                                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  MCP Protocol Handler                                  │
│  ├─ Server: server.py                                  │
│  ├─ Tools: 6 tools (see below)                         │
│  └─ Config: Multi-cloud credentials                    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │          Processing Engines                     │   │
│  │-─────────────────────────────────────────────   │   │
│  │ • Cost Aggregation & Normalization              │   │
│  │ • Anomaly Detection (statistical analysis)      │   │
│  │ • Recommendations (ML scoring, ROI ranking)     │   │
│  │ • Forecasting (trend analysis, growth factors)  │   │
│  │ • Action Execution (tickets, tags, scheduling)  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└────┬────────────────────────┬─────────────────────┬────┘
     │                        │                     │
     ▼                        ▼                     ▼
  ┌────────────┐        ┌──────────────┐    ┌────────────────┐
  │   Cloud    │        │  PostgreSQL  │    │ Cost History & │
  │   APIs     │        │  Database    │    │ Audit Trail    │
  │ (READ)     │        │ (WRITE)      │    │ Storage        │
  └────────────┘        └──────────────┘    └────────────────┘
     │                        │                     │
┌────┼────────────────────────┼─────────────────────┼─────┐
│    │                        │                     │     │
│    ▼                        ▼                     ▼     │
│ ┌──────────┐           ┌──────────┐          ┌──────┐  │
│ │  AWS     │           │ OCI DB   │          │ OCI  │  │
│ │  Cost    │           │ Instance │          │ Obj  │  │
│ │ Explorer │           │          │          │ Stor │  │
│ │  API     │           │ - costs  │          │ age  │  │
│ └──────────┘           │ - audits │          │      │  │
│                        │ - tickets│          └──────┘  │
│ ┌──────────┐           │          │                    │
│ │ Azure    │           └──────────┘                    │
│ │  Cost    │                                           │
│ │ Mgmt API │           ┌────────────────┐              │
│ └──────────┘           │  OCI Network   │              │
│                        │  & Firewall    │              │
│ ┌──────────┐           │  (Security)    │              │
│ │  GCP     │           └────────────────┘              │
│ │ BigQuery │                                           │
│ │ Billing  │                                           │
│ └──────────┘                                           │
│                                                        │
│ ┌──────────┐                                           │
│ │  OCI     │                                           │
│ │ Usage    │                                           │
│ │  API     │                                           │
│ └──────────┘                                           │
│                                                        │
└────────────────────────────────────────────────────────┘
         CLOUD PROVIDER INTEGRATION LAYER
```

---

## Data Flow Diagram

### Cost Analysis Flow

```
[User Opens Dashboard]
        │
        ▼
[Frontend: GET /costs]
        │
        ├─────► MCP Handler ─────► Fetch from Cache
        │               │
        │               └─────► If expired: Fetch from APIs
        │                           │
        │                           ├─► AWS Cost Explorer
        │                           ├─► Azure Cost Management
        │                           ├─► GCP BigQuery
        │                           └─► OCI Usage API
        │                           │
        │                           ▼
        │                       Aggregate & Normalize
        │                           │
        │                           ▼
        │                       Store in PostgreSQL
        │
        ├──────► Frontend Receives JSON
        │
        ▼
    Render Recharts
```

### Anomaly Detection Flow

```
[Scheduled Job / User Request]
        │
        ▼
[GET /anomalies]
        │
        ▼
[Load Cost History from Database]
        │
        ├─► Previous 30/90 days costs
        ├─► Calculate baseline
        └─► Calculate variance
        │
        ▼
[Statistical Analysis]
    ├─► Z-score: |actual - baseline| / std_dev
    ├─► Sensitivity: User-defined threshold
    └─► Confidence: % certain of anomaly
        │
        ▼
[Filter By Threshold]
    └─► Return high-confidence anomalies
        │
        ▼
[Store Alert in Database]
        │
        └─► Optional: Post to Slack/Teams/Email
```

---

## Component Architecture

### Backend Components

```
FINOPS_MCP Package Structure:

finops_mcp/
├── server.py          # MCP entry point, tool definitions
├── config.py          # Multi-cloud credentials management
├── database.py        # PostgreSQL schema & migrations
├── models.py          # Data models (CloudProvider, CostSummary, etc.)
│
└── tools/
    ├── __init__.py
    ├── aws_costs.py         # AWS Cost Explorer API integration
    ├── azure_costs.py       # Azure Cost Management API integration
    ├── gcp_costs.py         # GCP BigQuery Billing API integration
    ├── oci_costs.py         # OCI Usage API integration
    ├── anomalies.py         # Statistical anomaly detection
    ├── recommendations.py   # ML-based recommendation ranking
    └── actions.py           # Cost action execution (tickets, tags, etc.)
```

### Frontend Components

```
DASHBOARD Package Structure:

dashboard/
├── app/                        # Next.js App Router
│   ├── layout.tsx             # Root layout + ThemeProvider
│   ├── page.tsx               # Landing page
│   ├── globals.css            # Global Tailwind styles
│   │
│   └── dashboard/             # Protected dashboard routes
│       ├── layout.tsx         # Dashboard layout + sidebar nav
│       ├── page.tsx           # Cost overview & KPIs
│       ├── costs/page.tsx     # Multi-cloud breakdown
│       ├── anomalies/page.tsx # Alert list
│       ├── recommendations/page.tsx  # Suggestions
│       └── settings/page.tsx  # Integrations & preferences
│
├── components/                 # Reusable React components
│   ├── CostChart.tsx          # Recharts area chart
│   ├── ServiceBreakdown.tsx    # Recharts pie chart
│   ├── MetricCard.tsx         # KPI metric display
│   └── ThemeToggle.tsx        # Dark/light mode toggle
│
├── lib/                        # Utilities
│   ├── api.ts                 # axios client + mock data
│   └── types.ts               # TypeScript interfaces
│
├── public/                     # Static assets
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript config
├── tailwind.config.js         # Tailwind theme
├── next.config.js             # Next.js config
└── .eslintrc.json             # ESLint config
```

---

## Deployment Architecture

### Production (OCI Hosted - Only Supported Deployment)

```
OCI Region (us-phoenix-1)
│

```
OCI Region (us-phoenix-1)
│
├─ Compute Instance (VM.Standard.E4.Flex)
│  ├─ Docker Container
│  │  └─ Python MCP Server (:8000)
│  └─ Health checks
│
├─ PostgreSQL Instance
│  └─ Cost data, audit logs
│
├─ Object Storage
│  └─ Backups, historical data
│
├─ API Gateway
│  ├─ Rate limiting
│  ├─ Authentication
│  └─ HTTPS endpoint
│
└─ Load Balancer (optional for scaling)

Frontend: Deployed to Vercel
├─ CDN for global performance
├─ Automatic deployments from GitHub
└─ Environment: NEXT_PUBLIC_API_URL → OCI API Gateway
```

---

## Security Architecture

```
┌─────────────────────────────────────────────────────┐
│               HTTPS / TLS 1.3                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Frontend ─── OCI API Gateway                       │
│               ├─ Rate limiting                      │
│               ├─ Request validation                 │
│               └─ CORS headers                       │
│                   │                                 │
│                   ▼ Authenticated MCP Handler       │
│               Backend processing                    │
│               ├─ Environment-based credentials      │
│               │  (AWS_ACCESS_KEY_ID, etc.)         │
│               │                                     │
│               └─→ Cloud Provider APIs               │
│                   (OAuth 2.0 / API Keys)           │
│                                                     │
│  Environment Variables (Secrets):                  │
│  ├─ AWS_ACCESS_KEY_ID                             │
│  ├─ AZURE_CLIENT_SECRET                           │
│  ├─ GCP_SERVICE_ACCOUNT (JSON)                     │
│  ├─ OCI_API_KEY (PEM)                             │
│  └─ DB_PASSWORD                                    │
│                                                    │
│  Database:                                         │
│  ├─ PostgreSQL with credentials                    │
│  ├─ Private VPC network                            │
│  └─ Encrypted backups                              │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## Tool Definitions (MCP Server)

The MCP server exposes **6 tools** to clients (Claude, ChatGPT, etc.):

```
1. get_cost_summary
   Input: period, cloud_provider, filters
   Output: Total cost, top services, trends
   
2. detect_cost_anomalies
   Input: sensitivity, cloud_provider
   Output: List of anomalies with severity
   
3. get_recommendations
   Input: min_savings, difficulty
   Output: Ranked optimization suggestions
   
4. forecast_costs
   Input: period, growth_factor
   Output: Projected costs
   
5. execute_action
   Input: action_type, resource_id
   Output: Execution result, audit trail
   
6. create_ticket
   Input: title, description, priority
   Output: Ticket ID, platform (Jira, etc.)
```

---

## Technology Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 14 | React framework with App Router |
| **UI Library** | React 18 | Component library |
| **Styling** | Tailwind CSS 4 | Utility-first CSS |
| **Charts** | Recharts 3 | React charting library |
| **Theme** | next-themes | Dark mode support |
| **Backend** | Python 3.14 | MCP server implementation |
| **API Protocol** | MCP 0.4 | Model Context Protocol |
| **Cloud SDKs** | boto3, azure-identity, google-cloud, oci | Cloud integrations |
| **Database** | PostgreSQL | Persistent storage (OCI hosted) |
| **Hosting** | OCI Compute | MCP backend |
| **Frontend Hosting** | Vercel | React dashboard |
| **Containerization** | Docker | Container images |
| **CI/CD** | GitHub Actions | Automated deployments |

---

## Database Schema (PostgreSQL)

```sql
-- Customers
CREATE TABLE customers (
    id UUID PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255),
    subscription_tier VARCHAR(50),
    created_at TIMESTAMP
);

-- Cloud Integrations
CREATE TABLE cloud_integrations (
    id UUID PRIMARY KEY,
    customer_id UUID REFERENCES customers,
    provider VARCHAR(20),  -- aws, azure, gcp, oci
    is_active BOOLEAN,
    last_sync TIMESTAMP
);

-- Cost Snapshots
CREATE TABLE cost_snapshots (
    id UUID PRIMARY KEY,
    customer_id UUID REFERENCES customers,
    provider VARCHAR(20),
    date DATE,
    total_cost DECIMAL(12, 2),
    currency VARCHAR(3),
    created_at TIMESTAMP
);

-- Service-level Costs
CREATE TABLE service_costs (
    id UUID PRIMARY KEY,
    snapshot_id UUID REFERENCES cost_snapshots,
    service_name VARCHAR(255),
    cost DECIMAL(12, 2)
);

-- Anomalies
CREATE TABLE anomalies (
    id UUID PRIMARY KEY,
    customer_id UUID REFERENCES customers,
    provider VARCHAR(20),
    date DATE,
    baseline_cost DECIMAL(12, 2),
    actual_cost DECIMAL(12, 2),
    confidence DECIMAL(5, 2),
    severity VARCHAR(20),  -- low, medium, high
    created_at TIMESTAMP
);

-- Recommendations
CREATE TABLE recommendations (
    id UUID PRIMARY KEY,
    customer_id UUID REFERENCES customers,
    title VARCHAR(255),
    description TEXT,
    savings_per_month DECIMAL(12, 2),
    roi_percentage DECIMAL(5, 2),
    difficulty VARCHAR(20),  -- easy, medium, hard
    status VARCHAR(20),  -- pending, implemented, rejected
    created_at TIMESTAMP
);

-- Audit Log
CREATE TABLE audit_log (
    id UUID PRIMARY KEY,
    customer_id UUID REFERENCES customers,
    action VARCHAR(50),
    details JSONB,
    created_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_costs_customer_date ON cost_snapshots(customer_id, date);
CREATE INDEX idx_anomalies_customer_date ON anomalies(customer_id, date);
CREATE INDEX idx_recommendations_customer ON recommendations(customer_id);
```

---

## Error Handling & Resilience

### MCP Server Error Handling

```python
# All tools include:
1. Try-except blocks with specific error types
2. Mock data fallback when credentials are invalid
3. Logging at INFO/ERROR levels
4. Graceful degradation (partial data vs. complete failure)

# Example:
try:
    costs = aws.get_cost_summary()
except (NoCredentialsError, BotoClientError):
    costs = generate_mock_costs()  # Fallback
    log.warning("AWS credentials invalid, using mock data")
```

### Frontend Error Handling

```typescript
// All API calls include:
1. Try-catch with axios error handling
2. Mock data fallback if API unavailable
3. User-friendly error messages
4. Retry logic with exponential backoff
```

---

## Performance Considerations

- **Caching**: Cost data cached for 1 hour (configurable)
- **Database Indexes**: On customer_id + date for fast queries
- **CDN**: Vercel CDN for frontend assets (global distribution)
- **Lazy Loading**: Dashboard pages load components on demand
- **Code Splitting**: Next.js automatic route-based splitting

---

## Scalability Path

1. **Horizontal**: Load balancer + multiple MCP instances
2. **Vertical**: Upgrade OCI Compute shape (more CPU/memory)
3. **Database**: PostgreSQL read replicas for queries
4. **Caching**: Redis layer for frequently accessed data
5. **Message Queue**: Async task processing (Celery + Redis)

---

## Conclusion

OptiOra is built as a **scalable, modular multi-cloud FinOps platform** that can grow from startup MVP to enterprise deployment. The separation of concerns (frontend/backend/database) allows each component to scale independently.
