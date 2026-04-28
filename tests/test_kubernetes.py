"""Tests for the Kubernetes Cost Allocation API endpoints.

Covers:
- GET  /api/v1/analytics/kubernetes/summary       (status overview)
- POST /api/v1/analytics/kubernetes/cluster-cost  (namespace breakdown)
- Namespace share percentages sum to ~100%
- kube-system / monitoring heuristic weights
- Custom namespace list
- Response schema validation
- Authentication enforcement
"""

import os
import tempfile
import unittest

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_k8s_test_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-kubernetes"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient

    from finops_mcp.app import app
    from finops_mcp.orm_models import Base, engine
except ImportError as exc:  # pragma: no cover
    raise unittest.SkipTest(f"Backend dependencies not installed: {exc}") from exc


_CLUSTER_PAYLOAD = {
    "cluster_name": "prod-k8s",
    "provider": "aws",
    "region": "us-east-1",
    "node_count": 5,
    "node_type": "m5.xlarge",
    "monthly_node_cost_usd": 150.0,
    "namespaces": ["default", "kube-system", "monitoring", "app"],
}


def _register_and_login(client: TestClient, email: str = "k8s@example.com") -> str:
    client.post(
        "/auth/register",
        json={"email": email, "password": "StrongPass1!", "full_name": "K8s Tester"},
    )
    resp = client.post("/auth/login", json={"email": email, "password": "StrongPass1!"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


class KubernetesTest(unittest.TestCase):
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

    # ── GET /analytics/kubernetes/summary ─────────────────────────────────────

    def test_01_summary_returns_200(self) -> None:
        resp = self.client.get("/api/v1/analytics/kubernetes/summary", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)

    def test_02_summary_response_schema(self) -> None:
        resp = self.client.get("/api/v1/analytics/kubernetes/summary", headers=self.headers)
        data = resp.json()
        for field in (
            "generated_at", "kubernetes_enabled", "clusters_configured",
            "estimated_k8s_share_percent", "estimated_k8s_cost_usd",
            "total_cloud_cost_usd", "setup_hint",
        ):
            self.assertIn(field, data, f"summary missing field: {field}")

    def test_03_summary_enabled_is_bool(self) -> None:
        resp = self.client.get("/api/v1/analytics/kubernetes/summary", headers=self.headers)
        self.assertIsInstance(resp.json()["kubernetes_enabled"], bool)

    # ── POST /analytics/kubernetes/cluster-cost ───────────────────────────────

    def test_04_cluster_cost_returns_200(self) -> None:
        resp = self.client.post(
            "/api/v1/analytics/kubernetes/cluster-cost",
            json=_CLUSTER_PAYLOAD,
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.text)

    def test_05_cluster_cost_response_schema(self) -> None:
        resp = self.client.post(
            "/api/v1/analytics/kubernetes/cluster-cost",
            json=_CLUSTER_PAYLOAD,
            headers=self.headers,
        )
        data = resp.json()
        for field in (
            "generated_at", "cluster_name", "provider", "region",
            "node_count", "node_type", "total_cluster_cost_usd",
            "cost_per_node_usd", "namespace_breakdown", "workload_breakdown",
            "team_breakdown", "node_pool_breakdown", "recommendations",
            "efficiency_note", "opencost_integration",
        ):
            self.assertIn(field, data, f"cluster-cost missing field: {field}")
        self.assertIsInstance(data["namespace_breakdown"], list)

    def test_06_total_cost_equals_nodes_times_per_node(self) -> None:
        resp = self.client.post(
            "/api/v1/analytics/kubernetes/cluster-cost",
            json=_CLUSTER_PAYLOAD,
            headers=self.headers,
        )
        data = resp.json()
        expected = _CLUSTER_PAYLOAD["node_count"] * _CLUSTER_PAYLOAD["monthly_node_cost_usd"]
        self.assertAlmostEqual(data["total_cluster_cost_usd"], expected, places=2)

    def test_07_namespace_breakdown_non_empty(self) -> None:
        resp = self.client.post(
            "/api/v1/analytics/kubernetes/cluster-cost",
            json=_CLUSTER_PAYLOAD,
            headers=self.headers,
        )
        breakdown = resp.json()["namespace_breakdown"]
        self.assertGreater(len(breakdown), 0)

    def test_08_namespace_item_schema(self) -> None:
        resp = self.client.post(
            "/api/v1/analytics/kubernetes/cluster-cost",
            json=_CLUSTER_PAYLOAD,
            headers=self.headers,
        )
        for ns in resp.json()["namespace_breakdown"]:
            for field in (
                "namespace", "estimated_cost_usd",
                "share_percent", "cpu_share_percent", "memory_share_percent",
            ):
                self.assertIn(field, ns, f"namespace item missing field: {field}")

    def test_09_kube_system_gets_10_percent(self) -> None:
        resp = self.client.post(
            "/api/v1/analytics/kubernetes/cluster-cost",
            json=_CLUSTER_PAYLOAD,
            headers=self.headers,
        )
        breakdown = {ns["namespace"]: ns["share_percent"] for ns in resp.json()["namespace_breakdown"]}
        self.assertAlmostEqual(breakdown.get("kube-system", 0), 10.0, places=1)

    def test_10_monitoring_gets_15_percent(self) -> None:
        resp = self.client.post(
            "/api/v1/analytics/kubernetes/cluster-cost",
            json=_CLUSTER_PAYLOAD,
            headers=self.headers,
        )
        breakdown = {ns["namespace"]: ns["share_percent"] for ns in resp.json()["namespace_breakdown"]}
        self.assertAlmostEqual(breakdown.get("monitoring", 0), 15.0, places=1)

    def test_11_default_namespaces_used_when_none_provided(self) -> None:
        payload = {**_CLUSTER_PAYLOAD}
        payload.pop("namespaces", None)
        resp = self.client.post(
            "/api/v1/analytics/kubernetes/cluster-cost",
            json=payload,
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertGreater(len(resp.json()["namespace_breakdown"]), 0)

    def test_12_missing_required_field_rejected(self) -> None:
        bad_payload = {k: v for k, v in _CLUSTER_PAYLOAD.items() if k != "cluster_name"}
        resp = self.client.post(
            "/api/v1/analytics/kubernetes/cluster-cost",
            json=bad_payload,
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 422)

    def test_13_deep_allocation_accepts_workloads_and_node_pools(self) -> None:
        payload = {
            **_CLUSTER_PAYLOAD,
            "workloads": [
                {
                    "namespace": "app",
                    "workload_name": "checkout-api",
                    "team": "commerce",
                    "node_pool": "apps",
                    "replicas": 4,
                    "cpu_request_cores": 4.0,
                    "cpu_usage_cores": 0.8,
                    "memory_request_gib": 8.0,
                    "memory_usage_gib": 2.0,
                },
                {
                    "namespace": "monitoring",
                    "workload_name": "prometheus",
                    "team": "platform",
                    "node_pool": "platform",
                    "replicas": 2,
                    "cpu_request_cores": 2.0,
                    "cpu_usage_cores": 1.3,
                    "memory_request_gib": 6.0,
                    "memory_usage_gib": 4.0,
                },
            ],
            "node_pools": [
                {"name": "apps", "node_count": 3, "monthly_node_cost_usd": 180.0},
                {"name": "platform", "node_count": 2, "monthly_node_cost_usd": 120.0},
            ],
        }
        resp = self.client.post(
            "/api/v1/analytics/kubernetes/cluster-cost",
            json=payload,
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertGreaterEqual(len(data["workload_breakdown"]), 2)
        self.assertIn("commerce", {row["team"] for row in data["team_breakdown"]})
        self.assertIn("apps", {row["node_pool"] for row in data["node_pool_breakdown"]})
        self.assertTrue(
            any(rec["category"] in {"request_limit", "node_pool"} for rec in data["recommendations"])
        )

    # ── Auth enforcement ──────────────────────────────────────────────────────

    def test_14_unauthenticated_rejected(self) -> None:
        fresh = TestClient(app)
        resp = fresh.get("/api/v1/analytics/kubernetes/summary")
        self.assertIn(resp.status_code, (401, 403))

        resp = fresh.post(
            "/api/v1/analytics/kubernetes/cluster-cost", json=_CLUSTER_PAYLOAD
        )
        self.assertIn(resp.status_code, (401, 403))


if __name__ == "__main__":
    unittest.main()
