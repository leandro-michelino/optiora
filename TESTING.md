# Testing Guide for OptiOra

## Current Status

The automated test suite was removed in commit `d129b13` (April 14 2026) to reduce
maintenance overhead during the current development phase.

**There are no automated tests in this repository at this time.**

---

## Test Coverage Targets (for when tests are re-introduced)

| Module                                | Target coverage | Notes                        |
| ------------------------------------- | --------------- | ---------------------------- |
| `finops_mcp/tools/aws_costs.py`       | ≥ 70%           | Mock boto3 Cost Explorer     |
| `finops_mcp/tools/azure_costs.py`     | ≥ 70%           | Mock Azure SDK               |
| `finops_mcp/tools/gcp_costs.py`       | ≥ 70%           | Mock GCP billing client      |
| `finops_mcp/tools/oci_costs.py`       | ≥ 70%           | Mock OCI Usage API           |
| `finops_mcp/tools/anomalies.py`       | ≥ 90%           | Pure logic — easy to cover   |
| `finops_mcp/tools/recommendations.py` | ≥ 85%           | ROI ranking logic            |
| `finops_mcp/auth_routes.py`           | ≥ 80%           | Auth endpoints               |
| `finops_mcp/api.py`                   | ≥ 75%           | Credential & scanning routes |

---

## Suggested Test Structure (when re-introduced)

```text
tests/
├── __init__.py
├── conftest.py                      # Shared fixtures (test DB, mock clients)
├── test_aws_costs.py                # AWS Cost Explorer integration
├── test_azure_gcp_costs.py          # Azure & GCP cost integrations
├── test_oci_costs.py                # OCI Usage API
├── test_anomalies.py                # Statistical anomaly detection
├── test_recommendations.py          # ROI-ranked recommendations
├── test_auth.py                     # Register / login / refresh / logout
└── test_api.py                      # Credential & scanning endpoints
```

### Recommended tooling

```toml
# pyproject.toml additions
[tool.poetry.group.dev.dependencies]
pytest = "^7.4.0"
pytest-asyncio = "^0.23.0"
pytest-cov = "^4.1.0"
httpx = "^0.27.0"   # for TestClient with async FastAPI apps
```

### Run tests (once re-introduced)

```bash
# All tests with coverage
pytest tests/ -v --cov=finops_mcp --cov-report=term-missing

# Single module
pytest tests/test_anomalies.py -v

# Filter by name
pytest tests/ -k "auth" -v
```

### Test template

```python
import pytest
from fastapi.testclient import TestClient
from finops_mcp.app import app

client = TestClient(app)


class TestYourFeature:
    def test_something(self):
        response = client.get("/api/v1/health")
        assert response.status_code == 200

    def test_error_path(self):
        response = client.post("/api/v1/credentials/validate", json={"provider": "unknown"})
        assert response.status_code == 400
```

---

## Manual Verification

Until automated tests are restored, verify functionality manually after each change:

1. **Backend health** — `curl http://localhost:8000/health`
2. **API docs** — open `http://localhost:8000/docs` (FastAPI auto-generated Swagger UI)
3. **Auth flow** — register → login → refresh → logout via Swagger UI
4. **Credential validation** — submit a real or clearly-invalid credential set
5. **Frontend** — `cd dashboard && npm run dev`, then open `http://localhost:3000`

---

*Tests should be re-introduced before any production deployment to OCI.*
