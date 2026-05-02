"""Tests for resource intelligence and VM utilization hotspot analytics endpoints."""

import os
import tempfile
import unittest

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_resource_intel_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-resource-intel"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient

    import finops_mcp.api as api_module
    from finops_mcp.app import app
    from finops_mcp.orm_models import Base, engine
except ImportError as exc:  # pragma: no cover
    raise unittest.SkipTest(f"Backend dependencies not installed: {exc}") from exc


def _register_and_login(client: TestClient, email: str) -> str:
    client.post(
        "/auth/register",
        json={"email": email, "password": "StrongPass1!", "full_name": "Resource Intelligence Tester"},
    )
    resp = client.post("/auth/login", json={"email": email, "password": "StrongPass1!"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


class ResourceIntelligenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)
        token = _register_and_login(cls.client, "resource-intelligence@example.com")
        cls.headers = {"Authorization": f"Bearer {token}"}

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        try:
            os.remove(TEST_DB)
        except FileNotFoundError:
            pass

    def test_resource_intelligence_returns_owner_and_observed_cost(self) -> None:
        csv_rows = (
            "provider,cost_usd,service_name,account_identifier,account_name,account_type,region,currency,tags\n"
            "aws,140.00,EC2,acct-prod-1,Prod Account,account,us-east-1,USD,\"{\"\"created_by\"\":\"\"platform.team@example.com\"\"}\"\n"
            "aws,60.00,EC2,acct-prod-1,Prod Account,account,us-east-1,USD,\"{\"\"created_by\"\":\"\"platform.team@example.com\"\"}\"\n"
        )
        upload = self.client.post(
            "/api/v1/imports/costs/csv",
            files={"file": ("resource-intel.csv", csv_rows, "text/csv")},
            headers=self.headers,
        )
        self.assertIn(upload.status_code, (200, 201), upload.text)

        resp = self.client.get(
            "/api/v1/analytics/resource-intelligence?cloud_provider=all&query=who%20created%20acct-prod-1",
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        payload = resp.json()
        self.assertIn("matched_resource", payload)
        matched = payload.get("matched_resource") or {}
        self.assertEqual(matched.get("resource_id"), "acct-prod-1")
        self.assertEqual(matched.get("provider"), "aws")
        self.assertGreater(float(matched.get("observed_total_cost_usd") or 0.0), 0.0)
        self.assertIn("owner_or_creator", matched)
        self.assertEqual(matched.get("owner_or_creator"), "platform.team@example.com")

    def test_vm_utilization_hotspots_returns_ranked_lists(self) -> None:
        original_get_rightsizing = api_module.get_rightsizing_recommendations
        try:
            async def _fake_get_rightsizing(*args, **kwargs):  # type: ignore[no-untyped-def]
                _ = (args, kwargs)
                rec_a = api_module.RightsizingRecommendation(
                    resource_id="i-top-cpu",
                    resource_name="prod-analytics-a",
                    resource_type="EC2 Instance",
                    provider="aws",
                    region="us-east-1",
                    account_id="acct-1",
                    current_size="m5.2xlarge",
                    recommended_size="m5.xlarge",
                    current_monthly_cost_usd=400.0,
                    projected_monthly_cost_usd=240.0,
                    monthly_savings_usd=160.0,
                    annual_savings_usd=1920.0,
                    cpu_utilization_avg_percent=92.0,
                    memory_utilization_avg_percent=68.0,
                    reason="High sustained CPU",
                    confidence="high",
                    effort="medium",
                    action="downsize",
                    latest_monthly_cost_usd=410.0,
                    resource_console_url="https://console.aws.amazon.com/ec2/v2/home",
                )
                rec_b = api_module.RightsizingRecommendation(
                    resource_id="i-top-memory",
                    resource_name="prod-analytics-b",
                    resource_type="EC2 Instance",
                    provider="aws",
                    region="us-east-1",
                    account_id="acct-1",
                    current_size="m5.2xlarge",
                    recommended_size="m5.xlarge",
                    current_monthly_cost_usd=350.0,
                    projected_monthly_cost_usd=250.0,
                    monthly_savings_usd=100.0,
                    annual_savings_usd=1200.0,
                    cpu_utilization_avg_percent=54.0,
                    memory_utilization_avg_percent=95.0,
                    reason="High sustained memory",
                    confidence="high",
                    effort="medium",
                    action="downsize",
                    latest_monthly_cost_usd=355.0,
                    resource_console_url="https://console.aws.amazon.com/ec2/v2/home",
                )
                return api_module.RightsizingResponse(
                    generated_at="2026-05-02T00:00:00Z",
                    organization_id=1,
                    data_source="test",
                    total_resources_analyzed=2,
                    rightsizable_count=2,
                    total_monthly_savings_usd=260.0,
                    total_annual_savings_usd=3120.0,
                    recommendations=[rec_a, rec_b],
                )

            api_module.get_rightsizing_recommendations = _fake_get_rightsizing
            resp = self.client.get(
                "/api/v1/analytics/vm-utilization-hotspots?provider=all&limit=2",
                headers=self.headers,
            )
            self.assertEqual(resp.status_code, 200, resp.text)
            payload = resp.json()
            self.assertGreaterEqual(len(payload.get("top_cpu", [])), 1)
            self.assertGreaterEqual(len(payload.get("top_memory", [])), 1)
            self.assertGreaterEqual(len(payload.get("top_disk_io", [])), 1)
            self.assertGreaterEqual(len(payload.get("top_network_bandwidth", [])), 1)
            self.assertEqual(payload["top_cpu"][0]["resource_id"], "i-top-cpu")
            self.assertEqual(payload["top_memory"][0]["resource_id"], "i-top-memory")
        finally:
            api_module.get_rightsizing_recommendations = original_get_rightsizing


if __name__ == "__main__":
    unittest.main()
