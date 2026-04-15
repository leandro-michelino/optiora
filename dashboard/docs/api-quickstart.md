## API Quickstart (OCI-only)

Base URL: set `NEXT_PUBLIC_API_URL` (frontend) or call backend directly (default `http://localhost:8000`).

### Auth
- Most dashboard endpoints here are unauthenticated for demo; production should send `Authorization: Bearer <token>` when enabled.

### Costs
```bash
curl "$NEXT_PUBLIC_API_URL/api/v1/costs"
```

### Anomalies (paged)
```bash
curl "$NEXT_PUBLIC_API_URL/api/v1/anomalies?limit=20&offset=0"
```

### Recommendations (paged)
```bash
curl "$NEXT_PUBLIC_API_URL/api/v1/recommendations?limit=20&offset=0"
```

### Forecast
```bash
curl "$NEXT_PUBLIC_API_URL/api/v1/forecast?months=12"
```

### Analytics
```bash
curl "$NEXT_PUBLIC_API_URL/api/v1/analytics"
```

### Health & Info
```bash
curl "$NEXT_PUBLIC_API_URL/health"
curl "$NEXT_PUBLIC_API_URL/api/v1/info"
```

### Notes
- AI advisor uses OCI GenAI only; configure env vars: `OCI_GENAI_ENDPOINT`, `OCI_GENAI_MODEL`, `OCI_COMPARTMENT_OCID`, `OCI_TENANCY_OCID`, `OCI_USER_OCID`, `OCI_FINGERPRINT`, `OCI_PRIVATE_KEY`, `OCI_REGION`.
- Pagination: pass `limit` and `offset`; responses include `items`, `total`, `limit`, `offset`.