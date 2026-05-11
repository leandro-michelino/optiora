"""Runtime hardening regression tests (readiness + request tracing)."""

import os
import tempfile
import unittest

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_runtime_hardening_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-runtime-hardening"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"
os.environ["DEPLOYMENT_TARGET"] = "oci"
os.environ["OCI_RUNTIME_REQUIRED"] = "false"
os.environ["REQUIRE_LIVE_PROVIDER_DATA"] = "false"

try:
    from fastapi.testclient import TestClient

    from optiora_backend.app import app
    from optiora_backend.orm_models import Base, engine
except ImportError as exc:  # pragma: no cover
    raise unittest.SkipTest(f"Backend dependencies not installed: {exc}") from exc


class RuntimeHardeningTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        try:
            os.remove(TEST_DB)
        except FileNotFoundError:
            pass

    def test_health_echoes_request_id_header(self) -> None:
        response = self.client.get("/health", headers={"X-Request-ID": "qa-request-123"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers.get("x-request-id"), "qa-request-123")
        self.assertIn("x-response-time-ms", response.headers)
        self.assertGreaterEqual(float(response.headers["x-response-time-ms"]), 0.0)

    def test_health_generates_request_id_when_missing(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200, response.text)
        request_id = response.headers.get("x-request-id", "")
        self.assertTrue(request_id)
        self.assertGreaterEqual(len(request_id), 16)

    def test_readiness_endpoint_returns_deep_checks(self) -> None:
        response = self.client.get("/api/v1/health/readiness")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertIn(payload.get("status"), {"healthy", "degraded", "unhealthy"})
        self.assertIn("checks", payload)
        checks = payload["checks"]
        self.assertIn("database", checks)
        self.assertIn("providers", checks)
        self.assertIn("runtime", checks)
        self.assertIn(checks["database"].get("status"), {"healthy", "unhealthy"})
        self.assertIn(checks["providers"].get("status"), {"healthy", "degraded", "unhealthy"})
        self.assertEqual(checks["runtime"].get("deployment_target"), "oci")
        self.assertFalse(checks["runtime"].get("oci_runtime_required"))


if __name__ == "__main__":
    unittest.main()
