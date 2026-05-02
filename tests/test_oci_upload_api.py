"""Tests for OCI credential file upload endpoint."""

import os
import shutil
import tempfile
import unittest

TEST_DB = os.path.join(tempfile.gettempdir(), "optiora_oci_upload_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-oci-upload-secret"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient

    from finops_mcp.app import app
    from finops_mcp.orm_models import (
        Base,
        Organization,
        SessionLocal,
        User,
        UserOrganization,
        UserRole,
        engine,
    )
except ImportError as exc:  # pragma: no cover
    raise unittest.SkipTest(f"Backend dependencies are not installed: {exc}") from exc


class OciCredentialUploadApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.upload_dir = tempfile.mkdtemp(prefix="optiora-oci-upload-")
        os.environ["OCI_UPLOADED_CREDENTIAL_DIR"] = cls.upload_dir
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        shutil.rmtree(cls.upload_dir, ignore_errors=True)
        try:
            os.remove(TEST_DB)
        except FileNotFoundError:
            pass

    def _register_and_login(self, email: str) -> None:
        self.client.post(
            "/auth/register",
            json={"email": email, "password": "StrongPass1!", "full_name": "Test User"},
        )
        self.client.post(
            "/auth/login",
            json={"email": email, "password": "StrongPass1!"},
        )

    def test_owner_can_upload_oci_config_and_key_files(self) -> None:
        self._register_and_login("oci-upload-owner@example.com")

        config_text = """[JNB]\nuser=ocid1.user.oc1..example\ntenancy=ocid1.tenancy.oc1..example\nregion=me-abudhabi-1\nfingerprint=aa:bb:cc\nkey_file=/tmp/old.pem\n"""
        key_text = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n"

        response = self.client.post(
            "/api/v1/credentials/oci/upload-files",
            data={"profile": "[JNB]"},
            files={
                "config_file": ("config", config_text.encode("utf-8"), "text/plain"),
                "private_key_file": ("oci_api_key.pem", key_text.encode("utf-8"), "application/x-pem-file"),
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "success")
        self.assertTrue(payload["test_only"])
        self.assertEqual(payload["profile"], "JNB")

        config_path = payload["config_file"]
        key_path = payload["key_file"]
        self.assertTrue(config_path.startswith(self.upload_dir))
        self.assertTrue(key_path.startswith(self.upload_dir))
        self.assertTrue(os.path.exists(config_path))
        self.assertTrue(os.path.exists(key_path))

        with open(config_path, "r", encoding="utf-8") as fh:
            stored_config = fh.read()
        self.assertIn("[JNB]", stored_config)
        self.assertIn(f"key_file={key_path}", stored_config)

    def test_readonly_user_cannot_upload_oci_files(self) -> None:
        owner_reg = self.client.post(
            "/auth/register",
            json={
                "email": "oci-upload-org-owner@example.com",
                "password": "StrongPass1!",
                "full_name": "Owner",
            },
        )
        owner_id = owner_reg.json()["id"]

        readonly_reg = self.client.post(
            "/auth/register",
            json={
                "email": "oci-upload-readonly@example.com",
                "password": "StrongPass1!",
                "full_name": "Readonly",
            },
        )
        readonly_id = readonly_reg.json()["id"]

        db = SessionLocal()
        try:
            owner = db.query(User).filter(User.id == owner_id).first()
            assert owner is not None
            org = Organization(name="OCI Upload Role Org", owner_id=owner.id)
            db.add(org)
            db.flush()
            db.add(UserOrganization(user_id=owner.id, organization_id=org.id, role=UserRole.OWNER))
            db.add(UserOrganization(user_id=readonly_id, organization_id=org.id, role=UserRole.READONLY))
            db.commit()
            org_id = org.id
        finally:
            db.close()

        self.client.post(
            "/auth/login",
            json={"email": "oci-upload-readonly@example.com", "password": "StrongPass1!"},
        )
        self.client.post("/auth/organization/select", json={"organization_id": org_id})

        blocked = self.client.post(
            "/api/v1/credentials/oci/upload-files",
            data={"profile": "DEFAULT"},
            files={
                "config_file": (
                    "config",
                    b"[DEFAULT]\nuser=ocid1.user.oc1..example\ntenancy=ocid1.tenancy.oc1..example\nregion=uk-london-1\n",
                    "text/plain",
                )
            },
        )

        self.assertEqual(blocked.status_code, 403)


if __name__ == "__main__":
    unittest.main()
