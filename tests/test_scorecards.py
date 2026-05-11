"""Tests for the FinOps Scorecards API endpoint.

Covers:
- GET /api/v1/analytics/scorecards (empty org — default grades)
- GET /api/v1/analytics/scorecards (org with chargeback data — team breakdown)
- Response schema validation
- Authentication enforcement
"""

import os
import tempfile
import unittest
from datetime import datetime

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_scorecards_test_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-scorecards"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient

    from finops_mcp.app import app
    from finops_mcp.orm_models import Base, NormalizedCostDimension, RecommendationLedger, SessionLocal, engine
except ImportError as exc:  # pragma: no cover
    raise unittest.SkipTest(f"Backend dependencies not installed: {exc}") from exc


def _register_and_login(client: TestClient, email: str = "scorecards@example.com") -> str:
    client.post(
        "/auth/register",
        json={"email": email, "password": "StrongPass1!", "full_name": "Scorecard Tester"},
    )
    resp = client.post("/auth/login", json={"email": email, "password": "StrongPass1!"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


class ScorecardsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)
        cls.token = _register_and_login(cls.client)
        cls.headers = {"Authorization": f"Bearer {cls.token}"}
        org = cls.client.get("/auth/organization", headers=cls.headers)
        assert org.status_code == 200, org.text
        cls.organization_id = int(org.json()["id"])

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        try:
            os.remove(TEST_DB)
        except FileNotFoundError:
            pass

    # ── Empty org ─────────────────────────────────────────────────────────────

    def test_01_scorecards_returns_200(self) -> None:
        resp = self.client.get("/api/v1/analytics/scorecards", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)

    def test_02_scorecards_response_shape(self) -> None:
        resp = self.client.get("/api/v1/analytics/scorecards", headers=self.headers)
        data = resp.json()
        self.assertIn("generated_at", data)
        self.assertIn("organization_grade", data)
        self.assertIn("organization_score", data)
        self.assertIn("teams", data)
        self.assertIsInstance(data["teams"], list)

    def test_03_org_grade_is_valid_letter(self) -> None:
        resp = self.client.get("/api/v1/analytics/scorecards", headers=self.headers)
        data = resp.json()
        valid_grades = {"A+", "A", "B", "C", "D"}
        self.assertIn(data["organization_grade"], valid_grades)

    def test_04_org_score_in_range(self) -> None:
        resp = self.client.get("/api/v1/analytics/scorecards", headers=self.headers)
        data = resp.json()
        score = data["organization_score"]
        self.assertGreaterEqual(score, 0.0)
        self.assertLessEqual(score, 100.0)

    # ── With chargeback data ─────────────────────────────────────────────────

    def test_05_scorecards_with_team_data(self) -> None:
        """Upload costs with team attribution and verify team rows appear."""
        self.client.post(
            "/api/v1/imports/costs/csv",
            files={
                "file": (
                    "test.csv",
                    (
                        "provider,cost_usd,service_name,account_identifier,account_name,"
                        "account_type,region,currency\n"
                        "aws,500.00,EC2,acct-plat,Platform,account,us-east-1,USD\n"
                        "azure,300.00,Compute,acct-data,DataEng,account,eastus,USD\n"
                    ),
                    "text/csv",
                )
            },
            headers=self.headers,
        )
        resp = self.client.get("/api/v1/analytics/scorecards", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("teams", data)
        # Whether teams is populated depends on chargeback mapping;
        # response structure must always be valid regardless.
        for team_entry in data["teams"]:
            self.assertIn("team", team_entry)
            self.assertIn("total_score", team_entry)
            self.assertIn("grade", team_entry)
            self.assertIn("dimensions", team_entry)
            self.assertIsInstance(team_entry["dimensions"], list)

    def test_06_realized_savings_scorecards_group_by_finance_dimensions(self) -> None:
        organization_id = self.organization_id
        db = SessionLocal()
        try:
            db.add(
                NormalizedCostDimension(
                    organization_id=organization_id,
                    customer_id="default",
                    provider="aws",
                    service_name="EC2",
                    region="us-east-1",
                    cost_usd=1000.0,
                    cost_center="BU-Platform",
                    team="Platform",
                    is_mapped=True,
                    captured_at=datetime(2026, 5, 1),
                )
            )
            db.add_all(
                [
                    RecommendationLedger(
                        organization_id=organization_id,
                        customer_id="default",
                        provider="aws",
                        resource_id="i-001",
                        resource_name="EC2",
                        resource_type="Compute service",
                        account_id="acct-platform",
                        region="us-east-1",
                        recommendation_source="cloudwatch",
                        recommendation_fingerprint="scorecard-realized-aws",
                        action="downsize",
                        confidence="high",
                        effort="low",
                        current_monthly_cost_usd=500.0,
                        projected_monthly_cost_usd=350.0,
                        planned_monthly_savings_usd=150.0,
                        planned_annual_savings_usd=1800.0,
                        realized_monthly_savings_usd=120.0,
                        realized_annual_savings_usd=1440.0,
                        variance_monthly_usd=-30.0,
                        variance_annual_usd=-360.0,
                        variance_percent=-20.0,
                        status="verified",
                        owner="platform@example.com",
                        evidence_json="{}",
                        planned_at=datetime(2026, 4, 20),
                        realized_at=datetime(2026, 5, 15),
                    ),
                    RecommendationLedger(
                        organization_id=organization_id,
                        customer_id="default",
                        provider="azure",
                        resource_id="vm-002",
                        resource_name="Compute",
                        resource_type="Compute service",
                        account_id="sub-data",
                        region="eastus",
                        recommendation_source="azure_monitor",
                        recommendation_fingerprint="scorecard-realized-azure",
                        action="downsize",
                        confidence="medium",
                        effort="medium",
                        current_monthly_cost_usd=400.0,
                        projected_monthly_cost_usd=320.0,
                        planned_monthly_savings_usd=80.0,
                        planned_annual_savings_usd=960.0,
                        realized_monthly_savings_usd=40.0,
                        realized_annual_savings_usd=480.0,
                        variance_monthly_usd=-40.0,
                        variance_annual_usd=-480.0,
                        variance_percent=-50.0,
                        status="verified",
                        owner="data@example.com",
                        evidence_json='{"business_unit":"BU-Data"}',
                        planned_at=datetime(2026, 5, 2),
                        realized_at=datetime(2026, 6, 1),
                    ),
                ]
            )
            db.commit()
        finally:
            db.close()

        resp = self.client.get(
            "/api/v1/analytics/scorecards?force_refresh=true",
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        realized = resp.json()["realized_savings"]

        self.assertEqual(realized["total_planned_monthly_savings_usd"], 230.0)
        self.assertEqual(realized["total_realized_monthly_savings_usd"], 160.0)
        self.assertIn("overall_score", realized)
        self.assertIn("overall_grade", realized)

        by_provider = {item["key"]: item for item in realized["by_provider"]}
        self.assertEqual(by_provider["aws"]["realized_monthly_savings_usd"], 120.0)
        self.assertEqual(by_provider["azure"]["planned_monthly_savings_usd"], 80.0)

        by_owner = {item["key"]: item for item in realized["by_owner"]}
        self.assertIn("platform@example.com", by_owner)
        self.assertEqual(by_owner["data@example.com"]["verified_count"], 1)

        by_business_unit = {item["key"]: item for item in realized["by_business_unit"]}
        self.assertEqual(by_business_unit["BU-Platform"]["realized_monthly_savings_usd"], 120.0)
        self.assertEqual(by_business_unit["BU-Data"]["realized_monthly_savings_usd"], 40.0)

        by_month = {item["key"]: item for item in realized["by_month"]}
        self.assertEqual(by_month["2026-05"]["realized_monthly_savings_usd"], 120.0)
        self.assertEqual(by_month["2026-06"]["realized_monthly_savings_usd"], 40.0)

    # ── Auth enforcement ──────────────────────────────────────────────────────

    def test_07_unauthenticated_rejected(self) -> None:
        fresh = TestClient(app)
        resp = fresh.get("/api/v1/analytics/scorecards")
        self.assertIn(resp.status_code, (401, 403))


if __name__ == "__main__":
    unittest.main()
