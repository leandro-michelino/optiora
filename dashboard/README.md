# OptiOra Dashboard

Next.js frontend for OptiOra.

## Run Locally

```bash
npm install
npm run dev
```

Default URL: `http://localhost:3000`

## Backend URL

Preferred env:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

If unset, the dashboard falls back to:

```text
<current browser protocol>://<current hostname>:8000
```

## Checks

```bash
npm run type-check
npm run lint
npm run build
```

## Notes

- protected requests use bearer auth and refresh-token retry
- overview pages mark partial or fallback data explicitly
- settings/auth flows require a live backend
