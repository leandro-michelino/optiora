"""Tests for deeper FinOps forecasting and GenAI advisory endpoints."""

import os
import tempfile
import unittest
from datetime import datetime

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_deep_finops_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-deep-finops"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient

    from finops_mcp.app import app
    from finops_mcp.orm_models import (
        Base,
        CostSnapshot,
        ScanRunRecord,
        SessionLocal,
        User,
        UserOrganization,
        engine,
    )
except ImportError as exc:  # pragma: no cover
    raise unittest.SkipTest(f"Backend dependencies not installed: {exc}") from exc


def _register_and_login(client: TestClient, email: str = "deep.finops@example.com") -> str:
    client.post(
        "/auth/register",
        json={"email": email, "password": "StrongPass1!", "full_name": "Deep FinOps Tester"},
    )
    resp = client.post("/auth/login", json={"email": email, "password": "StrongPass1!"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


class DeepFinOpsAnalyticsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)
        cls.token = _register_and_login(cls.client)
        cls.headers = {"Authorization": f"Bearer {cls.token}"}
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == "deep.finops@example.com").first()
            assert user is not None
            membership = db.query(UserOrganization).filter(UserOrganization.user_id == user.id).first()
            assert membership is not None
            customer_id = f"org-{membership.organization_id}"
            for idx, (month, aws_cost, oci_cost) in enumerate(
                [
                    ("2025-09", 980.0, 420.0),
                    ("2025-10", 1010.0, 430.0),
                    ("2025-11", 1080.0, 450.0),
                    ("2025-12", 1120.0, 470.0),
                    ("2026-01", 1190.0, 500.0),
                    ("2026-02", 1230.0, 520.0),
                    ("2026-03", 1300.0, 560.0),
                    ("2026-04", 1320.0, 590.0),
                ],
                start=1,
            ):
                db.add(
                    ScanRunRecord(
                        scan_id=f"deep-forecast-{idx}",
                        customer_id=customer_id,
                        state="completed",
                        providers_json='["aws","oci"]',
                        started_at=datetime.fromisoformat(f"{month}-15T00:00:00"),
                        completed_at=datetime.fromisoformat(f"{month}-15T00:05:00"),
                    )
                )
                db.add_all(
                    [
                        CostSnapshot(
                            scan_id=f"deep-forecast-{idx}",
                            customer_id=customer_id,
                            provider="aws",
                            period_end=datetime.fromisoformat(f"{month}-28T00:00:00"),
                            total_cost_usd=aws_cost,
                        ),
                        CostSnapshot(
                            scan_id=f"deep-forecast-{idx}",
                            customer_id=customer_id,
                            provider="oci",
                            period_end=datetime.fromisoformat(f"{month}-28T00:00:00"),
                            total_cost_usd=oci_cost,
                        ),
                    ]
                )
            db.commit()
        finally:
            db.close()

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        try:
            os.remove(TEST_DB)
        except FileNotFoundError:
            pass

    def test_01_forecast_includes_quality_and_risk_blocks(self) -> None:
        resp = self.client.get("/api/v1/forecast", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("forecast_quality", data)
        self.assertIn("downside_risk", data)
        self.assertIn("confidence_score", data["forecast_quality"])

    def test_02_forecast_what_if_returns_timeline(self) -> None:
        payload = {
            "months": 12,
            "cloud_provider": "all",
            "actions": [
                {
                    "name": "rightsizing_wave_1",
                    "start_month": 2,
                    "savings_percent": 8.0,
                    "growth_delta_percent": -0.5,
                    "one_time_cost_usd": 2500,
                },
                {
                    "name": "commitment_expansion",
                    "start_month": 4,
                    "savings_percent": 6.0,
                    "growth_delta_percent": -0.2,
                    "one_time_cost_usd": 3500,
                },
            ],
            "discount_rate_monthly": 0.01,
        }
        resp = self.client.post("/api/v1/forecast/what-if", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("timeline", data)
        self.assertEqual(len(data["timeline"]), 12)
        self.assertIn("net_savings_usd", data)
        self.assertIn("payback_month", data)

    def test_03_genai_copilot_pack_returns_multiple_narratives(self) -> None:
        payload = {
            "cloud_provider": "all",
            "include": ["spend", "budget_risk", "commitment_strategy", "executive_narrative"],
        }
        resp = self.client.post("/api/v1/genai/copilot-pack", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("narratives", data)
        self.assertIn("deterministic_context", data)
        self.assertIn("commitment_strategy", data["narratives"])
        self.assertIn("prompt", data["narratives"]["commitment_strategy"])

    def test_04_forecast_model_diagnostics_returns_champion_and_genai_prompt(self) -> None:
        resp = self.client.get("/api/v1/forecast/model-diagnostics", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertEqual(data["history_source"], "cost_snapshots")
        self.assertIn("champion_model", data)
        self.assertIn("challenger_models", data)
        self.assertGreaterEqual(len(data["challenger_models"]), 1)
        self.assertIn("data_quality_score", data)
        self.assertIn("genai_prompt", data)

    def test_05_copilot_pack_can_include_non_forecast_genai_briefs(self) -> None:
        payload = {
            "cloud_provider": "all",
            "include": [
                "tagging_strategy",
                "sustainability_narrative",
                "vendor_negotiation_brief",
                "forecast_model_diagnostics",
                "finops_operating_review",
            ],
        }
        resp = self.client.post("/api/v1/genai/copilot-pack", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        for key in payload["include"]:
            self.assertIn(key, data["narratives"])
            self.assertIn("prompt", data["narratives"][key])

    def test_06_forecast_diagnostics_contract(self) -> None:
        resp = self.client.get(
            "/api/v1/analytics/forecast-diagnostics?months=12&cloud_provider=all",
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("forecast_quality", data)
        self.assertIn("forecast_diagnostics", data)
        self.assertIn("sensitivity", data["forecast_diagnostics"])
        self.assertIn("exposure", data)
        self.assertIn("recommended_actions", data)

    def test_07_genai_operating_review_contract(self) -> None:
        payload = {
            "analysis_type": "finops_operating_review",
            "context": {
                "current_monthly_spend_usd": 10000,
                "budget_monthly_usd": 9000,
                "risk_score": 64,
                "maturity_level": "walk",
                "grade": "B",
            },
        }
        resp = self.client.post("/api/v1/genai/analyze", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertEqual(data.get("analysis_type"), "finops_operating_review")
        self.assertIn("prompt", data)

    def test_08_operating_review_pack_endpoint(self) -> None:
        resp = self.client.get(
            "/api/v1/analytics/operating-review?months=12&cloud_provider=all",
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("summary", data)
        self.assertIn("top_actions", data)
        self.assertIn("execution_plan", data)
        self.assertIn("risk_register", data)
        self.assertIn("genai_prompt", data)
        self.assertIn("cost_context", data)


if __name__ == "__main__":
    unittest.main()
