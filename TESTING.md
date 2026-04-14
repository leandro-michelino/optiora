# Testing and Verification

## Backend

Current repo verification is primarily static/runtime checks:

```bash
python3 -m py_compile finops_mcp/*.py finops_mcp/tools/*.py
```

## Frontend

```bash
cd dashboard
npm run type-check
npm run lint
npm run build
```

## Smoke Checks (Running System)

```bash
curl http://localhost:8000/health
curl http://localhost:8000/api/v1/info
curl http://localhost:8000/api/v1/costs
```

## Notes

- Automated backend unit/integration test suites are not yet restored in this repo.
- Before production rollout, add API tests for auth, credential workflow, and scan progress.
