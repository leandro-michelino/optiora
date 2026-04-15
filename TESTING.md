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

If `python3` resolves to `3.14`, create your virtualenv with `python3.13` (or `python3.12`) first.

Use Python `3.10` to `3.13` for backend runtime/setup.
Avoid using a Python `3.14` virtualenv for the backend test environment until the upstream `httpx/httpcore` test stack fully stabilizes there.

Regression tests:

```bash
.venv/bin/python -m unittest discover -s tests
```

Current backend coverage includes:

- registration, login, refresh-token rotation, and organization membership reads
- password reset request/completion with one-time reset tokens
- refresh-token revocation after password reset
- customer scope rejection for mismatched `customer_id`
- login rate limiting after repeated failures
- organization-scoped credential, scan history, alert, and export flows in auth-enabled regression mode

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

- Backend tests require the Python dependencies from `pyproject.toml`.
- `tests/test_auth_flow.py` forces `ENABLE_AUTH=true` internally so auth-specific regressions remain covered even though the default deployment mode is public access.
- Python `3.13` test runs currently show `datetime.utcnow()` deprecation warnings from runtime/framework code paths; functional behavior still passes.
- Next test expansion should prioritize credential CRUD with mocked provider validators and scan approval/progress flows.
- Frontend production build is a required deployment gate.
