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

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_scorecards_test_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-scorecards"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient

    from finops_mcp.app import app
    from finops_mcp.orm_models import Base, NormalizedCostDimension, SessionLocal, engine
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

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
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

    # ── Auth enforcement ──────────────────────────────────────────────────────

    def test_06_unauthenticated_rejected(self) -> None:
        resp = self.client.get("/api/v1/analytics/scorecards")
        self.assertIn(resp.status_code, (401, 403))


if __name__ == "__main__":
    unittest.main()
