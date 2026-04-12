# OptiOra Dashboard — Frontend Architecture (OCI-Hosted)

## Overview

The **OptiOra Dashboard** is a **React + Next.js** web application that visualizes multi-cloud FinOps data for AWS, Azure, GCP, and OCI costs.

**Important:** The dashboard and MCP server are **both hosted on OCI infrastructure**. The dashboard fetches data from the OCI-hosted MCP backend via REST API over HTTPS.

```
┌─────────────────────────────────────────────────┐
│  ORACLE CLOUD INFRASTRUCTURE (OCI)              │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │  OptiOra Dashboard (React + Next.js)    │   │
│  │  Hosted: OCI App Service / Containers   │   │
│  │  Port: 443 (HTTPS)                      │   │
│  │  URL: https://optiora.apigateway...     │   │
│  └───────────────────┬─────────────────────┘   │
│                      │ HTTPS API Calls         │
│                      ▼                         │
│  ┌─────────────────────────────────────────┐   │
│  │  OptiOra MCP Server (Python)            │   │
│  │  Hosted: OCI Compute / Container        │   │
│  │  Port: 8000 (HTTPS)                     │   │
│  │  Database: OCI PostgreSQL DBaaS         │   │
│  └─────────────────╥─────────────────────┘   │
│                    ║                         │
│      ┌─────────────╫─────────────┬─────────┐ │
│      │             ║             │         │ │
│      ▼             ▼             ▼         ▼ │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐ ┌─────────┐
│  │ AWS     │  │ Azure   │  │ GCP     │ │ OCI     │
│  │ Costs   │  │ Costs   │  │ Costs   │ │ Costs   │
│  └─────────┘  └─────────┘  └─────────┘ └─────────┘
│                                                 │
└─────────────────────────────────────────────────┘
```
                   │
    ┌──────────────┼──────────────┐
    │              │              │
    ▼              ▼              ▼
┌─────────┐  ┌─────────┐  ┌─────────┐
│ AWS     │  │ Azure   │  │ GCP     │
│ Costs   │  │ Costs   │  │ Costs   │
└─────────┘  └─────────┘  └─────────┘
```

---

## Tech Stack

### Frontend (React)
```json
{
  "framework": "React 18",
  "meta-framework": "Next.js 14+",
  "styling": "Tailwind CSS 4",
  "charts": "Recharts (lightweight charts for cost visualization)",
  "state": "TanStack Query (React Query for API data)",
  "icons": "Lucide React",
  "api": "Axios for MCP backend communication",
  "validation": "Zod for type-safe data validation",
  "testing": "Vitest + React Testing Library",
  "deployment": "OCI App Service or OCI Container Instances",
  "infrastructure": "Oracle Cloud Infrastructure (OCI)"
}
```

### Why React + Next.js on OCI?

| Feature | Benefit |
|---------|----------|
| **React** | Reusable components, fast UI updates, huge ecosystem |
| **Next.js** | SSR/SSG, file-based routing, API routes for backend calls, optimized builds |
| **OCI** | Enterprise-grade infrastructure, same region as backend & database, SLA-backed |
| **Tailwind CSS** | Rapid prototyping, low bundle size, dark mode built-in |
| **Recharts** | React-native charting, lightweight (critical for cost dashboards) |

---

## Project Structure

```
optiora-dashboard/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Home page
│   ├── dashboard/
│   │   ├── page.tsx            # Main dashboard
│   │   ├── costs/page.tsx       # Cost breakdown
│   │   ├── anomalies/page.tsx   # Anomaly alerts
│   │   ├── recommendations/page.tsx  # Recommendations
│   │   └── settings/page.tsx    # Integration settings
│   └── api/
│       ├── auth/[...nextauth]/route.ts  # Authentication
│       └── mcp/[...path]/route.ts       # Proxy to MCP backend
├── components/
│   ├── dashboard/
│   │   ├── CostSummaryCard.tsx
│   │   ├── CostTrend.tsx
│   │   ├── AnomalyAlert.tsx
│   │   └── RecommendationList.tsx
│   ├── charts/
│   │   ├── CostChart.tsx
│   │   ├── ServiceBreakdown.tsx
│   │   └── TrendForecast.tsx
│   └── common/
│       ├── Header.tsx
│       ├── Sidebar.tsx
│       └── LoadingSpinner.tsx
├── hooks/
│   ├── useCosts.ts
│   ├── useAnomalies.ts
│   └── useRecommendations.ts
├── styles/
│   └── globals.css
├── lib/
│   ├── api-client.ts           # Calls MCP backend
│   ├── hooks.ts
│   └── utils.ts
├── public/
│   ├── logo.svg
│   └── favicon.ico
├── next.config.js
├── tailwind.config.js
├── package.json
└── tsconfig.json
```

---

## API Integration (Dashboard → MCP Backend)

### Setup Environment

```env
NEXT_PUBLIC_API_URL=https://api.optiora.io
NEXT_PUBLIC_API_KEY=sk_live_xxx
```

### API Client (`lib/api-client.ts`)

```typescript
// Calls the OCI-hosted MCP backend
import axios from 'axios';

const API = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    Authorization: `Bearer ${process.env.NEXT_PUBLIC_API_KEY}`,
  },
});

export const fetchCosts = (period: string, provider: string) =>
  API.get('/tools/get_cost_summary', {
    params: { period, cloud_provider: provider },
  });

export const fetchAnomalies = (provider: string) =>
  API.get('/tools/detect_cost_anomalies', {
    params: { cloud_provider: provider },
  });

export const fetchRecommendations = (provider: string) =>
  API.get('/tools/get_optimization_recommendations', {
    params: { cloud_provider: provider },
  });
```

### React Hooks (`hooks/useCosts.ts`)

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchCosts } from '@/lib/api-client';

export const useCosts = (period: string, provider: string) => {
  return useQuery({
    queryKey: ['costs', period, provider],
    queryFn: () => fetchCosts(period, provider),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};
```

### Usage in Components

```typescript
'use client';

import { useCosts } from '@/hooks/useCosts';
import CostTrend from '@/components/charts/CostTrend';

export default function DashboardPage() {
  const { data: costs, isLoading, error } = useCosts('month', 'all');

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="card">
        <h2>Total Cost</h2>
        <p className="text-3xl font-bold">${costs.total_cost_usd}</p>
      </div>
      <CostTrend data={costs} />
    </div>
  );
}
```

---

## Key Dashboard Pages

### 1. Home / Dashboard
**Shows:**
- Total multi-cloud spend (last 30 days)
- Cost trend (chart)
- Top 5 services by cost
- Pending anomalies
- Top 3 recommendations

**API Calls:**
- `GET /tools/get_cost_summary` (all clouds)
- `GET /tools/detect_cost_anomalies`
- `GET /tools/get_optimization_recommendations`

### 2. Cost Breakdown
**Shows:**
- Costs by cloud provider (AWS vs Azure vs GCP)
- Costs by service (EC2 vs RDS vs S3, etc.)
- Costs by department/tag
- Export to CSV/PDF

**API Calls:**
- `GET /tools/get_cost_summary` (filter by service)

### 3. Anomalies & Alerts
**Shows:**
- List of detected anomalies
- Severity indicator (🔴 critical, 🟡 warning)
- Root cause analysis
- Affected services

**API Calls:**
- `GET /tools/detect_cost_anomalies`

### 4. Recommendations
**Shows:**
- Recommended optimizations (RI purchases, spot instances, etc.)
- Estimated savings & ROI
- Payback period
- Action buttons (approve/execute)

**API Calls:**
- `GET /tools/get_optimization_recommendations`
- `POST /tools/execute_cost_action` (on click)

### 5. Settings / Integrations
**Shows:**
- Connected cloud accounts (AWS, Azure, GCP)
- Slack/Teams webhooks
- Jira integration
- API tokens for custom actions

**API Calls:**
- `POST /integrations/slack`
- `POST /integrations/jira`

---

## Charts & Visualizations

### Cost Trend (Line Chart)
```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export default function CostTrend({ data }) {
  return (
    <LineChart width={600} height={300} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="date" />
      <YAxis />
      <Tooltip formatter={(value) => `$${value}`} />
      <Line type="monotone" dataKey="cost_usd" stroke="#2563eb" />
    </LineChart>
  );
}
```

### Service Breakdown (Pie Chart)
```typescript
import { PieChart, Pie, Cell, Legend } from 'recharts';

export default function ServiceBreakdown({ data }) {
  const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];

  return (
    <PieChart width={400} height={300}>
      <Pie data={data} dataKey="cost" outerRadius={80}>
        {data.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
        ))}
      </Pie>
      <Legend />
    </PieChart>
  );
}
```

### Cost Comparison (Bar Chart)
```typescript
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

export default function CostComparison({ data }) {
  return (
    <BarChart width={600} height={300} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="provider" />
      <YAxis />
      <Bar dataKey="total_cost" fill="#3b82f6" />
    </BarChart>
  );
}
```

---

## Authentication

### Option 1: NextAuth.js (Recommended)

```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

export const authOptions = {
  providers: [
    CredentialsProvider({
      async authorize(credentials) {
        // Validate against MCP backend
        const res = await fetch(`${process.env.MCP_API_URL}/auth/login`, {
          method: 'POST',
          body: JSON.stringify(credentials),
          headers: { 'Content-Type': 'application/json' },
        });

        if (!res.ok) return null;

        return res.json();
      },
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login?error=auth',
  },
};

export const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

### Option 2: Auth0
```env
AUTH0_SECRET=your_secret
AUTH0_BASE_URL=https://optiora.yourcompany.com
AUTH0_ISSUER_BASE_URL=https://yourcompany.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_secret
```

---

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel deploy

# Or connect GitHub repo (auto-deploy on push)
vercel --link
```

**Environment Variables (in Vercel):**
- `NEXT_PUBLIC_API_URL`: https://api.optiora.io
- `NEXT_PUBLIC_API_KEY`: Your MCP API key
- `AUTH0_SECRET`: Auth secret
- `DATABASE_URL`: PostgreSQL connection (optional, for server-side features)

**Cost:** Free tier supports unlimited deployments and previews

---

### CloudFlare Pages

```bash
# Build
npm run build

# Deploy
npm install -g wrangler
wrangler pages deploy build/

# Or push to GitHub (auto-deploy)
```

**Cost:** Completely free, unlimited requests

---

## Performance Optimization

### 1. Image Optimization
```typescript
import Image from 'next/image';

export default function Logo() {
  return (
    <Image
      src="/logo.svg"
      alt="OptiOra"
      width={100}
      height={100}
      priority
    />
  );
}
```

### 2. Code Splitting (Dynamic Imports)
```typescript
import dynamic from 'next/dynamic';

const ExpensiveChart = dynamic(() => import('@/components/charts/ExpensiveChart'), {
  loading: () => <div>Loading chart...</div>,
  ssr: false,
});
```

### 3. API Caching
```typescript
export const fetchCosts = async (period: string) => {
  return fetch(`/api/costs?period=${period}`, {
    next: { revalidate: 300 }, // Cache for 5 minutes
  });
};
```

---

## Testing

### Unit Tests (Vitest)
```bash
npm install -D vitest @testing-library/react
```

```typescript
// __tests__/components/CostTrend.test.tsx
import { render, screen } from '@testing-library/react';
import CostTrend from '@/components/charts/CostTrend';

describe('CostTrend', () => {
  it('renders cost chart', () => {
    const data = [{ date: '2024-01-01', cost_usd: 1000 }];
    render(<CostTrend data={data} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});
```

---

## Recommended Roadmap

| Phase | Timeline | Deliverables |
|-------|----------|--------------|
| **Phase 1** | Weeks 1–2 | Login, dashboard home, cost summary, basic charts |
| **Phase 2** | Weeks 3–4 | Cost breakdown, anomaly alerts, export to CSV |
| **Phase 3** | Weeks 5–6 | Recommendations, approval workflow, Slack integration |
| **Phase 4** | Weeks 7–8 | Multi-user admin panel, audit logs, compliance reports |

---

## Alternative Frameworks (Not Recommended)

| Framework | Pros | Cons |
|-----------|------|------|
| **Vue (Nuxt)** | Easier learning curve | Smaller ecosystem than React |
| **Svelte** | Best performance | Very new, smaller community |
| **Angular** | Enterprise-ready | Overkill for this use case, steep learning curve |
| **React + Remix** | Better data fetching | Overkill for MVP, adds complexity |

**Verdict:** ✅ **Next.js + React** is the best choice for FinOps dashboard.

---

## Next Steps

1. ✅ Create Next.js project: `npx create-next-app@latest optiora-dashboard`
2. ✅ Install Tailwind CSS & UI components (Lucide React)
3. ✅ Setup API client & React Query hooks
4. ✅ Build dashboard pages (home, costs, anomalies, recommendations, settings)
5. ✅ Integrate with MCP backend (REST API calls via Axios)
6. ✅ Deploy to OCI (via `./deploy/deploy-oci.sh`)
7. ✅ Setup authentication (session tokens with MCP backend)

---

## Deployment to OCI

The dashboard is deployed as part of the unified OCI infrastructure:

```bash
# From project root
chmod +x deploy/deploy-oci.sh
./deploy/deploy-oci.sh
```

This will:
- ✅ Build Next.js production bundle
- ✅ Create OCI Container Instance
- ✅ Configure OCI API Gateway
- ✅ Enable HTTPS/SSL certificates
- ✅ Deploy alongside MCP backend

See [OCI_DEPLOYMENT.md](./OCI_DEPLOYMENT.md) and [SETUP.md](./SETUP.md) for details.

---

**Ready to build the dashboard? The deployment is handled by OCI infrastructure automation 🚀**
