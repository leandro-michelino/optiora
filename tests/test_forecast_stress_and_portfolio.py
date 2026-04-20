"""Regression coverage for deeper forecasting and optimization portfolio analytics."""

import os
import tempfile
import unittest

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_forecast_stress_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-forecast-stress"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient

    from finops_mcp.app import app
    from finops_mcp.orm_models import Base, engine
except ImportError as exc:  # pragma: no cover
    raise unittest.SkipTest(f"Backend dependencies not installed: {exc}") from exc


_IMPORT_CSV = (
    "provider,cost_usd,service_name,account_identifier,account_name,"
    "account_type,region,currency,tags_json\n"
    "aws,3200.00,EC2,aws-acct-001,AWS Prod,account,us-east-1,USD,\"{\"\"team\"\":\"\"platform\"\",\"\"environment\"\":\"\"production\"\"}\"\n"
    "azure,1800.00,Compute,az-sub-001,Azure Core,subscription,eastus,USD,\"{\"\"team\"\":\"\"engineering\"\"}\"\n"
    "gcp,1200.00,GKE,gcp-proj-001,GCP Staging,project,us-central1,USD,\"{\"\"environment\"\":\"\"staging\"\",\"\"cost-center\"\":\"\"cc-42\"\"}\"\n"
)


def _register_and_login(client: TestClient, email: str = "stress.portfolio@example.com") -> str:
    client.post(
        "/auth/register",
        json={"email": email, "password": "StrongPass1!", "full_name": "Forecast Stress Tester"},
    )
    resp = client.post("/auth/login", json={"email": email, "password": "StrongPass1!"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


class ForecastStressAndPortfolioTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)
        cls.token = _register_and_login(cls.client)
        cls.headers = {"Authorization": f"Bearer {cls.token}"}
        cls.client.post(
            "/api/v1/imports/costs/csv",
            files={"file": ("stress.csv", _IMPORT_CSV, "text/csv")},
            headers=cls.headers,
        )

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        try:
            os.remove(TEST_DB)
        except FileNotFoundError:
            pass

    def test_01_forecast_stress_test_endpoint(self) -> None:
        resp = self.client.post(
            "/api/v1/forecast/stress-test",
            json={"months": 12, "cloud_provider": "all", "severity": "medium"},
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("scenarios", data)
        self.assertGreaterEqual(len(data["scenarios"]), 1)
        self.assertIn("worst_case", data)
        self.assertIn("hedging_playbook", data)

    def test_02_optimization_portfolio_endpoint(self) -> None:
        resp = self.client.get("/api/v1/analytics/optimization-portfolio", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("ranked_actions", data)
        self.assertIn("quick_wins", data)
        self.assertIn("total_annual_savings_usd", data)

    def test_03_api_info_flags_include_new_features(self) -> None:
        resp = self.client.get("/api/v1/info")
        self.assertEqual(resp.status_code, 200, resp.text)
        features = resp.json().get("features", {})
        self.assertTrue(features.get("forecast_stress_test"))
        self.assertTrue(features.get("optimization_portfolio"))


if __name__ == "__main__":
    unittest.main()
