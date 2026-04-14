# OptiOra System Architecture

## Complete Architecture Overview

OptiOra is a **multi-cloud FinOps platform** consisting of:

- **FastAPI Backend** (Python) — Cost analysis engine hosted on OCI
- **MCP Server** — Model Context Protocol handler for LLM integrations
- **React Dashboard** (Next.js frontend) — Self-hosted on OCI
- **PostgreSQL Database** (OCI DBaaS) — Users, credentials, cost data, audit logs
- **Cloud APIs** (AWS, Azure, GCP, OCI) — Cost data integrations
- **Credential Management** — Encrypted storage and validation of cloud credentials
- **Scanning Permissions** — Customer consent workflow before cost analysis

---

## System Architecture Diagram (OCI Self-Hosted)

```text
┌──────────────────────────────────────────────────────────────────────┐
│                    ORACLE CLOUD INFRASTRUCTURE                       │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────┐              ┌────────────────────┐         │
│  │  OCI Load Balancer │              │  React Dashboard   │         │
│  │  (HTTPS / TLS 1.3) │──┬───────────│  Next.js 16 :3000  │         │
│  └────────────────────┘  │           └────────────────────┘         │
│                          │            - React 19                     │
│                          │            - Tailwind CSS 4               │
│              ┌───────────┤            - shadcn/ui                    │
│              │           │            - Dark/Light Theme             │
│              │           │                                           │
│              ▼           ▼                                           │
│         ┌──────────────────────────┐                                │
│         │  OCI Compute Instance    │                                │
│         │  FastAPI Backend :8000   │                                │
│         ├──────────────────────────┤                                │
│         │ app.py         (entry)   │                                │
│         │ auth_routes.py (JWT)     │                                │
│         │ api.py         (REST)    │                                │
│         │ server.py      (MCP)     │                                │
│         │                          │                                │
│         │ Tools:                   │                                │
│         │ ├─ AWS Costs             │                                │
│         │ ├─ Azure Costs           │                                │
│         │ ├─ GCP Costs             │                                │
│         │ ├─ OCI Costs             │                                │
│         │ ├─ Anomalies             │                                │
│         │ ├─ Recommendations       │                                │
│         │ └─ Actions               │                                │
│         └──────────┬───────────────┘                                │
│                    │                                                 │
│                    │ SQL / Connection Pooling                        │
│                    ▼                                                 │
│         ┌────────────────────────┐                                  │
│         │  OCI PostgreSQL (DBaaS)│                                  │
│         ├────────────────────────┤                                  │
│         │ Tables:                │                                  │
│         │ ├─ users               │                                  │
│         │ ├─ organizations       │                                  │
│         │ ├─ stored_credentials  │ ◄── Encrypted storage            │
│         │ ├─ scanning_permissions│ ◄── Consent tracking             │
│         │ ├─ refresh_tokens      │                                  │
│         │ ├─ cost_snapshots      │                                  │
│         │ ├─ cost_anomalies      │                                  │
│         │ ├─ cost_recommendations│                                  │
│         │ └─ audit_logs          │                                  │
│         └────────────────────────┘                                  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
         │ Cloud SDKs        │ Cloud SDKs        │ Cloud SDKs
         │ (boto3)           │ (azure-sdk)       │ (google-cloud)
         ▼                   ▼                   ▼
    ┌─────────────────────────────────────────────┐
    │  MULTI-CLOUD COST DATA SOURCES              │
    ├─────────────────────────────────────────────┤
    │ AWS Cost Explorer  │ User-Provided Creds   │
    │ Azure Cost Mgmt    │ Validated on Add      │
    │ GCP Billing        │ Encrypted Storage     │
    │ OCI Usage API      │ Per-request Decryption│
    └─────────────────────────────────────────────┘
```

---

## Credential Management Flow

```text
┌─────────────────────────────────────────────────────────────────────┐
│ CUSTOMER ONBOARDING WORKFLOW                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  STEP 1: Add Credentials                                           │
│  ┌─────────────────────────────────┐                               │
│  │ Dashboard Settings              │                               │
│  │ ├─ AWS: Access Key + Secret     │                               │
│  │ ├─ Azure: Tenant + Client ID    │                               │
│  │ ├─ GCP: Service Account JSON    │                               │
│  │ └─ OCI: Config File             │                               │
│  └──────────────┬──────────────────┘                               │
│                 │ POST /api/v1/credentials/validate                │
│                 ▼                                                   │
│  ┌─────────────────────────────────┐                               │
│  │ CredentialValidator             │                               │
│  │ ├─ Test AWS Cost Explorer       │                               │
│  │ ├─ Test Azure Cost Management   │                               │
│  │ ├─ Test GCP BigQuery            │                               │
│  │ └─ Test OCI Usage API           │                               │
│  └──────────────┬──────────────────┘                               │
│                 │ Returns: valid/invalid + error_details           │
│                 ▼                                                   │
│  ┌─────────────────────────────────┐                               │
│  │ Encryption & Storage            │                               │
│  │ POST /api/v1/credentials/add    │                               │
│  │ → Encrypt credentials           │                               │
│  │ → Store in stored_credentials   │                               │
│  │ → Log in audit_logs             │                               │
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
│  │ Store Permission                │                               │
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

---

## Data Flow Diagram

### Cost Analysis Flow

```text
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

```text
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

```text
finops_mcp/
├── app.py              # FastAPI entry point (CORS, auth router, api router)
├── api.py              # REST APIRouter: credentials, scanning, health
├── auth_routes.py      # Auth endpoints: register, login, refresh, logout
├── auth_utils.py       # JWT creation/verification, bcrypt hashing
├── config.py           # Environment config loader
├── credentials.py      # CredentialValidator + CredentialManager
├── scanning.py         # ScanningManager, ScanningState FSM
├── database.py         # PostgreSQL schema (legacy)
├── models.py           # Dataclass models (CostSummary, Anomaly, etc.)
├── orm_models.py       # SQLAlchemy ORM models + get_db dependency
├── server.py           # MCP protocol handler (6 tools)
│
└── tools/
    ├── aws_costs.py         # AWS Cost Explorer integration
    ├── azure_costs.py       # Azure Cost Management integration
    ├── gcp_costs.py         # GCP BigQuery Billing integration
    ├── oci_costs.py         # OCI Usage API integration
    ├── anomalies.py         # Z-score anomaly detection
    ├── recommendations.py   # ROI-ranked recommendation engine
    └── actions.py           # Cost action execution + ticket creation
```

### Frontend Components

```text
dashboard/
├── app/                         # Next.js App Router
│   ├── layout.tsx               # Root layout + ThemeProvider
│   ├── page.tsx                 # Landing page
│   ├── globals.css              # Global Tailwind styles
│   ├── login/page.tsx           # User login
│   ├── signup/page.tsx          # User registration
│   ├── api/ai/chat/route.ts     # Claude AI chat endpoint (server-side)
│   │
│   └── dashboard/               # Protected routes (JWT required)
│       ├── layout.tsx           # Sidebar nav + auth guard
│       ├── page.tsx             # Cost overview & KPIs
│       ├── costs/page.tsx       # Multi-cloud breakdown
│       ├── anomalies/page.tsx   # Alert list
│       ├── recommendations/page.tsx  # Savings suggestions
│       ├── settings/page.tsx    # Credential management
│       ├── ai-insights/page.tsx # GenAI cost analysis
│       ├── cost-advisor/page.tsx # Claude AI consultant
│       ├── my-dashboards/page.tsx # Custom dashboards
│       └── forecasting/page.tsx # Cost projections
│
├── components/
│   ├── CostChart.tsx            # Recharts area chart
│   ├── ServiceBreakdown.tsx     # Recharts pie chart
│   ├── MetricCard.tsx           # KPI card
│   ├── ThemeToggle.tsx          # Dark/light mode
│   ├── ProtectedRoute.tsx       # Auth wrapper
│   ├── CredentialForm.tsx       # Cloud credential input
│   ├── ScanningApproval.tsx     # Consent form
│   └── ui/                      # shadcn/ui primitives
│
├── lib/
│   ├── ai-service.ts            # Claude AI integration (5 functions + caching)
│   ├── api.ts                   # Axios client
│   ├── auth-context.tsx         # JWT auth state (React context)
│   ├── types.ts                 # TypeScript interfaces
│   └── utils.ts                 # Utility helpers
│
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── next.config.js
```

---

## Deployment Architecture

### Production (OCI Hosted — Only Supported Deployment)

```text
OCI Region (us-phoenix-1)
│
├─ Compute Instance (VM.Standard.E4.Flex)
│  ├─ FastAPI Backend (:8000)
│  │  ├─ auth_routes.py  — JWT register/login/refresh
│  │  ├─ api.py          — Credential & scanning endpoints
│  │  └─ server.py       — MCP protocol handler
│  └─ Systemd service + health checks
│
├─ React Dashboard (:3000)
│  └─ Next.js 16 app (same or separate compute)
│
├─ PostgreSQL Instance (OCI DBaaS)
│  └─ Cost data, users, credentials, audit logs
│
├─ Object Storage
│  └─ Backups, historical cost exports
│
├─ API Gateway
│  ├─ Rate limiting
│  ├─ HTTPS termination (TLS 1.3)
│  └─ CORS headers
│
└─ Load Balancer (optional for horizontal scaling)
```

---

## Security Architecture

```text
┌─────────────────────────────────────────────────────┐
│               HTTPS / TLS 1.3                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Browser ──► OCI Load Balancer / API Gateway        │
│               ├─ Rate limiting                      │
│               ├─ Request validation                 │
│               └─ CORS headers                       │
│                   │                                 │
│                   ▼                                 │
│             FastAPI Backend                         │
│             ├─ JWT Bearer auth (python-jose)        │
│             ├─ bcrypt password hashing (passlib)    │
│             ├─ Encrypted credential storage         │
│             └─► Cloud Provider APIs                 │
│                 (OAuth 2.0 / API Keys)              │
│                                                     │
│  Secrets (environment variables):                  │
│  ├─ SECRET_KEY          (JWT signing)              │
│  ├─ AWS_ACCESS_KEY_ID                              │
│  ├─ AZURE_CLIENT_SECRET                            │
│  ├─ GCP_SERVICE_ACCOUNT (JSON)                     │
│  ├─ OCI_API_KEY         (PEM)                      │
│  └─ DATABASE_URL                                   │
│                                                     │
│  Database:                                         │
│  ├─ PostgreSQL in private OCI VCN                  │
│  ├─ Credentials encrypted at rest                  │
│  └─ Encrypted backups to Object Storage            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## MCP Tool Definitions

The MCP server exposes **6 tools** to clients (Claude, etc.):

```text
1. get_cost_summary
   Input:  period, cloud_provider, filters
   Output: total cost, top services, trends

2. detect_cost_anomalies
   Input:  sensitivity, cloud_provider
   Output: list of anomalies with severity + confidence

3. get_recommendations
   Input:  min_savings, difficulty
   Output: ROI-ranked optimization suggestions

4. forecast_costs
   Input:  period, growth_factor
   Output: projected costs (3–12 months)

5. execute_action
   Input:  action_type, resource_id
   Output: execution result, audit trail

6. create_ticket
   Input:  title, description, priority
   Output: ticket ID, platform (Jira, Azure DevOps)
```

---

## Technology Stack Summary

| Layer | Technology | Purpose |
| ----- | ---------- | ------- |
| **Frontend** | Next.js 16 + React 19 | Dashboard framework |
| **Styling** | Tailwind CSS 4 + shadcn/ui | UI components |
| **Charts** | Recharts 3 | Cost visualizations |
| **Theme** | next-themes | Dark mode support |
| **AI** | Claude 3.5 Sonnet via Anthropic SDK | Cost analysis chat |
| **Backend** | Python 3.10+ + FastAPI 0.100+ | REST API + MCP server |
| **MCP protocol** | mcp 0.4 | LLM tool integration |
| **Cloud SDKs** | boto3, azure-identity, google-cloud-billing, oci | Cloud integrations |
| **Database** | PostgreSQL (OCI DBaaS) via SQLAlchemy 2 | Persistent storage |
| **Auth** | python-jose (JWT) + passlib (bcrypt) | User authentication |
| **Deployment** | OCI Compute (VM.Standard.E4.Flex) | Backend + frontend hosting |

---

## Database Schema (PostgreSQL)

```sql
-- Users (ORM-managed — see orm_models.py)
CREATE TABLE users (
    id          SERIAL PRIMARY KEY,
    email       VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name   VARCHAR(255),
    is_active   BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP,
    last_login  TIMESTAMP
);

-- Organizations
CREATE TABLE organizations (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    owner_id    INTEGER REFERENCES users(id),
    plan        VARCHAR(50) DEFAULT 'free',
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- User ↔ Organization membership
CREATE TABLE user_organizations (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id),
    organization_id INTEGER REFERENCES organizations(id),
    role            VARCHAR(50) DEFAULT 'analyst',
    added_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Encrypted cloud credentials
CREATE TABLE stored_credentials (
    id                      SERIAL PRIMARY KEY,
    organization_id         INTEGER REFERENCES organizations(id),
    provider                VARCHAR(50) NOT NULL,  -- aws, azure, gcp, oci
    credential_data_encrypted TEXT NOT NULL,
    is_valid                BOOLEAN DEFAULT FALSE,
    validated_at            TIMESTAMP,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

-- JWT refresh tokens (rotated on use)
CREATE TABLE refresh_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    token_hash  VARCHAR(255) UNIQUE NOT NULL,
    is_revoked  BOOLEAN DEFAULT FALSE,
    expires_at  TIMESTAMP NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Cost snapshots
CREATE TABLE cost_snapshots (
    id          UUID PRIMARY KEY,
    org_id      INTEGER REFERENCES organizations(id),
    provider    VARCHAR(20),
    date        DATE,
    total_cost  DECIMAL(12,2),
    currency    VARCHAR(3),
    created_at  TIMESTAMP
);

-- Anomalies
CREATE TABLE anomalies (
    id              UUID PRIMARY KEY,
    org_id          INTEGER REFERENCES organizations(id),
    provider        VARCHAR(20),
    date            DATE,
    baseline_cost   DECIMAL(12,2),
    actual_cost     DECIMAL(12,2),
    confidence      DECIMAL(5,2),
    severity        VARCHAR(20),
    created_at      TIMESTAMP
);

-- Recommendations
CREATE TABLE recommendations (
    id                  UUID PRIMARY KEY,
    org_id              INTEGER REFERENCES organizations(id),
    title               VARCHAR(255),
    description         TEXT,
    savings_per_month   DECIMAL(12,2),
    roi_percentage      DECIMAL(5,2),
    difficulty          VARCHAR(20),
    status              VARCHAR(20) DEFAULT 'pending',
    created_at          TIMESTAMP
);

-- Audit log
CREATE TABLE audit_log (
    id          UUID PRIMARY KEY,
    org_id      INTEGER REFERENCES organizations(id),
    action      VARCHAR(50),
    details     JSONB,
    created_at  TIMESTAMP
);

-- Indexes
CREATE INDEX idx_costs_org_date   ON cost_snapshots(org_id, date);
CREATE INDEX idx_anomalies_org    ON anomalies(org_id, date);
CREATE INDEX idx_recs_org         ON recommendations(org_id);
CREATE INDEX idx_refresh_user     ON refresh_tokens(user_id);
```

---

## Error Handling & Resilience

### Backend

```python
# Pattern used across all cost tools:
try:
    costs = aws.get_cost_summary()
except (NoCredentialsError, BotoCoreError):
    costs = generate_mock_costs()   # graceful fallback
    logger.warning("AWS credentials invalid — returning mock data")

# FastAPI global handler (app.py):
@app.exception_handler(Exception)
async def global_handler(request, exc):
    logger.error("Unhandled: %s", exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
```

### Frontend

```typescript
// All API calls follow this pattern:
try {
  const data = await api.getCosts();
  setCosts(data);
} catch (error) {
  console.error("API unavailable:", error);
  setCosts(MOCK_COSTS);   // silent fallback to mock data
}
```

---

## Performance Considerations

- **Caching**: Cost data cached for 1 hour (configurable via env)
- **Database Indexes**: On org\_id + date for fast range queries
- **Lazy Loading**: Dashboard pages load components on demand
- **Code Splitting**: Next.js automatic route-based splitting
- **Prompt Caching**: Claude system prompt cached via `cache_control` (reduces token cost on repeated chat calls)

---

## Scalability Path

1. **Horizontal** — Load balancer + multiple FastAPI instances
2. **Vertical** — Upgrade OCI Compute shape (more OCPU/memory)
3. **Database** — PostgreSQL read replicas for analytical queries
4. **Caching** — Redis layer for frequently accessed cost summaries
5. **Message Queue** — Async scan processing via Celery + Redis

---

## Conclusion

OptiOra is built as a **scalable, modular multi-cloud FinOps platform** that can grow
from startup MVP to enterprise deployment. The separation of concerns
(frontend / backend / database) allows each component to scale independently.
