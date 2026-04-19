"""Tests for the Resource Inventory API endpoint.

Covers:
- GET /api/v1/inventory/resources  (empty org)
- GET /api/v1/inventory/resources  (org with imported CSV data)
- Provider and waste_only filter parameters
- Pagination (limit / offset)
- Response schema validation
- Authentication enforcement
"""

import os
import tempfile
import unittest

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_inventory_test_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-inventory"
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
    "aws,400.00,EC2,aws-acct-001,AWS Prod,account,us-east-1,USD\n"
    "azure,200.00,Compute,az-sub-001,Azure Dev,subscription,eastus,USD\n"
    "gcp,150.00,GCE,gcp-proj-001,GCP Staging,project,us-central1,USD\n"
)


def _register_and_login(client: TestClient, email: str = "inventory@example.com") -> str:
    client.post(
        "/auth/register",
        json={"email": email, "password": "StrongPass1!", "full_name": "Inventory Tester"},
    )
    resp = client.post("/auth/login", json={"email": email, "password": "StrongPass1!"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


class ResourceInventoryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)
        cls.token = _register_and_login(cls.client)
        cls.headers = {"Authorization": f"Bearer {cls.token}"}
        # Seed imported data
        cls.client.post(
            "/api/v1/imports/costs/csv",
            files={"file": ("test.csv", _IMPORT_CSV, "text/csv")},
            headers=cls.headers,
        )

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        try:
            os.remove(TEST_DB)
        except FileNotFoundError:
            pass

    # ── Basic response shape ──────────────────────────────────────────────────

    def test_01_inventory_returns_200(self) -> None:
        resp = self.client.get("/api/v1/inventory/resources", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)

    def test_02_inventory_response_schema(self) -> None:
        resp = self.client.get("/api/v1/inventory/resources", headers=self.headers)
        data = resp.json()
        for field in ("generated_at", "total_resources", "total_cost_usd", "flagged_waste_count", "items"):
            self.assertIn(field, data, f"missing field: {field}")
        self.assertIsInstance(data["items"], list)
        self.assertIsInstance(data["total_resources"], int)
        self.assertGreaterEqual(data["total_cost_usd"], 0.0)

    def test_03_inventory_has_imported_records(self) -> None:
        resp = self.client.get("/api/v1/inventory/resources", headers=self.headers)
        data = resp.json()
        self.assertGreater(data["total_resources"], 0, "expected imported records in inventory")

    def test_04_inventory_item_schema(self) -> None:
        resp = self.client.get("/api/v1/inventory/resources", headers=self.headers)
        items = resp.json()["items"]
        if not items:
            self.skipTest("No inventory items available")
        for item in items:
            for field in (
                "resource_id", "resource_name", "resource_type",
                "provider", "region", "account_id", "cost_usd",
                "waste_flag", "tags",
            ):
                self.assertIn(field, item, f"item missing field: {field}")

    # ── Provider filter ────────────────────────────────────────────────────────

    def test_05_provider_filter_aws(self) -> None:
        resp = self.client.get("/api/v1/inventory/resources?provider=aws", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        items = resp.json()["items"]
        for item in items:
            self.assertEqual(item["provider"], "aws")

    def test_06_provider_filter_unknown_returns_empty(self) -> None:
        resp = self.client.get(
            "/api/v1/inventory/resources?provider=unknowncloud", headers=self.headers
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertEqual(data["items"], [])

    # ── waste_only filter ─────────────────────────────────────────────────────

    def test_07_waste_only_filter(self) -> None:
        resp = self.client.get("/api/v1/inventory/resources?waste_only=true", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        for item in resp.json()["items"]:
            self.assertTrue(item["waste_flag"])

    # ── Pagination ────────────────────────────────────────────────────────────

    def test_08_pagination_limit(self) -> None:
        resp = self.client.get("/api/v1/inventory/resources?limit=1", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertLessEqual(len(resp.json()["items"]), 1)

    def test_09_pagination_offset(self) -> None:
        all_resp = self.client.get("/api/v1/inventory/resources?limit=100", headers=self.headers)
        all_items = all_resp.json()["items"]
        if len(all_items) < 2:
            self.skipTest("Need at least 2 items to test offset")
        offset_resp = self.client.get(
            "/api/v1/inventory/resources?limit=100&offset=1", headers=self.headers
        )
        offset_items = offset_resp.json()["items"]
        self.assertEqual(len(offset_items), len(all_items) - 1)

    # ── Auth enforcement ──────────────────────────────────────────────────────

    def test_10_unauthenticated_rejected(self) -> None:
        fresh = TestClient(app)
        resp = fresh.get("/api/v1/inventory/resources")
        self.assertIn(resp.status_code, (401, 403))


if __name__ == "__main__":
    unittest.main()
