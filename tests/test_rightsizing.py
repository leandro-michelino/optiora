"""Tests for the Resource-Level Rightsizing API endpoint.

Covers:
- GET /api/v1/recommendations/rightsizing   (no data — synthetic fallback)
- GET /api/v1/recommendations/rightsizing   (with imported CSV data)
- provider filter parameter
- min_savings filter parameter
- limit parameter
- Response schema validation
- Per-recommendation field validation
- Authentication enforcement
"""

import os
import tempfile
import unittest

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_rightsizing_test_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-rightsizing"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient

    from finops_mcp.app import app
    from finops_mcp.orm_models import Base, engine
except ImportError as exc:  # pragma: no cover
    raise unittest.SkipTest(f"Backend dependencies not installed: {exc}") from exc


_IMPORT_CSV = (
    "provider,cost_usd,service_name,account_identifier,account_name,"
    "account_type,region,currency\n"
    "aws,1200.00,EC2,aws-acct-001,AWS Prod,account,us-east-1,USD\n"
    "azure,800.00,Compute,az-sub-001,Azure Dev,subscription,eastus,USD\n"
    "gcp,600.00,GCE,gcp-proj-001,GCP Staging,project,us-central1,USD\n"
    "oci,400.00,Compute,oci-tenancy-001,OCI Prod,tenancy,uk-london-1,USD\n"
)


def _register_and_login(client: TestClient, email: str = "rightsizing@example.com") -> str:
    client.post(
        "/auth/register",
        json={"email": email, "password": "StrongPass1!", "full_name": "Rightsizing Tester"},
    )
    resp = client.post("/auth/login", json={"email": email, "password": "StrongPass1!"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


class RightsizingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)
        cls.token = _register_and_login(cls.client)
        cls.headers = {"Authorization": f"Bearer {cls.token}"}
        # Seed imported data so synthetic recommendations are generated
        cls.client.post(
            "/api/v1/imports/costs/csv",
            files={"file": ("test.csv", _IMPORT_CSV, "text/csv")},
            headers=cls.headers,
        )

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        try:
            os.remove(TEST_DB)
        except FileNotFoundError:
            pass

    # ── Basic response shape ──────────────────────────────────────────────────

    def test_01_rightsizing_returns_200(self) -> None:
        resp = self.client.get("/api/v1/recommendations/rightsizing", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)

    def test_02_response_top_level_schema(self) -> None:
        resp = self.client.get("/api/v1/recommendations/rightsizing", headers=self.headers)
        data = resp.json()
        for field in (
            "generated_at",
            "organization_id",
            "data_source",
            "total_resources_analyzed",
            "rightsizable_count",
            "total_monthly_savings_usd",
            "total_annual_savings_usd",
            "recommendations",
        ):
            self.assertIn(field, data, f"missing top-level field: {field}")
        self.assertIsInstance(data["recommendations"], list)

    def test_03_savings_are_non_negative(self) -> None:
        resp = self.client.get("/api/v1/recommendations/rightsizing", headers=self.headers)
        data = resp.json()
        self.assertGreaterEqual(data["total_monthly_savings_usd"], 0.0)
        self.assertGreaterEqual(data["total_annual_savings_usd"], 0.0)

    def test_04_annual_savings_twelve_times_monthly(self) -> None:
        resp = self.client.get("/api/v1/recommendations/rightsizing", headers=self.headers)
        data = resp.json()
        monthly = data["total_monthly_savings_usd"]
        annual = data["total_annual_savings_usd"]
        # Allow floating-point rounding tolerance
        self.assertAlmostEqual(annual, monthly * 12, delta=1.0)

    # ── Per-recommendation field validation ───────────────────────────────────

    def test_05_recommendation_item_schema(self) -> None:
        resp = self.client.get("/api/v1/recommendations/rightsizing", headers=self.headers)
        recs = resp.json()["recommendations"]
        if not recs:
            self.skipTest("No recommendations returned — verify seeded data")
        for rec in recs:
            for field in (
                "resource_id", "resource_name", "resource_type",
                "provider", "region", "account_id",
                "current_size", "recommended_size",
                "current_monthly_cost_usd", "projected_monthly_cost_usd",
                "monthly_savings_usd", "annual_savings_usd",
                "reason", "confidence", "effort", "action",
            ):
                self.assertIn(field, rec, f"recommendation missing field: {field}")

    def test_06_action_values_are_valid(self) -> None:
        valid_actions = {"downsize", "terminate", "reserve", "modernize"}
        resp = self.client.get("/api/v1/recommendations/rightsizing", headers=self.headers)
        for rec in resp.json()["recommendations"]:
            self.assertIn(rec["action"], valid_actions, f"invalid action: {rec['action']}")

    def test_07_confidence_values_are_valid(self) -> None:
        valid = {"high", "medium", "low"}
        resp = self.client.get("/api/v1/recommendations/rightsizing", headers=self.headers)
        for rec in resp.json()["recommendations"]:
            self.assertIn(rec["confidence"], valid, f"invalid confidence: {rec['confidence']}")

    def test_08_per_rec_savings_positive(self) -> None:
        resp = self.client.get("/api/v1/recommendations/rightsizing", headers=self.headers)
        for rec in resp.json()["recommendations"]:
            self.assertGreaterEqual(rec["monthly_savings_usd"], 0.0)
            self.assertGreaterEqual(rec["annual_savings_usd"], 0.0)

    # ── Filter parameters ─────────────────────────────────────────────────────

    def test_09_provider_filter(self) -> None:
        for prov in ("aws", "azure", "gcp", "oci", "all"):
            resp = self.client.get(
                f"/api/v1/recommendations/rightsizing?provider={prov}",
                headers=self.headers,
            )
            self.assertEqual(resp.status_code, 200, f"provider={prov}: {resp.text}")

    def test_10_min_savings_filter_excludes_small_items(self) -> None:
        high_threshold = 9999.0
        resp = self.client.get(
            f"/api/v1/recommendations/rightsizing?min_savings={high_threshold}",
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        for rec in resp.json()["recommendations"]:
            self.assertGreaterEqual(rec["monthly_savings_usd"], high_threshold)

    def test_11_limit_parameter(self) -> None:
        resp = self.client.get(
            "/api/v1/recommendations/rightsizing?limit=2", headers=self.headers
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertLessEqual(len(resp.json()["recommendations"]), 2)

    def test_12_limit_zero_rejected(self) -> None:
        resp = self.client.get(
            "/api/v1/recommendations/rightsizing?limit=0", headers=self.headers
        )
        self.assertEqual(resp.status_code, 422)

    # ── Auth enforcement ──────────────────────────────────────────────────────

    def test_13_unauthenticated_rejected(self) -> None:
        fresh = TestClient(app)
        resp = fresh.get("/api/v1/recommendations/rightsizing")
        self.assertIn(resp.status_code, (401, 403))


if __name__ == "__main__":
    unittest.main()
