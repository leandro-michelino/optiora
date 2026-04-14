"""Regression tests for authentication and tenant-scoped API behavior."""

import os
import tempfile
import unittest


TEST_DB = os.path.join(tempfile.gettempdir(), "optiora_auth_flow_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient  # noqa: E402

    from finops_mcp.app import app  # noqa: E402
    from finops_mcp.orm_models import Base, engine  # noqa: E402
except ImportError as exc:  # pragma: no cover - local dependency guard
    raise unittest.SkipTest(f"Backend dependencies are not installed: {exc}") from exc


class AuthFlowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        try:
            os.remove(TEST_DB)
        except FileNotFoundError:
            pass

    def test_auth_refresh_password_reset_and_orgs(self) -> None:
        register = self.client.post(
            "/auth/register",
            json={
                "email": "Owner@Example.com",
                "password": "StrongPass1!",
                "full_name": "Owner User",
            },
        )
        self.assertEqual(register.status_code, 201)
        self.assertEqual(register.json()["email"], "owner@example.com")

        login = self.client.post(
            "/auth/login",
            json={"email": "owner@example.com", "password": "StrongPass1!"},
        )
        self.assertEqual(login.status_code, 200)
        tokens = login.json()
        self.assertIn("access_token", tokens)

        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        orgs = self.client.get("/auth/organizations", headers=headers)
        self.assertEqual(orgs.status_code, 200)
        self.assertEqual(orgs.json()[0]["role"], "owner")

        scoped = self.client.get("/api/v1/credentials?customer_id=user-999", headers=headers)
        self.assertEqual(scoped.status_code, 403)
        self.assertIn("authenticated user scope", scoped.json()["detail"])

        refresh = self.client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        self.assertEqual(refresh.status_code, 200)

        reset_request = self.client.post(
            "/auth/password-reset-request",
            json={"email": "owner@example.com"},
        )
        self.assertEqual(reset_request.status_code, 200)
        reset_token = reset_request.json()["reset_token"]
        self.assertTrue(reset_token)

        reset = self.client.post(
            "/auth/password-reset",
            json={"reset_token": reset_token, "new_password": "NewStrong1!"},
        )
        self.assertEqual(reset.status_code, 200)

        old_login = self.client.post(
            "/auth/login",
            json={"email": "owner@example.com", "password": "StrongPass1!"},
        )
        self.assertEqual(old_login.status_code, 401)

        new_login = self.client.post(
            "/auth/login",
            json={"email": "owner@example.com", "password": "NewStrong1!"},
        )
        self.assertEqual(new_login.status_code, 200)

    def test_login_rate_limit_returns_429(self) -> None:
        for _ in range(8):
            response = self.client.post(
                "/auth/login",
                json={"email": "missing@example.com", "password": "WrongPass1!"},
            )
            self.assertEqual(response.status_code, 401)

        limited = self.client.post(
            "/auth/login",
            json={"email": "missing@example.com", "password": "WrongPass1!"},
        )
        self.assertEqual(limited.status_code, 429)


if __name__ == "__main__":
    unittest.main()
