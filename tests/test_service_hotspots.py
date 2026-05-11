"""Tests for cross-service hotspots endpoint.

Covers:
- Live provider top-service aggregation with focus filters.
- CSV-import fallback when live providers are not configured.
"""

import os
import tempfile
import unittest
from datetime import datetime
from types import SimpleNamespace

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_service_hotspots_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-service-hotspots"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient

    import optiora_backend.api as api_module
    from optiora_backend.app import app
    from optiora_backend.orm_models import Base, CostSnapshot, SessionLocal, engine
except ImportError as exc:  # pragma: no cover
    raise unittest.SkipTest(f"Backend dependencies not installed: {exc}") from exc


def _register_and_login(client: TestClient, email: str) -> str:
    client.post(
        "/auth/register",
        json={"email": email, "password": "StrongPass1!", "full_name": "Service Hotspots Tester"},
    )
    resp = client.post("/auth/login", json={"email": email, "password": "StrongPass1!"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


class ServiceHotspotsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)
        token = _register_and_login(cls.client, "service-hotspots@example.com")
        cls.headers = {"Authorization": f"Bearer {token}"}
        org = cls.client.get("/auth/organization", headers=cls.headers)
        cls.customer_id = f"org-{org.json()['id']}"

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        try:
            os.remove(TEST_DB)
        except FileNotFoundError:
            pass

    def test_live_service_hotspots_with_focus(self) -> None:
        async def _fake_cost_summary(provider: str, period: str = "month", **kwargs) -> dict:
            _ = period
            if provider == "aws":
                return {
                    "total_cost_usd": 2000,
                    "top_services": [
                        {"service": "AWS Lambda", "cost_usd": 700},
                        {"service": "Amazon RDS", "cost_usd": 500},
                    ],
                }
            if provider == "azure":
                return {
                    "total_cost_usd": 1200,
                    "top_services": [
                        {"service": "Azure Functions", "cost_usd": 450},
                        {"service": "Azure SQL Database", "cost_usd": 350},
                    ],
                }
            if provider == "gcp":
                return {"total_cost_usd": 900, "top_services": [{"service": "Cloud Run", "cost_usd": 400}]}
            return {"total_cost_usd": 600, "top_services": [{"service": "OCI Functions", "cost_usd": 250}]}

        original_cost_summary = api_module._cost_summary_for_provider
        original_diagnostics = api_module._provider_diagnostics
        try:
            api_module._cost_summary_for_provider = _fake_cost_summary
            api_module._provider_diagnostics = lambda *args, **kwargs: [
                SimpleNamespace(provider="aws", configured=True),
                SimpleNamespace(provider="azure", configured=True),
                SimpleNamespace(provider="gcp", configured=True),
                SimpleNamespace(provider="oci", configured=True),
            ]
            resp = self.client.get(
                "/api/v1/analytics/service-hotspots?cloud_provider=all&focus=serverless&limit=5",
                headers=self.headers,
            )
            self.assertEqual(resp.status_code, 200, resp.text)
            payload = resp.json()
            self.assertGreaterEqual(len(payload.get("items", [])), 1)
            top = payload["items"][0]
            self.assertIn("source", top)
            self.assertEqual(top["source"], "live_provider_api")
            self.assertIn("service", top)
            self.assertTrue(
                any(term in top["service"].lower() for term in ("lambda", "function", "cloud run")),
                f"unexpected top service for serverless focus: {top}",
            )
        finally:
            api_module._cost_summary_for_provider = original_cost_summary
            api_module._provider_diagnostics = original_diagnostics

    def test_service_hotspots_fallback_to_csv_import(self) -> None:
        csv_rows = (
            "provider,cost_usd,service_name,account_identifier,account_name,account_type,region,currency\n"
            "aws,300.00,Amazon RDS,acct-1,AWS Prod,account,us-east-1,USD\n"
            "aws,200.00,AWS Lambda,acct-1,AWS Prod,account,us-east-1,USD\n"
            "azure,180.00,Azure SQL Database,sub-1,Azure Prod,subscription,eastus,USD\n"
        )
        upload = self.client.post(
            "/api/v1/imports/costs/csv",
            files={"file": ("services.csv", csv_rows, "text/csv")},
            headers=self.headers,
        )
        self.assertIn(upload.status_code, (200, 201), upload.text)

        original_diagnostics = api_module._provider_diagnostics
        try:
            api_module._provider_diagnostics = lambda *args, **kwargs: [
                SimpleNamespace(provider="aws", configured=False),
                SimpleNamespace(provider="azure", configured=False),
                SimpleNamespace(provider="gcp", configured=False),
                SimpleNamespace(provider="oci", configured=False),
            ]
            resp = self.client.get(
                "/api/v1/analytics/service-hotspots?cloud_provider=all&focus=database&limit=5",
                headers=self.headers,
            )
            self.assertEqual(resp.status_code, 200, resp.text)
            payload = resp.json()
            self.assertGreaterEqual(len(payload.get("items", [])), 1)
            top = payload["items"][0]
            self.assertEqual(top.get("source"), "csv_import")
            normalized = top.get("service", "").lower()
            self.assertTrue(
                ("database" in normalized) or ("rds" in normalized) or ("sql" in normalized),
                f"unexpected top database-like service: {top}",
            )
        finally:
            api_module._provider_diagnostics = original_diagnostics

    def test_service_hotspots_prefers_live_snapshot_before_csv_import(self) -> None:
        csv_rows = (
            "provider,cost_usd,service_name,account_identifier,account_name,account_type,region,currency\n"
            "aws,900.00,Amazon S3,acct-1,AWS Prod,account,us-east-1,USD\n"
        )
        upload = self.client.post(
            "/api/v1/imports/costs/csv",
            files={"file": ("snapshot-vs-csv.csv", csv_rows, "text/csv")},
            headers=self.headers,
        )
        self.assertIn(upload.status_code, (200, 201), upload.text)

        db = SessionLocal()
        try:
            db.add(
                CostSnapshot(
                    scan_id="service-hotspots-snapshot",
                    customer_id=self.customer_id,
                    provider="aws",
                    period_start=datetime(2026, 5, 1),
                    period_end=datetime(2026, 5, 31),
                    total_cost_usd=250.0,
                    top_services_json='[{"service":"Amazon EC2","cost_usd":250.0}]',
                    captured_at=datetime(2026, 5, 11, 12, 0, 0),
                )
            )
            db.commit()
        finally:
            db.close()

        original_diagnostics = api_module._provider_diagnostics
        try:
            api_module._provider_diagnostics = lambda *args, **kwargs: [
                SimpleNamespace(provider="aws", configured=False),
                SimpleNamespace(provider="azure", configured=False),
                SimpleNamespace(provider="gcp", configured=False),
                SimpleNamespace(provider="oci", configured=False),
            ]
            resp = self.client.get(
                "/api/v1/analytics/service-hotspots?cloud_provider=aws&limit=5",
                headers=self.headers,
            )
            self.assertEqual(resp.status_code, 200, resp.text)
            item = resp.json()["items"][0]
            self.assertEqual(item["source"], "cost_snapshots_live")
            self.assertEqual(item["service"], "Amazon EC2")
        finally:
            api_module._provider_diagnostics = original_diagnostics


if __name__ == "__main__":
    unittest.main()
