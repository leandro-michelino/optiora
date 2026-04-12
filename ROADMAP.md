# OptiOra — Next Implementation Steps

**Status:** Production deployment ready. The following features are needed for full product launch.

---

## 🎯 Priority 1: User Authentication (CRITICAL)

**Current State:** No authentication implemented  
**Impact:** Cannot deploy multi-user SaaS without auth  
**Effort:** 40-60 hours

### What's Needed:

#### 1.1 Backend Authentication
- [ ] **JWT token support** in FastAPI (use `python-jose` + `passlib`)
  - Generate tokens on login
  - Validate tokens on every request
  - Refresh token rotation
  
- [ ] **User model** in database
  ```python
  class User(Base):
      id: int
      email: str (unique)
      password_hash: str
      organization_id: int (nullable for personal)
      role: str (admin, user, readonly)
      created_at: datetime
      active: bool
  ```

- [ ] **API Endpoints**
  ```
  POST   /auth/register     # Create account
  POST   /auth/login        # Get JWT + refresh token
  POST   /auth/refresh      # Renew expired JWT
  POST   /auth/logout       # Invalidate token
  GET    /auth/profile      # Get current user
  PUT    /auth/profile      # Update profile
  POST   /auth/password     # Change password
  ```

- [ ] **Dependency injection for auth**
  ```python
  async def get_current_user(token: str = Depends(HTTPBearer())) -> User:
      # Validate JWT and return user
  ```

#### 1.2 Frontend Authentication
- [ ] **Login page** (`/login`)
  - Email/password form
  - "Sign up" and "Forgot password" links
  - Error handling
  - Loading states

- [ ] **Sign up flow** (`/register`)
  - Form validation
  - Email verification (send OTP)
  - Auto-login after signup

- [ ] **Auth context** (React Context API or Zustand)
  ```typescript
  interface AuthContextType {
    user: User | null;
    loading: boolean;
    login(email, password): Promise<void>;
    signup(email, password, name): Promise<void>;
    logout(): void;
    isAuthenticated: boolean;
  }
  ```

- [ ] **Protected routes**
  ```typescript
  <ProtectedRoute path="/dashboard" component={Dashboard} />
  ```

- [ ] **Token storage** (secure httpOnly cookies OR localStorage with HTTPS)
  - Store JWT in httpOnly cookie (recommended)
  - Refresh token in httpOnly cookie

- [ ] **Logout functionality**
  - Clear cookies
  - Redirect to login
  - Invalidate refresh token

#### 1.3 Security Hardening
- [ ] **Password requirements**
  - Min 12 characters
  - Must include uppercase, lowercase, number, special char
  - Check against breach database (use `haveibeenpwned.com` API)

- [ ] **Rate limiting**
  - Max 5 login attempts per IP per 15 minutes
  - Max 10 password reset attempts per email per hour

- [ ] **Email verification**
  - Send one-time code (OTP) to email
  - Expire after 10 minutes
  - Allow resend after 60 seconds

- [ ] **Forgot password flow**
  - Email verification
  - Temp reset link (valid 1 hour)
  - Set new password
  - Invalidate all existing tokens

**Dependencies to Add:**
```toml
python-jose = "^3.3.0"          # JWT
passlib = {version = "^1.7.4", extras = ["bcrypt"]}  # Password hashing
python-multipart = "^0.0.6"     # Form data parsing
fastapi-security = "^0.1.1"
```

**Frontend Dependencies:**
```json
"@nextauth/react": "^4.24.0",
"@nextauth/core": "^4.24.0",
"next-auth": "^4.24.0"
```

---

## 🎯 Priority 2: Multi-Tenant Support (HIGH)

**Current State:** Single tenant only  
**Impact:** Can't offer SaaS without this  
**Effort:** 30-40 hours

### What's Needed:

#### 2.1 Data Model Changes
- [ ] **Organization model**
  ```python
  class Organization(Base):
      id: int
      name: str
      owner_id: int
      plan: str (free, professional, enterprise)
      active_user_count: int
      created_at: datetime
      billing_id: str (Stripe customer ID)
  ```

- [ ] **User-Organization relationship**
  ```python
  class UserOrganization(Base):
      user_id: int
      organization_id: int
      role: str (owner, admin, analyst, readonly)
      added_at: datetime
  ```

- [ ] Update `Credentials` model to include `organization_id`
  - Credentials scoped to organization, not user
  - All users in org can see (filtered views based on role)

#### 2.2 API Changes
- [ ] Add `organization_id` to all queries
- [ ] Automatic org filtering in endpoints
  ```python
  @app.get("/costs")
  async def get_costs(
      user: User = Depends(get_current_user),
      org_id: int = Query(None)
  ):
      # If org_id not provided, use user's primary org
      # Validate user has access to this org
      # Return only that org's data
  ```

- [ ] Endpoint to list user's organizations
- [ ] Endpoint to invite users to organization
- [ ] Endpoint to manage user roles within organization

#### 2.3 Frontend Changes
- [ ] **Organization selector** (top-left dropdown)
  - Show list of orgs user belongs to
  - Switch between orgs without re-login
  - Create new org option

- [ ] **Team management page** (`/dashboard/settings/team`)
  - List team members
  - Invite new members (email)
  - Manage member roles (admin, analyst, readonly)
  - Remove members

- [ ] **Organization settings** (`/dashboard/settings/organization`)
  - Org name, description
  - Plan/subscription info
  - Billing portal link

#### 2.4 Database Migration
```python
# Add migration script to:
# 1. Create organizations table
# 2. Create user_organizations junction
# 3. Move all credentials to org "default" 
# 4. Create default org for each existing user
```

---

## 🎯 Priority 3: Advanced ML & Forecasting (MEDIUM)

**Current State:** Basic linear forecasting implemented  
**Impact:** Better cost predictions, competitive advantage  
**Effort:** 60-80 hours

### What's Needed:

#### 3.1 Time Series Forecasting
- [ ] **ARIMA model** (for seasonal patterns)
  - Train on 90-day historical data
  - Forecast 6-month forward
  - Confidence intervals (80%, 95%)

- [ ] **Prophet** (Facebook's forecasting library)
  - Better handles seasonality + trends
  - Built-in trend detection
  - Holiday adjustments

- [ ] **Model persistence**
  - Save trained models to disk/DB
  - Retrain weekly
  - A/B test model accuracy

#### 3.2 Anomaly Detection (ML-Enhanced)
- [ ] **Isolation Forest** instead of just std dev
  - More accurate anomaly scoring
  - Handle multi-dimensional outliers
  - Real-time detection

- [ ] **DBSCAN clustering**
  - Identify anomaly clusters (not just spikes)
  - Better context for anomalies

#### 3.3 Recommendation Engine (ML)
- [ ] **Collaborative filtering**
  - "Similar companies do this"
  - Industry benchmarking
  - Historical effectiveness tracking

- [ ] **Reinforcement learning**
  - Track which recommendations users implement
  - Personaliza suggestion ranking
  - Learn from failures

**New Dependencies:**
```toml
scikit-learn = "^1.3.0"
prophet = "^1.1.5"
statsmodels = "^0.14.0"
tensorflow = "^2.13.0"  # For neural networks later
```

---

## 🎯 Priority 4: Integration & Notifications (MEDIUM)

**Current State:** No external integrations  
**Impact:** Increase adoption, automate workflows  
**Effort:** 40-60 hours

### What's Needed:

#### 4.1 Slack Integration
- [ ] **Bot commands**
  ```
  /optiora costs              # Show monthly spend
  /optiora anomalies          # Show recent anomalies
  /optiora recommendations    # Show top savings
  /optiora status             # Health check
  ```

- [ ] **Incoming webhooks**
  - New anomaly detected → Slack alert
  - Recommendation posted → Slack notification
  - Daily cost digest → Slack message

- [ ] **OAuth for Slack**
  - User clicks "Connect Slack"
  - Get workspace access token
  - Store encrypted in database
  - Auto-send alerts to channel

#### 4.2 Teams Integration
- [ ] Same as Slack but for Microsoft Teams
- [ ] Adaptive cards for rich formatting
- [ ] Shared channels support

#### 4.3 Email Notifications
- [ ] **Templates** (using Jinja2)
  - Daily digest email
  - Weekly summary with trends
  - New anomaly alert
  - Recommendation highlights

- [ ] **Scheduling**
  - Let users configure frequency
  - Time zone aware
  - Unsubscribe link

#### 4.4 Jira/Azure DevOps Integration
- [ ] **Auto-create tickets** for recommendations
  - Ticket type: Task
  - Label: optiora-recommendation
  - Priority based on savings amount
  - Link to dashboard view

- [ ] **OAuth for both platforms**
  - Connect account in settings
  - Test connection
  - List accessible projects

**Dependencies:**
```toml
slack-sdk = "^3.23.0"
pymsteams = "^0.2.2"
msoauth = "^0.1.0"
jira = "^3.13.0"
sendgrid = "^6.10.0"  # For email
```

---

## 🎯 Priority 5: Custom Cost Rules (MEDIUM)

**Current State:** Fixed recommendation engine  
**Impact:** Enterprise requirement, key differentiator  
**Effort:** 40-50 hours

### What's Needed:

#### 5.1 Rule Builder (Backend)
- [ ] **Rule model**
  ```python
  class CostRule(Base):
      id: int
      organization_id: int
      name: str
      description: str
      condition: str  # JSON DSL
      action: str     # JSON DSL
      enabled: bool
      created_by: int
      updated_at: datetime
  ```

- [ ] **Rule DSL** (Domain Specific Language)
  ```json
  {
    "if": {
      "service": "ec2",
      "region": "us-east-1",
      "tags": {"environment": "dev"},
      "cost_per_month": ">1000"
    },
    "then": {
      "action": "alert",
      "severity": "high",
      "channels": ["slack", "email"]
    }
  }
  ```

- [ ] **Rule engine**
  - Parse DSL
  - Evaluate against cost data
  - Execute actions

#### 5.2 Rule Builder UI
- [ ] **Visual query builder** (no-code)
  - Condition builder with dropdowns
  - Action selector
  - Save/test before enabling

- [ ] **Rule list page** (`/dashboard/settings/rules`)
  - Enable/disable toggles
  - Delete with confirmation
  - View rule execution history

#### 5.3 Rule Execution
- [ ] **Trigger on cost data refresh**
  - Check all enabled rules
  - Execute matching actions
  - Log execution results

- [ ] **Manual rule testing**
  - "Test rule with current data" button
  - Show what would happen

---

## 🎯 Priority 6: Advanced Monitoring & Analytics (LOW)

**Current State:** Basic dashboard only  
**Impact:** Improve usage analytics, support quality  
**Effort:** 30-40 hours

### What's Needed:

#### 6.1 Datadog Integration
- [ ] **Send metrics to Datadog**
  - API response times
  - Cost query execution time
  - Anomaly detection latency
  - Errors and exceptions

- [ ] **Create dashboards** in Datadog
  - Service health overview
  - Cost analysis accuracy
  - User activity metrics

#### 6.2 Usage Analytics
- [ ] **Track user interactions**
  - Page views
  - Feature usage (which recommendations clicked)
  - Time spent on features
  - Funnel analysis (signup → first recommendation)

- [ ] **Generate analytics reports**
  - DAU (daily active users)
  - Feature adoption %
  - Time-to-value (when do users see savings)

#### 6.3 Support Metrics
- [ ] **Health checks**
  - Uptime monitoring (Pingdom/UptimeRobot)
  - API latency SLO (target: <500ms)
  - Database query performance

- [ ] **Error tracking** (Sentry)
  - Catch all exceptions
  - Group by type
  - Alert on new error patterns

---

## 📅 Suggested Implementation Timeline

```
Week 1-2:   Priority 1 (Authentication)
            └─ Login, signup, JWT, basic user model

Week 3-4:   Priority 2 (Multi-tenant)
            └─ Organizations, team management, org filtering

Week 5-6:   Priority 4 (Integration)
            └─ Slack, Teams, email notifications

Week 7-8:   Priority 3 (ML/Forecasting)
            └─ ARIMA, Prophet, better anomalies

Week 9-10:  Priority 5 (Custom Rules)
            └─ Rule DSL, visual builder, execution

Week 11+:   Priority 6 (Monitoring)
            └─ Datadog, analytics, SLOs
```

---

## 🚀 Quick Start (Choose One Priority)

### To Start Authentication (Priority 1):

```bash
# Install dependencies
poetry add python-jose passlib[bcrypt] python-multipart

# Create auth module
mkdir -p finops_mcp/auth
touch finops_mcp/auth/{__init__.py,models.py,schemas.py,crud.py,dependencies.py}

# Add to pyproject.toml
[tool.sqlalchemy]
# For ORM

# Create database migration
alembic init migrations
alembic revision --autogenerate -m "add_users_table"
```

### To Start Multi-Tenant (Priority 2):

```bash
# Add to models
# org_id foreign key to all existing models

# Create migration
alembic revision --autogenerate -m "add_multi_tenant"

# Filter all queries by org
# Update API contracts
```

### To Start Integrations (Priority 4):

```bash
# Install Slack SDK
poetry add slack-sdk sendgrid

# Create integration module
mkdir -p finops_mcp/integrations
touch finops_mcp/integrations/{__init__.py,slack.py,teams.py,email.py}
```

---

## 💡 Technical Decisions Needed

1. **Auth library**: FastAPI Security + JWT vs. NextAuth?
   - Recommendation: FastAPI Security for API + NextAuth for frontend
   
2. **Database**: How to handle multi-tenant data isolation?
   - Row-level security (RLS) in PostgreSQL
   - Or application-level filtering (safer, simpler)
   
3. **ML model storage**: Where to persist trained models?
   - AWS S3 or OCI Object Storage
   - Or SQLAlchemy BLOB column
   
4. **Rule DSL format**: JSON? YAML? Custom?
   - Recommendation: JSON (easy to parse, validate)
   
5. **Error tracking**: Sentry vs. Datadog vs. custom?
   - Recommendation: Sentry (free tier available, easy setup)

---

## 📊 Success Metrics

- ✅ Auth: Users can create accounts, login persists across sessions
- ✅ Multi-tenant: Can switch between organizations without logging out
- ✅ Integrations: Slack bot responds to commands
- ✅ ML: Forecast accuracy within 15% of actual
- ✅ Custom rules: Non-technical users can create rules without code
- ✅ Monitoring: Uptime >99.5%, API <500ms p99

---

**Next Step:** Review priorities with your team and pick one to start. Recommend starting with **Priority 1 (Authentication)** as it unlocks the ability to launch a real SaaS product.
