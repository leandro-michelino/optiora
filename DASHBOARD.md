# Dashboard Architecture and Integration

## Overview

The dashboard is a Next.js application (`dashboard/`) that consumes the FastAPI backend over HTTP.

Base API URL is controlled by:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

If `NEXT_PUBLIC_API_URL` is not set, the dashboard auto-resolves the backend as:
- browser protocol + current hostname + `:8000`
- example: `http://<current-host>:8000`

## Integration Map

```text
Next.js UI
  |
  +--> /auth/* (login/register/profile/logout)
  |
  +--> /api/v1/costs
  +--> /api/v1/anomalies
  +--> /api/v1/recommendations
  |
  +--> /api/v1/credentials/*
  +--> /api/v1/scanning/*
```

## Key Frontend Modules

- `dashboard/lib/backend-url.ts` -> single source for backend URL construction
- `dashboard/lib/auth-context.tsx` -> auth/session state and user profile
- `dashboard/lib/api.ts` -> cost/anomaly/recommendation API client
- `dashboard/app/dashboard/settings/page.tsx` -> credentials + scan setup flow

## Page Responsibilities

- `dashboard/app/dashboard/page.tsx` -> top-level overview cards/charts
- `dashboard/app/dashboard/costs/page.tsx` -> detailed cost comparison and service breakdown
- `dashboard/app/dashboard/anomalies/page.tsx` -> anomaly-focused view
- `dashboard/app/dashboard/recommendations/page.tsx` -> optimization recommendation view
- `dashboard/app/dashboard/settings/page.tsx` -> cloud credentials and scan controls

## Runtime Sequence (ASCII)

```text
User opens dashboard
   |
   v
AuthContext checks local token
   |
   +--> GET /auth/profile (if token exists)
   |
   v
Dashboard pages call /api/v1/* endpoints
   |
   v
Cards/charts/components render normalized API response data
```

## Operational Notes

- If backend is unavailable, `dashboard/lib/api.ts` falls back to safe defaults for overview pages; credentials and scanning pages require live backend.
- Settings pages call backend directly and require backend availability.
- AI chat route returns a clear configuration message when `ANTHROPIC_API_KEY` is not set.
- Access tokens expire in ~30 minutes; refresh tokens are stored but not yet used by the UI—users may need to re-login after expiry.
- `npm run type-check` and `npm run lint` should pass before deployment.
- `npm run build` should pass before OCI deployment.
