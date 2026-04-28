"""Tests for deeper FinOps forecasting and GenAI advisory endpoints."""

import os
import tempfile
import unittest

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_deep_finops_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-deep-finops"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient

    from finops_mcp.app import app
    from finops_mcp.orm_models import Base, engine
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

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()

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

    def test_04_forecast_sensitivity_endpoint_contract(self) -> None:
        resp = self.client.get("/api/v1/forecast/sensitivity", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("sensitivity_tests", data)
        self.assertIn("elasticity", data)
        self.assertIn("risk_window", data)
        self.assertIn("genai_prompt", data)
        self.assertIn("cost_context", data)

    def test_05_optimization_portfolio_endpoint_contract(self) -> None:
        resp = self.client.get("/api/v1/analytics/optimization-portfolio", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("portfolio", data)
        self.assertIn("portfolio_summary", data)
        self.assertIn("sequencing", data)
        self.assertIn("genai_prompt", data)
        self.assertIn("cost_context", data)

    def test_06_genai_analyze_supports_new_analysis_types(self) -> None:
        payloads = [
            {
                "analysis_type": "forecast_sensitivity",
                "context": {
                    "months": 12,
                    "current_monthly_spend_usd": 15000,
                    "cost_breakdown": {
                        "aws": {"cost": 9000, "percentage": 60.0},
                        "azure": {"cost": 6000, "percentage": 40.0},
                    },
                    "budget_monthly_usd": 16000,
                },
            },
            {
                "analysis_type": "optimization_portfolio",
                "context": {
                    "current_monthly_spend_usd": 15000,
                    "cost_breakdown": {
                        "aws": {"cost": 9000, "percentage": 60.0},
                        "azure": {"cost": 6000, "percentage": 40.0},
                    },
                    "discount_rate_monthly": 0.01,
                },
            },
            {
                "analysis_type": "stakeholder_brief",
                "audience": "engineering",
                "context": {
                    "current_monthly_spend_usd": 15000,
                    "risk_score": 42,
                    "estimated_monthly_waste_usd": 2200,
                    "total_annual_opportunity_usd": 25000,
                },
            },
        ]

        for payload in payloads:
            resp = self.client.post("/api/v1/genai/analyze", json=payload, headers=self.headers)
            self.assertEqual(resp.status_code, 200, resp.text)
            data = resp.json()
            self.assertEqual(data.get("analysis_type"), payload["analysis_type"])
            self.assertIn("prompt", data)
            self.assertIsNotNone(data.get("prompt"))

    def test_07_genai_copilot_pack_supports_new_include_items(self) -> None:
        payload = {
            "cloud_provider": "all",
            "include": [
                "forecast_sensitivity",
                "optimization_portfolio",
                "stakeholder_finance",
                "stakeholder_engineering",
                "stakeholder_operations",
            ],
        }
        resp = self.client.post("/api/v1/genai/copilot-pack", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("forecast_sensitivity", data.get("narratives", {}))
        self.assertIn("optimization_portfolio", data.get("narratives", {}))
        self.assertIn("stakeholder_finance", data.get("narratives", {}))
        self.assertIn("stakeholder_engineering", data.get("narratives", {}))
        self.assertIn("stakeholder_operations", data.get("narratives", {}))
        self.assertIn("forecast_sensitivity", data.get("deterministic_context", {}))
        self.assertIn("optimization_portfolio", data.get("deterministic_context", {}))


if __name__ == "__main__":
    unittest.main()
