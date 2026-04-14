# Dashboard Architecture and Integration

The dashboard is a Next.js application in `dashboard/` that talks to the FastAPI backend over HTTP.

## Backend URL Resolution

Preferred env:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Fallback behavior when the env var is unset:

```text
window.location.protocol + "//" + window.location.hostname + ":8000"
```

That fallback is useful for simple VM deployments where the dashboard and API share one host.

## Integration Map

```text
Next.js UI
  |
  +--> /auth/*                        (login/register/profile/logout/refresh)
  +--> /api/v1/costs                 (overview + cost pages)
  +--> /api/v1/anomalies             (anomaly pages)
  +--> /api/v1/recommendations       (recommendation pages)
  +--> /api/v1/credentials/*         (settings workflow)
  +--> /api/v1/scanning/*            (approval + progress workflow)
```

## Key Frontend Modules

- `dashboard/lib/backend-url.ts`: backend URL resolution
- `dashboard/lib/auth-context.tsx`: session state and profile loading
- `dashboard/lib/auth-fetch.ts`: authenticated fetch + refresh retry
- `dashboard/lib/api.ts`: dashboard overview API client
- `dashboard/app/dashboard/settings/page.tsx`: credentials + scan setup flow

## Runtime Sequence

```text
User opens dashboard
   |
   v
AuthProvider checks access / refresh token
   |
   +--> GET /auth/profile
   +--> if 401, POST /auth/refresh and retry
   |
   v
Dashboard pages call /api/v1/* endpoints
   |
   v
Charts/cards/settings render normalized API data
```

## Operational Notes

- Overview pages can fall back to safe mock data if the backend is down.
- Settings and auth flows require a live backend.
- Protected calls use bearer auth and retry once with `/auth/refresh`.
- AI chat returns a configuration message when `ANTHROPIC_API_KEY` is not set.
- `npm run type-check`, `npm run lint`, and `npm run build` are required before deployment.
