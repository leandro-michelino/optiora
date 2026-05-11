"""Tests for the Virtual Tag Rules API (CRUD + preview)."""

import os
import tempfile
import unittest

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_vtag_test_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-vtag"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient

    from optiora_backend.app import app
    from optiora_backend.orm_models import Base, engine
except ImportError as exc:  # pragma: no cover
    raise unittest.SkipTest(f"Backend dependencies not installed: {exc}") from exc


def _register_and_login(client: TestClient, email: str = "vtag@example.com") -> str:
    """Register a user, return access token."""
    client.post(
        "/auth/register",
        json={"email": email, "password": "StrongPass1!", "full_name": "VTag Tester"},
    )
    resp = client.post("/auth/login", json={"email": email, "password": "StrongPass1!"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


class VirtualTagRulesTest(unittest.TestCase):
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

    # ── List (initially empty) ────────────────────────────────────────────────

    def test_01_list_empty(self) -> None:
        resp = self.client.get("/api/v1/virtual-tags/rules", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("rules", data)
        self.assertIsInstance(data["rules"], list)
        self.assertEqual(data["total"], 0)

    # ── Create ────────────────────────────────────────────────────────────────

    def test_02_create_rule(self) -> None:
        payload = {
            "tag_key": "team",
            "tag_value": "platform",
            "match_provider": "aws",
            "match_service": "AmazonEC2",
            "priority": 200,
            "is_active": True,
            "description": "Tag EC2 resources to platform team",
        }
        resp = self.client.post(
            "/api/v1/virtual-tags/rules", json=payload, headers=self.headers
        )
        self.assertEqual(resp.status_code, 201, resp.text)
        data = resp.json()
        self.assertEqual(data["tag_key"], "team")
        self.assertEqual(data["tag_value"], "platform")
        self.assertEqual(data["match_provider"], "aws")
        self.assertEqual(data["priority"], 200)
        self.assertIn("id", data)
        self.__class__._rule_id = data["id"]

    def test_03_create_rule_minimal(self) -> None:
        """A rule with only tag_key and tag_value should match all resources."""
        resp = self.client.post(
            "/api/v1/virtual-tags/rules",
            json={"tag_key": "env", "tag_value": "production"},
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 201, resp.text)
        data = resp.json()
        self.assertIsNone(data["match_provider"])

    # ── List (after creates) ──────────────────────────────────────────────────

    def test_04_list_shows_created_rules(self) -> None:
        resp = self.client.get("/api/v1/virtual-tags/rules", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total"], 2)
        # Rules should be ordered by priority desc
        priorities = [r["priority"] for r in data["rules"]]
        self.assertEqual(priorities, sorted(priorities, reverse=True))

    # ── Update ────────────────────────────────────────────────────────────────

    def test_05_update_rule(self) -> None:
        rule_id = self.__class__._rule_id
        resp = self.client.put(
            f"/api/v1/virtual-tags/rules/{rule_id}",
            json={"tag_key": "team", "tag_value": "infrastructure", "priority": 300},
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertEqual(data["tag_value"], "infrastructure")
        self.assertEqual(data["priority"], 300)

    def test_06_update_nonexistent_rule(self) -> None:
        resp = self.client.put(
            "/api/v1/virtual-tags/rules/999999",
            json={"tag_key": "x", "tag_value": "y"},
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 404)

    # ── Preview ───────────────────────────────────────────────────────────────

    def test_07_preview_returns_structure(self) -> None:
        resp = self.client.get(
            "/api/v1/virtual-tags/preview?limit=10", headers=self.headers
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("coverage_percent", data)
        self.assertIn("preview", data)
        self.assertIn("total_resources", data)
        self.assertIn("tagged_resources", data)
        self.assertGreaterEqual(data["coverage_percent"], 0)
        self.assertLessEqual(data["coverage_percent"], 100)

    def test_08_preview_respects_limit(self) -> None:
        resp = self.client.get(
            "/api/v1/virtual-tags/preview?limit=3", headers=self.headers
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertLessEqual(len(data["preview"]), 3)

    # ── Delete ────────────────────────────────────────────────────────────────

    def test_09_delete_rule(self) -> None:
        rule_id = self.__class__._rule_id
        resp = self.client.delete(
            f"/api/v1/virtual-tags/rules/{rule_id}", headers=self.headers
        )
        self.assertEqual(resp.status_code, 204)

    def test_10_delete_nonexistent_rule(self) -> None:
        resp = self.client.delete(
            "/api/v1/virtual-tags/rules/999999", headers=self.headers
        )
        self.assertEqual(resp.status_code, 404)

    def test_11_list_after_delete(self) -> None:
        resp = self.client.get("/api/v1/virtual-tags/rules", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # One rule deleted, one minimal rule remains
        self.assertEqual(data["total"], 1)

    # ── Auth guard ────────────────────────────────────────────────────────────

    def test_12_unauthenticated_returns_401(self) -> None:
        fresh = TestClient(app)
        resp = fresh.get("/api/v1/virtual-tags/rules")
        self.assertEqual(resp.status_code, 401)


if __name__ == "__main__":
    unittest.main()
