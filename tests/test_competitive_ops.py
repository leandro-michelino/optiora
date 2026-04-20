"""Regression tests for competitive operations capabilities.

Covers:
- Alert lifecycle actions (acknowledge, dismiss, reactivate)
- Routing policy simulator
- Data freshness operations endpoint
"""

import os
import tempfile
import unittest

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_competitive_ops_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-competitive-ops"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient

    from finops_mcp.app import app
    from finops_mcp.orm_models import Base, engine
except ImportError as exc:  # pragma: no cover
    raise unittest.SkipTest(f"Backend dependencies not installed: {exc}") from exc


def _register_and_login(client: TestClient, email: str = "competitive.ops@example.com") -> str:
    client.post(
        "/auth/register",
        json={"email": email, "password": "StrongPass1!", "full_name": "Competitive Ops Tester"},
    )
    resp = client.post("/auth/login", json={"email": email, "password": "StrongPass1!"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


class CompetitiveOpsTest(unittest.TestCase):
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

    def _create_alert(self) -> int:
        ingest = self.client.post(
            "/api/v1/anomalies/external/aws",
            json={
                "events": [
                    {
                        "detail": {
                            "anomalyId": f"competitive-anomaly-{os.getpid()}",
                            "monitorName": "competitive-monitor",
                            "impact": {"totalImpact": 123.45},
                        }
                    }
                ]
            },
            headers=self.headers,
        )
        self.assertEqual(ingest.status_code, 200, ingest.text)
        return int(ingest.json()["alert_ids"][0])

    def test_01_alert_lifecycle_transitions(self) -> None:
        alert_id = self._create_alert()

        dismiss = self.client.post(f"/api/v1/alerts/{alert_id}/dismiss", headers=self.headers)
        self.assertEqual(dismiss.status_code, 200, dismiss.text)
        self.assertEqual(dismiss.json().get("lifecycle_state"), "dismissed")

        alerts = self.client.get("/api/v1/alerts", headers=self.headers)
        self.assertEqual(alerts.status_code, 200, alerts.text)
        row = next(item for item in alerts.json() if item["id"] == alert_id)
        self.assertEqual(row.get("lifecycle_state"), "dismissed")

        reactivate = self.client.post(f"/api/v1/alerts/{alert_id}/reactivate", headers=self.headers)
        self.assertEqual(reactivate.status_code, 200, reactivate.text)
        self.assertEqual(reactivate.json().get("lifecycle_state"), "reactivated")

        acknowledge = self.client.post(f"/api/v1/alerts/{alert_id}/acknowledge", headers=self.headers)
        self.assertEqual(acknowledge.status_code, 200, acknowledge.text)
        self.assertEqual(acknowledge.json().get("lifecycle_state"), "acknowledged")

        alerts_after = self.client.get("/api/v1/alerts", headers=self.headers)
        self.assertEqual(alerts_after.status_code, 200, alerts_after.text)
        row_after = next(item for item in alerts_after.json() if item["id"] == alert_id)
        self.assertEqual(row_after.get("lifecycle_state"), "acknowledged")
        self.assertIsNotNone(row_after.get("acknowledged_at"))

    def test_02_routing_policy_simulator(self) -> None:
        upsert = self.client.post(
            "/api/v1/alerts/routing-policies",
            json={"severity": "critical", "channels": ["email", "slack"], "is_active": True},
            headers=self.headers,
        )
        self.assertEqual(upsert.status_code, 200, upsert.text)

        simulate = self.client.post(
            "/api/v1/alerts/routing-policies/simulate",
            json={"severity": "critical", "title": "Budget spike", "alert_type": "budget"},
            headers=self.headers,
        )
        self.assertEqual(simulate.status_code, 200, simulate.text)
        data = simulate.json()
        self.assertEqual(data.get("severity"), "critical")
        self.assertIn("evaluated_channels", data)
        self.assertIn("expected_channels", data)

    def test_03_operations_data_freshness_endpoint(self) -> None:
        resp = self.client.get("/api/v1/operations/data-freshness", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("providers", data)
        self.assertIn("connectors", data)
        self.assertIn("scheduler_status", data)
        self.assertIsInstance(data["providers"], list)
        self.assertIsInstance(data["connectors"], list)


if __name__ == "__main__":
    unittest.main()
