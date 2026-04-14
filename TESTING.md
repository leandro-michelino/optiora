# Testing and Verification

## Backend

Static verification:

```bash
python3 -m py_compile finops_mcp/*.py finops_mcp/tools/*.py
python3 -m compileall finops_mcp
```

Once backend dependencies are installed:

```bash
source .venv/bin/activate
python -m finops_mcp.app
```

Use Python `3.10` to `3.13` for backend runtime/setup.

Smoke endpoints:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/api/v1/info
```

Auth smoke flow:

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"StrongPass1!","full_name":"Test User"}'
```

## Frontend

```bash
cd dashboard
npm run type-check
npm run lint
npm run build
```

## Terraform

```bash
terraform -chdir=terraform validate
```

## Notes

- This repo currently relies on compile/build/smoke verification rather than a restored backend unit-test suite.
- If you add backend tests later, prioritize auth, credential scoping, scan approval, and refresh-token flows.
- Frontend production build is a required deployment gate.
