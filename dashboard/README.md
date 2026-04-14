# OptiOra Dashboard

Next.js frontend for OptiOra.

## Run Locally

```bash
npm install
npm run dev
```

Default URL: `http://localhost:3000`

## Backend URL

Set backend base URL via:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

The dashboard uses this for:

- `/auth/*`
- `/api/v1/costs`
- `/api/v1/anomalies`
- `/api/v1/recommendations`
- `/api/v1/credentials/*`
- `/api/v1/scanning/*`

## Checks

```bash
npm run type-check
npm run lint
npm run build
```
