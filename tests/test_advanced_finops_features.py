"""Tests for advanced FinOps features.

Covers:
- Auto-remediation guardrails loop
- Tag quality scoring engine
- Decision-grade recommendations ranking
- Multi-account federation aggregation
- OpenCost/Kubernetes integration endpoints
"""

import os
import tempfile
import unittest

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_advanced_features_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-advanced-features"
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
    "aws,1200.00,EC2,aws-acct-001,AWS Prod,account,us-east-1,USD,\"{\"\"team\"\":\"\"platform\"\",\"\"environment\"\":\"\"production\"\"}\"\n"
    "azure,800.00,Compute,az-sub-001,Azure Dev,subscription,eastus,USD,\"{\"\"team\"\":\"\"engineering\"\"}\"\n"
    "gcp,600.00,GKE,gcp-proj-001,GCP Staging,project,us-central1,USD,\"{\"\"environment\"\":\"\"staging\"\",\"\"cost-center\"\":\"\"cc-42\"\"}\"\n"
)


def _register_and_login(client: TestClient, email: str = "advanced.features@example.com") -> str:
    client.post(
        "/auth/register",
        json={"email": email, "password": "StrongPass1!", "full_name": "Advanced Features Tester"},
    )
    resp = client.post("/auth/login", json={"email": email, "password": "StrongPass1!"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


class AdvancedFinOpsFeaturesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)
        cls.token = _register_and_login(cls.client)
        cls.headers = {"Authorization": f"Bearer {cls.token}"}
        cls.client.post(
            "/api/v1/imports/costs/csv",
            files={"file": ("advanced.csv", _IMPORT_CSV, "text/csv")},
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

    def test_01_tag_quality_endpoint(self) -> None:
        resp = self.client.get("/api/v1/analytics/tag-quality", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("completeness_score", data)
        self.assertIn("quality_grade", data)
        self.assertIn("dimensions", data)
        self.assertGreaterEqual(data["completeness_score"], 0.0)

    def test_02_decision_grade_recommendations_endpoint(self) -> None:
        resp = self.client.get("/api/v1/recommendations/decision-grade?top_n=5", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertEqual(data["model"], "ensemble_v1_deterministic")
        self.assertIn("top_recommendations", data)
        for item in data["top_recommendations"]:
            self.assertIn("decision_score", item)
            self.assertGreaterEqual(item["decision_score"], 0.0)

    def test_03_federation_endpoint(self) -> None:
        resp = self.client.get("/api/v1/federation/costs", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("accounts", data)
        self.assertIn("provider_totals_usd", data)
        self.assertGreaterEqual(data["total_accounts"], 1)

    def test_04_auto_remediation_guardrails(self) -> None:
        payload = {
            "dry_run": True,
            "max_actions_per_run": 2,
            "max_total_impact_usd": 500,
            "require_approval_above_usd": 200,
            "candidates": [
                {
                    "action_id": "a1",
                    "provider": "aws",
                    "resource_id": "i-123",
                    "action_type": "downsize",
                    "estimated_monthly_impact_usd": 150,
                    "risk_level": "low",
                    "confidence": "high"
                },
                {
                    "action_id": "a2",
                    "provider": "aws",
                    "resource_id": "i-456",
                    "action_type": "terminate",
                    "estimated_monthly_impact_usd": 300,
                    "risk_level": "high",
                    "confidence": "medium"
                },
            ],
        }
        resp = self.client.post(
            "/api/v1/automation/remediation/loop",
            json=payload,
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("decisions", data)
        self.assertEqual(data["dry_run"], True)
        statuses = {d["status"] for d in data["decisions"]}
        self.assertTrue("planned" in statuses or "requires_approval" in statuses)

    def test_05_kubernetes_cluster_cost_fallback_still_works(self) -> None:
        payload = {
            "cluster_name": "prod-k8s",
            "provider": "aws",
            "region": "us-east-1",
            "node_count": 3,
            "node_type": "m5.xlarge",
            "monthly_node_cost_usd": 200,
            "namespaces": ["default", "kube-system", "monitoring", "app"],
        }
        resp = self.client.post(
            "/api/v1/analytics/kubernetes/cluster-cost",
            json=payload,
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("namespace_breakdown", data)
        self.assertGreater(len(data["namespace_breakdown"]), 0)

    def test_06_opencost_sync_rejects_unreachable_source(self) -> None:
        payload = {
            "api_url": "http://127.0.0.1:65534",
            "cluster_name": "prod-k8s",
            "window_days": 3,
        }
        resp = self.client.post(
            "/api/v1/analytics/kubernetes/opencost/sync",
            json=payload,
            headers=self.headers,
        )
        self.assertIn(resp.status_code, (400, 500, 502))


if __name__ == "__main__":
    unittest.main()
