"""Epic 1: Platform hardening tests covering credential delete, scan pause/resume,
scheduler run-now, public-mode CSV upload, ORM column verification, and
analyst-role access control."""

import os
import tempfile
import unittest
import base64
import json
from datetime import datetime, timezone

TEST_DB = os.path.join(tempfile.gettempdir(), "optiora_hardening_test.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{TEST_DB}")
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-hardening-secret"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient
    from sqlalchemy import inspect as sa_inspect

    from finops_mcp import api as api_module
    from finops_mcp.app import app
    from finops_mcp.orm_models import (
        Base,
        Organization,
        SessionLocal,
        User,
        UserOrganization,
        UserRole,
        ensure_public_workspace,
        engine,
    )
except ImportError as exc:
    raise unittest.SkipTest(f"Backend dependencies not installed: {exc}") from exc


class _MockCredentialStatus:
    provider = "aws"
    is_valid = True
    message = "mocked"
    test_cost_usd = 0.0
    tested_at = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    error_details = None


async def _noop_cost_analysis(scan_id: str, customer_id: str, providers: list, **kwargs) -> None:
    _ = (scan_id, customer_id, providers, kwargs)


def _setup_db() -> None:
    engine.dispose()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def _teardown_db() -> None:
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


class CredentialDeleteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _setup_db()
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def _register_and_login(self, email: str) -> None:
        self.client.post(
            "/auth/register",
            json={"email": email, "password": "StrongPass1!", "full_name": "Test User"},
        )
        self.client.post("/auth/login", json={"email": email, "password": "StrongPass1!"})

    def test_credential_delete_success_and_list_empties(self) -> None:
        self._register_and_login("del-owner@example.com")
        orig_val = api_module._run_validation
        orig_cost = api_module._run_cost_analysis
        try:
            api_module._run_validation = lambda _: _MockCredentialStatus()
            api_module._run_cost_analysis = _noop_cost_analysis

            add = self.client.post(
                "/api/v1/credentials/add",
                json={
                    "provider": "aws",
                    "access_key_id": "AKIA_DEL",
                    "secret_access_key": "SECRET_DEL",
                    "region": "us-east-1",
                },
            )
            self.assertEqual(add.status_code, 200)

            listed = self.client.get("/api/v1/credentials")
            self.assertEqual(len(listed.json()["credentials"]), 1)

            deleted = self.client.delete("/api/v1/credentials/aws")
            self.assertEqual(deleted.status_code, 200)
            self.assertEqual(deleted.json()["status"], "success")
            self.assertEqual(deleted.json()["provider"], "aws")

            listed_after = self.client.get("/api/v1/credentials")
            self.assertEqual(len(listed_after.json()["credentials"]), 0)
        finally:
            api_module._run_validation = orig_val
            api_module._run_cost_analysis = orig_cost

    def test_credential_add_starts_scan_for_all_configured_providers(self) -> None:
        self._register_and_login("auto-scan-all@example.com")
        orig_val = api_module._run_validation
        orig_cost = api_module._run_cost_analysis
        try:
            api_module._run_validation = lambda _: _MockCredentialStatus()
            api_module._run_cost_analysis = _noop_cost_analysis

            first = self.client.post(
                "/api/v1/credentials/add",
                json={
                    "provider": "aws",
                    "access_key_id": "AKIA_AUTO",
                    "secret_access_key": "SECRET_AUTO",
                    "region": "us-east-1",
                },
            )
            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.json()["scan"]["providers"], ["aws"])

            second = self.client.post(
                "/api/v1/credentials/add",
                json={
                    "provider": "azure",
                    "subscription_id": "sub-auto",
                    "tenant_id": "tenant-auto",
                    "client_id": "client-auto",
                    "client_secret": "secret-auto",
                },
            )
            self.assertEqual(second.status_code, 200)
            self.assertEqual(second.json()["scan"]["providers"], ["aws", "azure"])
            self.assertIn("AWS, AZURE", second.json()["message"])
        finally:
            api_module._run_validation = orig_val
            api_module._run_cost_analysis = orig_cost

    def test_credential_delete_returns_404_when_not_found(self) -> None:
        self._register_and_login("del-404@example.com")
        result = self.client.delete("/api/v1/credentials/gcp")
        self.assertEqual(result.status_code, 404)

    def test_credential_delete_requires_management_role(self) -> None:
        owner_reg = self.client.post(
            "/auth/register",
            json={"email": "del-ro-owner@example.com", "password": "StrongPass1!", "full_name": "Owner"},
        )
        owner_id = owner_reg.json()["id"]

        readonly_reg = self.client.post(
            "/auth/register",
            json={"email": "del-readonly@example.com", "password": "StrongPass1!", "full_name": "Readonly"},
        )
        readonly_id = readonly_reg.json()["id"]

        db = SessionLocal()
        try:
            owner = db.query(User).filter(User.id == owner_id).first()
            org = Organization(name="Del Role Org", owner_id=owner.id)
            db.add(org)
            db.flush()
            db.add(UserOrganization(user_id=owner.id, organization_id=org.id, role=UserRole.OWNER))
            db.add(UserOrganization(user_id=readonly_id, organization_id=org.id, role=UserRole.READONLY))
            db.commit()
            org_id = org.id
        finally:
            db.close()

        self.client.post("/auth/login", json={"email": "del-readonly@example.com", "password": "StrongPass1!"})
        self.client.post("/auth/organization/select", json={"organization_id": org_id})

        blocked = self.client.delete("/api/v1/credentials/aws")
        self.assertEqual(blocked.status_code, 403)


class ScanPauseResumeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _setup_db()
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def test_scan_pause_and_resume_changes_state(self) -> None:
        self.client.post(
            "/auth/register",
            json={"email": "pause@example.com", "password": "StrongPass1!", "full_name": "Pause Owner"},
        )
        self.client.post("/auth/login", json={"email": "pause@example.com", "password": "StrongPass1!"})

        approved = self.client.post(
            "/api/v1/scanning/approve",
            json={"scan_frequency": "daily", "auto_remediate": False},
        )
        self.assertEqual(approved.status_code, 200)
        self.assertEqual(approved.json()["state"], "approved")

        paused = self.client.post("/api/v1/scanning/pause")
        self.assertEqual(paused.status_code, 200)
        self.assertEqual(paused.json()["state"], "paused")

        status_after_pause = self.client.get("/api/v1/scanning/permission")
        self.assertEqual(status_after_pause.status_code, 200)
        self.assertEqual(status_after_pause.json()["state"], "paused")

        resumed = self.client.post("/api/v1/scanning/resume")
        self.assertEqual(resumed.status_code, 200)
        self.assertEqual(resumed.json()["state"], "running")

        status_after_resume = self.client.get("/api/v1/scanning/permission")
        self.assertEqual(status_after_resume.status_code, 200)
        self.assertEqual(status_after_resume.json()["state"], "running")

    def test_scheduler_run_now_returns_status(self) -> None:
        self.client.post(
            "/auth/register",
            json={"email": "runnow@example.com", "password": "StrongPass1!", "full_name": "Run Now Owner"},
        )
        self.client.post("/auth/login", json={"email": "runnow@example.com", "password": "StrongPass1!"})

        self.client.post(
            "/api/v1/scanning/approve",
            json={"scan_frequency": "daily", "auto_remediate": False},
        )

        orig_cost = api_module._run_cost_analysis
        try:
            api_module._run_cost_analysis = _noop_cost_analysis
            result = self.client.post("/api/v1/scanning/scheduler/run-now")
        finally:
            api_module._run_cost_analysis = orig_cost

        self.assertEqual(result.status_code, 200)
        payload = result.json()
        self.assertIn("status", payload)
        self.assertIn(payload["status"], ("ok", "busy", "idle"))


class PublicModeCsvUploadTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _setup_db()

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def test_public_mode_csv_upload_succeeds(self) -> None:
        prev_auth = os.environ.get("ENABLE_AUTH")
        os.environ["ENABLE_AUTH"] = "false"
        try:
            ensure_public_workspace()
            with TestClient(app) as public_client:
                upload = public_client.post(
                    "/api/v1/imports/costs/csv",
                    files={
                        "file": (
                            "public-smoke.csv",
                            "provider,cost_usd,service_name,region\naws,99.00,Lambda,us-east-1\n",
                            "text/csv",
                        )
                    },
                )
                self.assertEqual(upload.status_code, 200)
                self.assertEqual(upload.json()["rows_imported"], 1)

                summary = public_client.get("/api/v1/imports/costs/summary")
                self.assertEqual(summary.status_code, 200)
                self.assertTrue(summary.json()["has_data"])

                costs = public_client.get("/api/v1/costs")
                self.assertEqual(costs.status_code, 200)
                self.assertAlmostEqual(costs.json()["totalCost"], 99.0)
        finally:
            if prev_auth is None:
                os.environ.pop("ENABLE_AUTH", None)
            else:
                os.environ["ENABLE_AUTH"] = prev_auth


class OrmColumnSchemaTest(unittest.TestCase):
    """Verify that ORM-created schema includes all required hierarchy columns.

    This complements the Alembic roundtrip test in test_auth_flow.py by
    asserting specific column presence in tables added by migrations 0003-0005.
    """

    @classmethod
    def setUpClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def test_imported_cost_records_has_hierarchy_columns(self) -> None:
        inspector = sa_inspect(engine)
        self.assertTrue(inspector.has_table("imported_cost_records"))
        col_names = {c["name"] for c in inspector.get_columns("imported_cost_records")}
        for col in ("account_identifier", "account_name", "account_type", "parent_account_identifier", "region", "currency"):
            self.assertIn(col, col_names, f"Column {col!r} missing from imported_cost_records")

    def test_provider_accounts_table_exists_with_key_columns(self) -> None:
        inspector = sa_inspect(engine)
        self.assertTrue(inspector.has_table("provider_accounts"))
        col_names = {c["name"] for c in inspector.get_columns("provider_accounts")}
        for col in ("organization_id", "provider", "account_identifier", "account_name", "account_type"):
            self.assertIn(col, col_names, f"Column {col!r} missing from provider_accounts")

    def test_audit_logs_table_has_required_columns(self) -> None:
        inspector = sa_inspect(engine)
        self.assertTrue(inspector.has_table("audit_logs"))
        col_names = {c["name"] for c in inspector.get_columns("audit_logs")}
        for col in ("organization_id", "actor_user_id", "action", "entity_type"):
            self.assertIn(col, col_names, f"Column {col!r} missing from audit_logs")

    def test_export_job_tables_exist_with_required_columns(self) -> None:
        inspector = sa_inspect(engine)
        self.assertTrue(inspector.has_table("export_jobs"))
        self.assertTrue(inspector.has_table("export_job_runs"))

        job_cols = {c["name"] for c in inspector.get_columns("export_jobs")}
        for col in (
            "organization_id",
            "customer_id",
            "name",
            "report_type",
            "export_format",
            "schedule_frequency",
            "last_run_at",
        ):
            self.assertIn(col, job_cols, f"Column {col!r} missing from export_jobs")

        run_cols = {c["name"] for c in inspector.get_columns("export_job_runs")}
        for col in (
            "export_job_id",
            "organization_id",
            "customer_id",
            "status",
            "output_filename",
            "row_count",
            "error_message",
        ):
            self.assertIn(col, run_cols, f"Column {col!r} missing from export_job_runs")


class ExportJobsAndGcpIngestionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _setup_db()
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def _register_and_login(self, email: str) -> None:
        self.client.post(
            "/auth/register",
            json={"email": email, "password": "StrongPass1!", "full_name": "Ops Owner"},
        )
        self.client.post("/auth/login", json={"email": email, "password": "StrongPass1!"})

    def test_export_job_create_run_and_history(self) -> None:
        self._register_and_login("export-owner@example.com")

        created = self.client.post(
            "/api/v1/exports/jobs",
            json={
                "name": "Weekly Executive CSV",
                "report_type": "executive_summary",
                "export_format": "csv",
                "schedule_frequency": "weekly",
                "is_active": True,
            },
        )
        self.assertEqual(created.status_code, 200)
        job_id = created.json()["id"]

        listed = self.client.get("/api/v1/exports/jobs")
        self.assertEqual(listed.status_code, 200)
        self.assertTrue(any(row["id"] == job_id for row in listed.json()))

        run = self.client.post(f"/api/v1/exports/jobs/{job_id}/run")
        self.assertEqual(run.status_code, 200)
        self.assertIn(run.json()["status"], ("completed", "failed"))

        history = self.client.get(f"/api/v1/exports/jobs/{job_id}/runs")
        self.assertEqual(history.status_code, 200)
        self.assertGreaterEqual(len(history.json()), 1)

    def test_gcp_pubsub_ingestion_creates_alert_event(self) -> None:
        self._register_and_login("gcp-owner@example.com")

        raw_payload = {
            "budgetDisplayName": "Core Infra Budget",
            "costAmount": 1100.0,
            "budgetAmount": 1000.0,
        }
        encoded = base64.b64encode(json.dumps(raw_payload).encode("utf-8")).decode("utf-8")

        ingested = self.client.post(
            "/api/v1/anomalies/external/gcp/pubsub",
            json={
                "message": {
                    "messageId": "msg-123",
                    "data": encoded,
                },
                "subscription": "projects/p/subscriptions/s",
            },
        )
        self.assertEqual(ingested.status_code, 200)
        self.assertEqual(ingested.json().get("ingested"), 1)

        alerts = self.client.get("/api/v1/alerts")
        self.assertEqual(alerts.status_code, 200)
        rows = alerts.json()
        self.assertTrue(any(item["alert_type"] == "external.gcp.budget_pubsub" for item in rows))


class AnalystRoleAccessTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _setup_db()
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def test_analyst_can_read_credentials_but_not_delete_or_upload_csv(self) -> None:
        owner_reg = self.client.post(
            "/auth/register",
            json={"email": "analyst-owner@example.com", "password": "StrongPass1!", "full_name": "Owner"},
        )
        owner_id = owner_reg.json()["id"]

        analyst_reg = self.client.post(
            "/auth/register",
            json={"email": "analyst-user@example.com", "password": "StrongPass1!", "full_name": "Analyst"},
        )
        analyst_id = analyst_reg.json()["id"]

        db = SessionLocal()
        try:
            owner = db.query(User).filter(User.id == owner_id).first()
            org = Organization(name="Analyst Test Org", owner_id=owner.id)
            db.add(org)
            db.flush()
            db.add(UserOrganization(user_id=owner.id, organization_id=org.id, role=UserRole.OWNER))
            db.add(UserOrganization(user_id=analyst_id, organization_id=org.id, role=UserRole.ANALYST))
            db.commit()
            org_id = org.id
        finally:
            db.close()

        self.client.post("/auth/login", json={"email": "analyst-user@example.com", "password": "StrongPass1!"})
        switched = self.client.post("/auth/organization/select", json={"organization_id": org_id})
        self.assertEqual(switched.status_code, 200)

        listed = self.client.get("/api/v1/credentials")
        self.assertEqual(listed.status_code, 200)
        self.assertIn("credentials", listed.json())

        costs = self.client.get("/api/v1/costs")
        self.assertEqual(costs.status_code, 200)

        blocked_delete = self.client.delete("/api/v1/credentials/aws")
        self.assertEqual(blocked_delete.status_code, 403)

        blocked_csv = self.client.post(
            "/api/v1/imports/costs/csv",
            files={"file": ("costs.csv", "provider,cost_usd\naws,10\n", "text/csv")},
        )
        self.assertEqual(blocked_csv.status_code, 403)


if __name__ == "__main__":
    unittest.main()
