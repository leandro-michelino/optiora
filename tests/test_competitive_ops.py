"""Regression tests for competitive operations capabilities.

Covers:
- Alert lifecycle actions (acknowledge, dismiss, reactivate)
- Routing policy simulator
- Data freshness operations endpoint
"""

import os
import tempfile
import unittest
from uuid import uuid4

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_competitive_ops_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-competitive-ops"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient

    from optiora_backend.app import app
    from optiora_backend.orm_models import Base, engine
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
        engine.dispose()
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
                            "anomalyId": f"competitive-anomaly-{os.getpid()}-{uuid4().hex}",
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

    def test_04_notification_destination_delivery_outcomes(self) -> None:
        alert_id = self._create_alert()
        success = self.client.post(
            f"/api/v1/alerts/{alert_id}/channel-delivery",
            json={"alert_id": alert_id, "channel": "email", "status": "success"},
            headers=self.headers,
        )
        self.assertEqual(success.status_code, 200, success.text)

        error = self.client.post(
            f"/api/v1/alerts/{alert_id}/channel-delivery",
            json={
                "alert_id": alert_id,
                "channel": "slack",
                "status": "error",
                "error_message": "webhook rejected",
            },
            headers=self.headers,
        )
        self.assertEqual(error.status_code, 200, error.text)

        destinations = self.client.get("/api/v1/notifications/destinations", headers=self.headers)
        self.assertEqual(destinations.status_code, 200, destinations.text)
        by_channel = {item["channel"]: item for item in destinations.json()["destinations"]}
        self.assertIsNotNone(by_channel["email"].get("last_success_at"))
        self.assertIsNone(by_channel["email"].get("last_error_at"))
        self.assertIsNotNone(by_channel["slack"].get("last_error_at"))

    def test_05_alert_ops_policy_and_executive_summary(self) -> None:
        update = self.client.put(
            "/api/v1/alerts/ops-policy",
            json={
                "mute_window_enabled": False,
                "mute_start_hour_utc": 0,
                "mute_end_hour_utc": 0,
                "mute_weekends": False,
                "timezone": "UTC",
                "escalation_enabled": True,
                "escalation_after_minutes": 30,
                "escalation_channels": ["email", "slack"],
                "escalation_severity": "warning",
                "ack_sla_minutes": 15,
                "dedupe_window_minutes": 0,
                "min_severity": "low",
                "daily_summary_enabled": True,
                "weekly_summary_enabled": True,
            },
            headers=self.headers,
        )
        self.assertEqual(update.status_code, 200, update.text)
        payload = update.json()
        self.assertEqual(payload["ack_sla_minutes"], 15)
        self.assertTrue(payload["escalation_enabled"])

        self._create_alert()
        summary = self.client.get(
            "/api/v1/alerts/executive-summary?period=daily",
            headers=self.headers,
        )
        self.assertEqual(summary.status_code, 200, summary.text)
        summary_payload = summary.json()
        self.assertIn("total_alerts", summary_payload)
        self.assertIn("by_severity", summary_payload)
        self.assertGreaterEqual(summary_payload["total_alerts"], 1)

    def test_06_alert_policy_min_severity_suppresses_low_signal_external_event(self) -> None:
        update = self.client.put(
            "/api/v1/alerts/ops-policy",
            json={
                "mute_window_enabled": False,
                "mute_start_hour_utc": 0,
                "mute_end_hour_utc": 0,
                "mute_weekends": False,
                "timezone": "UTC",
                "escalation_enabled": False,
                "escalation_after_minutes": 60,
                "escalation_channels": ["email"],
                "escalation_severity": "critical",
                "ack_sla_minutes": 60,
                "dedupe_window_minutes": 0,
                "min_severity": "critical",
                "daily_summary_enabled": True,
                "weekly_summary_enabled": True,
            },
            headers=self.headers,
        )
        self.assertEqual(update.status_code, 200, update.text)

        ingest = self.client.post(
            "/api/v1/anomalies/external/aws",
            json={
                "events": [
                    {
                        "detail": {
                            "anomalyId": f"competitive-suppress-{os.getpid()}-{uuid4().hex}",
                            "monitorName": "low-impact-monitor",
                            "impact": {"totalImpact": 5.0},
                        }
                    }
                ]
            },
            headers=self.headers,
        )
        self.assertEqual(ingest.status_code, 200, ingest.text)
        ingest_payload = ingest.json()
        self.assertEqual(ingest_payload["ingested"], 0)
        self.assertGreaterEqual(ingest_payload.get("suppressed", 0), 1)

    def test_07_scheduler_policy_update_and_status_exposure(self) -> None:
        update = self.client.patch(
            "/api/v1/scanning/scheduler/policy",
            json={
                "scheduler_override_enabled": True,
                "scheduler_override_frequency": "hourly",
                "scheduler_retry_max_attempts": 3,
                "scheduler_retry_backoff_seconds": 45,
                "scheduler_overdue_alert_hours": 12,
            },
            headers=self.headers,
        )
        self.assertEqual(update.status_code, 200, update.text)
        permission = update.json()
        self.assertTrue(permission["scheduler_override_enabled"])
        self.assertEqual(permission["scheduler_override_frequency"], "hourly")
        self.assertEqual(permission["scheduler_retry_max_attempts"], 3)
        self.assertEqual(permission["scheduler_retry_backoff_seconds"], 45)
        self.assertEqual(permission["scheduler_overdue_alert_hours"], 12)

        scheduler = self.client.get("/api/v1/scanning/scheduler/status", headers=self.headers)
        self.assertEqual(scheduler.status_code, 200, scheduler.text)
        scheduler_payload = scheduler.json()
        self.assertIn("effective_scan_frequency", scheduler_payload)
        self.assertIn("retry_max_attempts", scheduler_payload)
        self.assertIn("retry_backoff_seconds", scheduler_payload)

    def test_08_pagination_support_on_alerts_and_audit_logs(self) -> None:
        reset_policy = self.client.put(
            "/api/v1/alerts/ops-policy",
            json={
                "mute_window_enabled": False,
                "mute_start_hour_utc": 0,
                "mute_end_hour_utc": 0,
                "mute_weekends": False,
                "timezone": "UTC",
                "escalation_enabled": False,
                "escalation_after_minutes": 60,
                "escalation_channels": ["email"],
                "escalation_severity": "critical",
                "ack_sla_minutes": 60,
                "dedupe_window_minutes": 0,
                "min_severity": "low",
                "daily_summary_enabled": True,
                "weekly_summary_enabled": True,
            },
            headers=self.headers,
        )
        self.assertEqual(reset_policy.status_code, 200, reset_policy.text)
        self._create_alert()
        self._create_alert()
        self._create_alert()

        first_page = self.client.get("/api/v1/alerts?limit=1&offset=0", headers=self.headers)
        second_page = self.client.get("/api/v1/alerts?limit=1&offset=1", headers=self.headers)
        self.assertEqual(first_page.status_code, 200, first_page.text)
        self.assertEqual(second_page.status_code, 200, second_page.text)
        self.assertEqual(len(first_page.json()), 1)
        self.assertEqual(len(second_page.json()), 1)
        self.assertNotEqual(first_page.json()[0]["id"], second_page.json()[0]["id"])

        logs_page = self.client.get("/api/v1/audit-logs?limit=1&offset=1", headers=self.headers)
        self.assertEqual(logs_page.status_code, 200, logs_page.text)
        self.assertLessEqual(len(logs_page.json()), 1)


if __name__ == "__main__":
    unittest.main()
