"""Tests for the Unit Economics API endpoints.

Covers:
- GET  /api/v1/analytics/unit-economics        (basic cost metrics + grade)
- GET  /api/v1/analytics/unit-economics/cockpit (summary + provider breakdown)
- POST /api/v1/analytics/unit-economics/metrics (cost-per-unit calculation)
"""

import os
import tempfile
import unittest

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_uniteco_test_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-uniteco"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient

    from finops_mcp.app import app
    from finops_mcp.orm_models import Base, engine
except ImportError as exc:  # pragma: no cover
    raise unittest.SkipTest(f"Backend dependencies not installed: {exc}") from exc


def _register_and_login(client: TestClient, email: str = "uniteco@example.com") -> str:
    client.post(
        "/auth/register",
        json={"email": email, "password": "StrongPass1!", "full_name": "UnitEco Tester"},
    )
    resp = client.post("/auth/login", json={"email": email, "password": "StrongPass1!"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


class UnitEconomicsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)
        cls.token = _register_and_login(cls.client)
        cls.headers = {"Authorization": f"Bearer {cls.token}"}

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        try:
            os.remove(TEST_DB)
        except FileNotFoundError:
            pass

    # ── GET /analytics/unit-economics ────────────────────────────────────────

    def test_01_unit_economics_returns_200(self) -> None:
        resp = self.client.get("/api/v1/analytics/unit-economics", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)

    def test_02_unit_economics_response_shape(self) -> None:
        resp = self.client.get("/api/v1/analytics/unit-economics", headers=self.headers)
        data = resp.json()
        # Must include top-level FinOps metrics fields
        self.assertIn("generated_at", data)
        for field in ("current_monthly_spend_usd", "dollar_efficiency_score"):
            self.assertIn(field, data, f"missing field: {field}")

    def test_03_unit_economics_provider_filter(self) -> None:
        for provider in ("aws", "azure", "gcp", "oci", "all"):
            resp = self.client.get(
                f"/api/v1/analytics/unit-economics?cloud_provider={provider}",
                headers=self.headers,
            )
            self.assertEqual(resp.status_code, 200, f"provider={provider}: {resp.text}")

    # ── GET /analytics/unit-economics/cockpit ────────────────────────────────

    def test_04_cockpit_returns_200(self) -> None:
        resp = self.client.get("/api/v1/analytics/unit-economics/cockpit", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)

    def test_05_cockpit_response_shape(self) -> None:
        resp = self.client.get("/api/v1/analytics/unit-economics/cockpit", headers=self.headers)
        data = resp.json()
        self.assertIn("generated_at", data)
        self.assertIn("summary", data)
        self.assertIn("provider_metrics", data)
        self.assertIsInstance(data["provider_metrics"], list)
        summary = data["summary"]
        for field in (
            "total_monthly_cost_usd",
            "estimated_waste_usd",
            "identified_savings_usd",
            "waste_to_spend_percent",
            "dollar_efficiency_score",
        ):
            self.assertIn(field, summary, f"summary missing field: {field}")

    def test_06_cockpit_waste_percent_non_negative(self) -> None:
        resp = self.client.get("/api/v1/analytics/unit-economics/cockpit", headers=self.headers)
        data = resp.json()
        self.assertGreaterEqual(data["summary"]["waste_to_spend_percent"], 0.0)

    # ── POST /analytics/unit-economics/metrics ───────────────────────────────

    def test_07_record_metric_returns_200(self) -> None:
        resp = self.client.post(
            "/api/v1/analytics/unit-economics/metrics",
            json={"metric_name": "customers", "metric_value": 1000.0, "metric_unit": "customers"},
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.text)

    def test_08_record_metric_response_shape(self) -> None:
        resp = self.client.post(
            "/api/v1/analytics/unit-economics/metrics",
            json={"metric_name": "requests", "metric_value": 5000.0, "metric_unit": "requests"},
            headers=self.headers,
        )
        data = resp.json()
        self.assertIn("metric_name", data)
        self.assertIn("metric_value", data)
        self.assertIn("cost_per_unit_usd", data)
        self.assertEqual(data["metric_name"], "requests")

    def test_09_record_metric_invalid_value_rejected(self) -> None:
        resp = self.client.post(
            "/api/v1/analytics/unit-economics/metrics",
            json={"metric_name": "bad", "metric_value": -1.0},
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 422)

    def test_10_unauthenticated_rejected(self) -> None:
        fresh = TestClient(app)
        for url in (
            "/api/v1/analytics/unit-economics",
            "/api/v1/analytics/unit-economics/cockpit",
        ):
            resp = fresh.get(url)
            self.assertIn(resp.status_code, (401, 403), f"{url} should require auth")


if __name__ == "__main__":
    unittest.main()
