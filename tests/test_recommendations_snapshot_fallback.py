"""Regression tests for recommendation cost-context fallback behavior."""

import os
import tempfile
import unittest
from datetime import datetime
from unittest.mock import patch

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_recommendations_snapshot_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-recommendations-snapshot"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"
os.environ["REQUIRE_LIVE_PROVIDER_DATA"] = "false"

try:
    from fastapi.testclient import TestClient

    from finops_mcp.app import app
    from finops_mcp.orm_models import Base, CostSnapshot, ScanRunRecord, SessionLocal, engine
except ImportError as exc:  # pragma: no cover
    raise unittest.SkipTest(f"Backend dependencies not installed: {exc}") from exc


def _register_and_login(client: TestClient, email: str = "recommendations.snapshot@example.com") -> str:
    client.post(
        "/auth/register",
        json={"email": email, "password": "StrongPass1!", "full_name": "Recommendation Tester"},
    )
    resp = client.post("/auth/login", json={"email": email, "password": "StrongPass1!"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


class RecommendationSnapshotFallbackTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)
        cls.token = _register_and_login(cls.client)
        cls.headers = {"Authorization": f"Bearer {cls.token}"}
        orgs = cls.client.get("/auth/organizations", headers=cls.headers)
        assert orgs.status_code == 200, orgs.text
        cls.organization_id = int(orgs.json()[0]["id"])
        cls.customer_id = f"org-{cls.organization_id}"

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        try:
            os.remove(TEST_DB)
        except FileNotFoundError:
            pass

    def test_recommendations_use_persisted_scan_snapshots_when_live_context_has_no_data(self) -> None:
        db = SessionLocal()
        try:
            db.add(
                ScanRunRecord(
                    scan_id="snapshot-recs-001",
                    customer_id=self.customer_id,
                    state="completed",
                    providers_json='["aws"]',
                    started_at=datetime(2026, 5, 1, 0, 0, 0),
                    completed_at=datetime(2026, 5, 1, 0, 5, 0),
                )
            )
            db.add(
                CostSnapshot(
                    scan_id="snapshot-recs-001",
                    customer_id=self.customer_id,
                    provider="aws",
                    period_start=datetime(2026, 5, 1, 0, 0, 0),
                    period_end=datetime(2026, 5, 31, 23, 59, 59),
                    total_cost_usd=1200.0,
                    captured_at=datetime(2026, 5, 1, 0, 5, 0),
                )
            )
            db.commit()
        finally:
            db.close()

        with patch("finops_mcp.api._provider_diagnostics", return_value=[]):
            resp = self.client.get("/api/v1/recommendations", headers=self.headers)

        self.assertEqual(resp.status_code, 200, resp.text)
        rows = resp.json()
        self.assertGreater(len(rows), 0)
        self.assertEqual(rows[0]["cloud"], "aws")
        self.assertGreater(rows[0]["savings"], 0)


if __name__ == "__main__":
    unittest.main()
