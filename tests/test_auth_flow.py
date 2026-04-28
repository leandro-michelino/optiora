"""Regression tests for authentication and tenant-scoped API behavior."""

import os
import tempfile
import unittest
from datetime import datetime, timezone
from unittest.mock import patch


TEST_DB = os.path.join(tempfile.gettempdir(), "optiora_auth_flow_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from alembic import command as alembic_command  # noqa: E402
    from alembic.config import Config as AlembicConfig  # noqa: E402
    from fastapi.testclient import TestClient  # noqa: E402
    from sqlalchemy import inspect  # noqa: E402

    from finops_mcp import api as api_module  # noqa: E402
    import finops_mcp.app as app_module  # noqa: E402
    from finops_mcp.app import app  # noqa: E402
    from finops_mcp.orm_models import (  # noqa: E402
        Base,
        Organization,
        SessionLocal,
        User,
        UserOrganization,
        UserRole,
        ensure_public_workspace,
        engine,
    )
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

        scoped = self.client.get("/api/v1/credentials?customer_id=org-999", headers=headers)
        self.assertEqual(scoped.status_code, 403)
        self.assertIn("authenticated organization scope", scoped.json()["detail"])

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

    def test_cookie_refresh_and_org_switch(self) -> None:
        register = self.client.post(
            "/auth/register",
            json={
                "email": "switcher@example.com",
                "password": "StrongPass1!",
                "full_name": "Switcher",
            },
        )
        self.assertEqual(register.status_code, 201)
        user_id = register.json()["id"]

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            assert user is not None
            second_org = Organization(name="Second Org", owner_id=user.id)
            db.add(second_org)
            db.flush()
            membership = UserOrganization(
                user_id=user.id,
                organization_id=second_org.id,
                role=UserRole.ADMIN,
            )
            db.add(membership)
            db.commit()
            second_org_id = second_org.id
        finally:
            db.close()

        login = self.client.post(
            "/auth/login",
            json={"email": "switcher@example.com", "password": "StrongPass1!"},
        )
        self.assertEqual(login.status_code, 200)

        profile = self.client.get("/auth/profile")
        self.assertEqual(profile.status_code, 200)

        current_org = self.client.get("/auth/organization")
        self.assertEqual(current_org.status_code, 200)
        first_org_id = current_org.json()["id"]
        self.assertNotEqual(first_org_id, second_org_id)

        switched = self.client.post(
            "/auth/organization/select",
            json={"organization_id": second_org_id},
        )
        self.assertEqual(switched.status_code, 200)
        self.assertEqual(switched.json()["id"], second_org_id)

        refreshed = self.client.post("/auth/refresh", json={})
        self.assertEqual(refreshed.status_code, 200)
        self.assertEqual(refreshed.json().get("token_type"), "bearer")

        active_after_switch = self.client.get("/auth/organization")
        self.assertEqual(active_after_switch.status_code, 200)
        self.assertEqual(active_after_switch.json()["id"], second_org_id)

    def test_credential_crud_and_scan_flow_are_org_scoped(self) -> None:
        register = self.client.post(
            "/auth/register",
            json={
                "email": "ops@example.com",
                "password": "StrongPass1!",
                "full_name": "Ops User",
            },
        )
        self.assertEqual(register.status_code, 201)
        user_id = register.json()["id"]

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            assert user is not None
            extra_org = Organization(name="Ops Secondary", owner_id=user.id)
            db.add(extra_org)
            db.flush()
            db.add(
                UserOrganization(
                    user_id=user.id,
                    organization_id=extra_org.id,
                    role=UserRole.ANALYST,
                )
            )
            db.commit()
            extra_org_id = extra_org.id
        finally:
            db.close()

        login = self.client.post(
            "/auth/login",
            json={"email": "ops@example.com", "password": "StrongPass1!"},
        )
        self.assertEqual(login.status_code, 200)

        original_run_validation = api_module._run_validation
        original_run_cost_analysis = api_module._run_cost_analysis

        class _MockStatus:
            provider = "aws"
            is_valid = True
            message = "mocked validation"
            test_cost_usd = 12.34
            tested_at = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
            error_details = None

        try:
            api_module._run_validation = lambda _credential: _MockStatus()

            async def _noop_run_cost_analysis(scan_id: str, customer_id: str, providers: list[str], target_accounts=None) -> None:
                _ = (scan_id, customer_id, providers)
                return None

            api_module._run_cost_analysis = _noop_run_cost_analysis

            add = self.client.post(
                "/api/v1/credentials/add",
                json={
                    "provider": "aws",
                    "access_key_id": "AKIA123",
                    "secret_access_key": "SECRET123",
                    "region": "us-east-1",
                },
            )
            self.assertEqual(add.status_code, 200)
            self.assertTrue(add.json()["customer_id"].startswith("org-"))

            listed = self.client.get("/api/v1/credentials")
            self.assertEqual(listed.status_code, 200)
            self.assertEqual(len(listed.json().get("credentials", [])), 1)

            approved = self.client.post(
                "/api/v1/scanning/approve",
                json={
                    "scan_frequency": "daily",
                    "auto_remediate": False,
                },
            )
            self.assertEqual(approved.status_code, 200)
            self.assertEqual(approved.json()["state"], "approved")

            started = self.client.post(
                "/api/v1/scanning/start",
                json={"providers": ["aws"]},
            )
            self.assertEqual(started.status_code, 200)
            scan_id = started.json()["scan_id"]
            self.assertIn("org-", started.json()["customer_id"])

            progress = self.client.get(f"/api/v1/scanning/{scan_id}/progress")
            self.assertEqual(progress.status_code, 200)

            switched = self.client.post(
                "/auth/organization/select",
                json={"organization_id": extra_org_id},
            )
            self.assertEqual(switched.status_code, 200)

            listed_in_new_org = self.client.get("/api/v1/credentials")
            self.assertEqual(listed_in_new_org.status_code, 200)
            self.assertEqual(len(listed_in_new_org.json().get("credentials", [])), 0)
        finally:
            api_module._run_validation = original_run_validation
            api_module._run_cost_analysis = original_run_cost_analysis

    def test_csv_cost_import_replaces_manual_dataset_and_updates_costs(self) -> None:
        register = self.client.post(
            "/auth/register",
            json={
                "email": "csv-owner@example.com",
                "password": "StrongPass1!",
                "full_name": "CSV Owner",
            },
        )
        self.assertEqual(register.status_code, 201)

        login = self.client.post(
            "/auth/login",
            json={"email": "csv-owner@example.com", "password": "StrongPass1!"},
        )
        self.assertEqual(login.status_code, 200)

        first_upload = self.client.post(
            "/api/v1/imports/costs/csv",
            files={
                "file": (
                    "initial-costs.csv",
                    (
                        "provider,cost_usd,service_name,account_identifier,region\n"
                        "aws,120.50,EC2,acct-100,us-east-1\n"
                        "azure,79.50,Compute,sub-200,westeurope\n"
                    ),
                    "text/csv",
                )
            },
        )
        self.assertEqual(first_upload.status_code, 200)
        self.assertEqual(first_upload.json()["rows_imported"], 2)
        self.assertEqual(sorted(first_upload.json()["providers"]), ["aws", "azure"])

        summary = self.client.get("/api/v1/imports/costs/summary")
        self.assertEqual(summary.status_code, 200)
        self.assertTrue(summary.json()["has_data"])
        self.assertEqual(summary.json()["rows_imported"], 2)
        self.assertAlmostEqual(summary.json()["total_cost_usd"], 200.0)

        costs = self.client.get("/api/v1/costs")
        self.assertEqual(costs.status_code, 200)
        self.assertEqual(costs.json()["totalCost"], 200.0)
        self.assertEqual(costs.json()["breakdown"]["aws"]["cost"], 120.5)
        self.assertEqual(costs.json()["breakdown"]["azure"]["cost"], 79.5)

        replacement_upload = self.client.post(
            "/api/v1/imports/costs/csv",
            files={
                "file": (
                    "replacement-costs.csv",
                    "provider,cost_usd,region\noci,42.25,eu-madrid-1\n",
                    "text/csv",
                )
            },
        )
        self.assertEqual(replacement_upload.status_code, 200)
        self.assertEqual(replacement_upload.json()["rows_imported"], 1)
        self.assertEqual(replacement_upload.json()["providers"], ["oci"])

        replaced_summary = self.client.get("/api/v1/imports/costs/summary")
        self.assertEqual(replaced_summary.status_code, 200)
        self.assertEqual(replaced_summary.json()["rows_imported"], 1)
        self.assertAlmostEqual(replaced_summary.json()["total_cost_usd"], 42.25)
        self.assertEqual(replaced_summary.json()["providers"], ["oci"])

        replaced_costs = self.client.get("/api/v1/costs")
        self.assertEqual(replaced_costs.status_code, 200)
        self.assertEqual(replaced_costs.json()["totalCost"], 42.25)
        self.assertEqual(replaced_costs.json()["breakdown"], {"oci": {"cost": 42.25, "percentage": 100.0}})
        self.assertEqual(replaced_costs.json()["regionBreakdown"], [{"region": "eu-madrid-1", "cost_usd": 42.25}])

    def test_csv_cost_import_requires_owner_or_admin_role(self) -> None:
        owner_register = self.client.post(
            "/auth/register",
            json={
                "email": "csv-admin@example.com",
                "password": "StrongPass1!",
                "full_name": "CSV Admin",
            },
        )
        self.assertEqual(owner_register.status_code, 201)
        owner_user_id = owner_register.json()["id"]

        db = SessionLocal()
        try:
            owner = db.query(User).filter(User.id == owner_user_id).first()
            assert owner is not None
            shared_org = Organization(name="CSV Shared Org", owner_id=owner.id)
            db.add(shared_org)
            db.flush()
            owner_membership = UserOrganization(
                user_id=owner.id,
                organization_id=shared_org.id,
                role=UserRole.OWNER,
            )
            db.add(owner_membership)
            db.commit()
            shared_org_id = shared_org.id
        finally:
            db.close()

        readonly_register = self.client.post(
            "/auth/register",
            json={
                "email": "csv-readonly@example.com",
                "password": "StrongPass1!",
                "full_name": "CSV Readonly",
            },
        )
        self.assertEqual(readonly_register.status_code, 201)
        readonly_user_id = readonly_register.json()["id"]

        db = SessionLocal()
        try:
            db.add(
                UserOrganization(
                    user_id=readonly_user_id,
                    organization_id=shared_org_id,
                    role=UserRole.READONLY,
                )
            )
            db.commit()
        finally:
            db.close()

        readonly_login = self.client.post(
            "/auth/login",
            json={"email": "csv-readonly@example.com", "password": "StrongPass1!"},
        )
        self.assertEqual(readonly_login.status_code, 200)

        switched = self.client.post(
            "/auth/organization/select",
            json={"organization_id": shared_org_id},
        )
        self.assertEqual(switched.status_code, 200)

        blocked = self.client.post(
            "/api/v1/imports/costs/csv",
            files={
                "file": (
                    "readonly-costs.csv",
                    "provider,cost_usd\naws,10\n",
                    "text/csv",
                )
            },
        )
        self.assertEqual(blocked.status_code, 403)
        self.assertIn("requires", blocked.json()["detail"])

    def test_scheduler_status_and_external_aws_anomaly_ingestion(self) -> None:
        register = self.client.post(
            "/auth/register",
            json={
                "email": "scheduler@example.com",
                "password": "StrongPass1!",
                "full_name": "Scheduler Owner",
            },
        )
        self.assertEqual(register.status_code, 201)

        login = self.client.post(
            "/auth/login",
            json={"email": "scheduler@example.com", "password": "StrongPass1!"},
        )
        self.assertEqual(login.status_code, 200)

        approved = self.client.post(
            "/api/v1/scanning/approve",
            json={
                "scan_frequency": "weekly",
                "auto_remediate": False,
            },
        )
        self.assertEqual(approved.status_code, 200)

        scheduler_status = self.client.get("/api/v1/scanning/scheduler/status")
        self.assertEqual(scheduler_status.status_code, 200)
        scheduler_payload = scheduler_status.json()
        self.assertIn("counters", scheduler_payload)
        self.assertEqual(scheduler_payload["scan_frequency"], "weekly")
        self.assertIn("timeline", scheduler_payload)

        ingest = self.client.post(
            "/api/v1/anomalies/external/aws",
            json={
                "events": [
                    {
                        "detail": {
                            "anomalyId": "anomaly-123",
                            "monitorName": "prod-billing-monitor",
                            "impact": {"totalImpact": 345.67},
                        }
                    }
                ]
            },
        )
        self.assertEqual(ingest.status_code, 200)
        ingest_payload = ingest.json()
        self.assertEqual(ingest_payload["ingested"], 1)
        self.assertEqual(len(ingest_payload["alert_ids"]), 1)

        alerts = self.client.get("/api/v1/alerts")
        self.assertEqual(alerts.status_code, 200)
        self.assertTrue(any(row["alert_type"] == "external.aws.cost_anomaly" for row in alerts.json()))

    def test_imported_hierarchy_rollups_and_finance_report_exports(self) -> None:
        register = self.client.post(
            "/auth/register",
            json={
                "email": "finance-owner@example.com",
                "password": "StrongPass1!",
                "full_name": "Finance Owner",
            },
        )
        self.assertEqual(register.status_code, 201)

        login = self.client.post(
            "/auth/login",
            json={"email": "finance-owner@example.com", "password": "StrongPass1!"},
        )
        self.assertEqual(login.status_code, 200)

        upload = self.client.post(
            "/api/v1/imports/costs/csv",
            files={
                "file": (
                    "finance-rollup.csv",
                    (
                        "provider,cost_usd,service_name,account_identifier,account_name,account_type,parent_account_identifier,region,period_start,period_end,currency\n"
                        "aws,100.00,EC2,acct-a,AWS Prod A,account,aws-org-root,eu-west-2,2026-04-01T00:00:00Z,2026-04-30T23:59:59Z,USD\n"
                        "aws,50.00,S3,acct-b,AWS Prod B,account,aws-org-root,eu-west-2,2026-04-01T00:00:00Z,2026-04-30T23:59:59Z,USD\n"
                        "azure,60.00,Virtual Machines,sub-a,Azure Prod,subscription,mg-finops,uk south,2026-04-01T00:00:00Z,2026-04-30T23:59:59Z,USD\n"
                    ),
                    "text/csv",
                )
            },
        )
        self.assertEqual(upload.status_code, 200)

        rollups = self.client.get("/api/v1/provider-accounts/rollups")
        self.assertEqual(rollups.status_code, 200)
        payload = rollups.json()
        self.assertEqual(payload["total_direct_cost_usd"], 210.0)
        self.assertEqual(payload["total_rolled_up_cost_usd"], 210.0)

        aws_root = next(
            item for item in payload["items"]
            if item["provider"] == "aws" and item["account_type"] == "provider"
        )
        self.assertEqual(aws_root["rolled_up_cost_usd"], 150.0)
        self.assertEqual(aws_root["child_count"], 1)
        self.assertEqual(aws_root["depth"], 0)

        aws_group = next(
            item for item in payload["items"]
            if item["provider"] == "aws" and item["account_identifier"] == "aws-org-root"
        )
        self.assertEqual(aws_group["account_type"], "organization")
        self.assertEqual(aws_group["rolled_up_cost_usd"], 150.0)
        self.assertEqual(aws_group["child_count"], 2)
        self.assertEqual(aws_group["depth"], 1)

        aws_child = next(
            item for item in payload["items"]
            if item["provider"] == "aws" and item["account_identifier"] == "acct-a"
        )
        self.assertEqual(aws_child["rolled_up_cost_usd"], 100.0)
        self.assertEqual(aws_child["depth"], 2)

        template = self.client.get("/api/v1/imports/costs/template.csv")
        self.assertEqual(template.status_code, 200)
        self.assertIn("account_type", template.text)
        self.assertIn("parent_account_identifier", template.text)

        report_csv = self.client.get("/api/v1/reports/executive-summary.csv")
        self.assertEqual(report_csv.status_code, 200)
        self.assertIn("Total Monthly Cost USD", report_csv.text)
        self.assertIn("AWS Prod A", report_csv.text)

        report_excel = self.client.get("/api/v1/reports/executive-summary.xls")
        self.assertEqual(report_excel.status_code, 200)
        self.assertIn("application/vnd.ms-excel", report_excel.headers.get("content-type", ""))
        self.assertIn(b"Executive Summary", report_excel.content)

    def test_csv_import_validation_reports_multiple_row_errors(self) -> None:
        register = self.client.post(
            "/auth/register",
            json={
                "email": "csv-validation@example.com",
                "password": "StrongPass1!",
                "full_name": "CSV Validation Owner",
            },
        )
        self.assertEqual(register.status_code, 201)

        login = self.client.post(
            "/auth/login",
            json={"email": "csv-validation@example.com", "password": "StrongPass1!"},
        )
        self.assertEqual(login.status_code, 200)

        invalid_upload = self.client.post(
            "/api/v1/imports/costs/csv",
            files={
                "file": (
                    "invalid-costs.csv",
                    (
                        "provider,cost_usd,period_start,currency\n"
                        "digitalocean,10.00,2026-04-01T00:00:00Z,USD\n"
                        "aws,not-a-number,2026-04-01T00:00:00Z,USD\n"
                        "azure,20.00,not-a-date,EUR\n"
                    ),
                    "text/csv",
                )
            },
        )
        self.assertEqual(invalid_upload.status_code, 400)
        detail = invalid_upload.json()["detail"]
        self.assertIn("CSV validation failed", detail)
        self.assertIn("Unsupported provider at CSV line 2", detail)
        self.assertIn("Invalid cost_usd at CSV line 3", detail)
        self.assertIn("Invalid currency at line 4", detail)

    def test_public_mode_info_contract_includes_reporting_features(self) -> None:
        previous_auth = os.environ.get("ENABLE_AUTH")
        os.environ["ENABLE_AUTH"] = "false"

        try:
            ensure_public_workspace()
            with TestClient(app) as public_client:
                info = public_client.get("/api/v1/info")
                self.assertEqual(info.status_code, 200)
                features = info.json()["features"]
                self.assertTrue(features["csv_import_templates"])
                self.assertTrue(features["excel_exports"])
                self.assertTrue(features["executive_reports"])

                template = public_client.get("/api/v1/imports/costs/template.csv")
                self.assertEqual(template.status_code, 200)
                self.assertIn("optiora-cost-import-template.csv", template.headers.get("content-disposition", ""))
        finally:
            if previous_auth is None:
                os.environ.pop("ENABLE_AUTH", None)
            else:
                os.environ["ENABLE_AUTH"] = previous_auth

    def test_optiora_cli_honors_host_port_and_reload_flags(self) -> None:
        with patch("finops_mcp.app.uvicorn.run") as mocked_run:
            app_module.main(["--host", "127.0.0.1", "--port", "9001", "--reload"])

        mocked_run.assert_called_once_with(
            "finops_mcp.app:app",
            host="127.0.0.1",
            port=9001,
            reload=True,
        )

    def test_z_alembic_upgrade_downgrade_roundtrip(self) -> None:
        cfg = AlembicConfig("alembic.ini")
        Base.metadata.drop_all(bind=engine)

        alembic_command.upgrade(cfg, "head")

        alembic_command.downgrade(cfg, "base")
        inspector = inspect(engine)
        self.assertFalse(inspector.has_table("users"))

        alembic_command.upgrade(cfg, "head")
        inspector = inspect(engine)
        self.assertTrue(inspector.has_table("users"))
        self.assertTrue(inspector.has_table("credential_records"))
        self.assertTrue(inspector.has_table("scan_runs"))
        self.assertTrue(inspector.has_table("cost_snapshots"))
        self.assertTrue(inspector.has_table("imported_cost_records"))

        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

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

    def test_csv_import_rejects_negative_costs(self) -> None:
        register = self.client.post(
            "/auth/register",
            json={
                "email": "neg-cost@example.com",
                "password": "StrongPass1!",
                "full_name": "Neg Cost Owner",
            },
        )
        self.assertEqual(register.status_code, 201)

        self.client.post(
            "/auth/login",
            json={"email": "neg-cost@example.com", "password": "StrongPass1!"},
        )

        negative_upload = self.client.post(
            "/api/v1/imports/costs/csv",
            files={
                "file": (
                    "negative-costs.csv",
                    "provider,cost_usd\naws,-50.00\naws,100.00\n",
                    "text/csv",
                )
            },
        )
        self.assertEqual(negative_upload.status_code, 400)
        detail = negative_upload.json()["detail"]
        self.assertIn("CSV validation failed", detail)
        self.assertIn("Negative cost_usd at CSV line 2", detail)

    def test_scan_history_and_diff_endpoints(self) -> None:
        register = self.client.post(
            "/auth/register",
            json={
                "email": "history@example.com",
                "password": "StrongPass1!",
                "full_name": "History Owner",
            },
        )
        self.assertEqual(register.status_code, 201)

        self.client.post(
            "/auth/login",
            json={"email": "history@example.com", "password": "StrongPass1!"},
        )

        original_run_validation = api_module._run_validation
        original_run_cost_analysis = api_module._run_cost_analysis

        class _MockStatus:
            provider = "aws"
            is_valid = True
            message = "mocked"
            test_cost_usd = 0.0
            tested_at = "2026-04-16T00:00:00"
            error_details = None

        try:
            api_module._run_validation = lambda _credential: _MockStatus()

            async def _noop(scan_id: str, customer_id: str, providers: list[str], target_accounts=None) -> None:
                _ = (scan_id, customer_id, providers)

            api_module._run_cost_analysis = _noop

            self.client.post(
                "/api/v1/credentials/add",
                json={
                    "provider": "aws",
                    "access_key_id": "AKIA_HIST",
                    "secret_access_key": "SECRET_HIST",
                    "region": "us-east-1",
                },
            )
            self.client.post(
                "/api/v1/scanning/approve",
                json={"scan_frequency": "daily", "auto_remediate": False},
            )
            started = self.client.post(
                "/api/v1/scanning/start",
                json={"providers": ["aws"]},
            )
            self.assertEqual(started.status_code, 200)
            scan_id = started.json()["scan_id"]

            history = self.client.get("/api/v1/scanning/history")
            self.assertEqual(history.status_code, 200)
            self.assertIsInstance(history.json(), list)
            self.assertTrue(any(item["scan_id"] == scan_id for item in history.json()))

            history_csv = self.client.get("/api/v1/scanning/history.csv")
            self.assertEqual(history_csv.status_code, 200)
            self.assertIn("scan_id", history_csv.text)

            diff = self.client.get(f"/api/v1/scanning/{scan_id}/diff")
            self.assertEqual(diff.status_code, 200)
            self.assertIn("current_scan_id", diff.json())
            self.assertEqual(diff.json()["current_scan_id"], scan_id)

            diff_csv = self.client.get(f"/api/v1/scanning/{scan_id}/diff.csv")
            self.assertEqual(diff_csv.status_code, 200)

            diff_404 = self.client.get("/api/v1/scanning/nonexistent-scan/diff")
            self.assertEqual(diff_404.status_code, 404)
        finally:
            api_module._run_validation = original_run_validation
            api_module._run_cost_analysis = original_run_cost_analysis

    def test_alert_acknowledgement_and_audit_log_exports(self) -> None:
        register = self.client.post(
            "/auth/register",
            json={
                "email": "alert-ack@example.com",
                "password": "StrongPass1!",
                "full_name": "Alert Ack Owner",
            },
        )
        self.assertEqual(register.status_code, 201)

        self.client.post(
            "/auth/login",
            json={"email": "alert-ack@example.com", "password": "StrongPass1!"},
        )

        ingest = self.client.post(
            "/api/v1/anomalies/external/aws",
            json={
                "events": [
                    {
                        "detail": {
                            "anomalyId": "ack-test-anomaly",
                            "monitorName": "ack-monitor",
                            "impact": {"totalImpact": 200.00},
                        }
                    }
                ]
            },
        )
        self.assertEqual(ingest.status_code, 200)
        alert_id = ingest.json()["alert_ids"][0]

        alerts_before = self.client.get("/api/v1/alerts")
        self.assertEqual(alerts_before.status_code, 200)
        unacked = [a for a in alerts_before.json() if a["id"] == alert_id]
        self.assertEqual(len(unacked), 1)
        self.assertIsNone(unacked[0]["acknowledged_at"])

        ack = self.client.post(f"/api/v1/alerts/{alert_id}/acknowledge")
        self.assertEqual(ack.status_code, 200)
        self.assertEqual(ack.json()["status"], "ok")

        alerts_after = self.client.get("/api/v1/alerts")
        self.assertEqual(alerts_after.status_code, 200)
        acked = next(a for a in alerts_after.json() if a["id"] == alert_id)
        self.assertIsNotNone(acked["acknowledged_at"])

        alerts_csv = self.client.get("/api/v1/alerts.csv")
        self.assertEqual(alerts_csv.status_code, 200)
        self.assertIn("alert_type", alerts_csv.text)

        ack_404 = self.client.post("/api/v1/alerts/999999/acknowledge")
        self.assertEqual(ack_404.status_code, 404)

        audit_logs = self.client.get("/api/v1/audit-logs")
        self.assertEqual(audit_logs.status_code, 200)
        self.assertIsInstance(audit_logs.json(), list)
        self.assertTrue(any(row["action"] == "alert.acknowledge" for row in audit_logs.json()))

        audit_csv = self.client.get("/api/v1/audit-logs.csv")
        self.assertEqual(audit_csv.status_code, 200)
        self.assertIn("action", audit_csv.text)

    def test_public_mode_dashboard_data_endpoints(self) -> None:
        previous_auth = os.environ.get("ENABLE_AUTH")
        os.environ["ENABLE_AUTH"] = "false"

        try:
            ensure_public_workspace()
            with TestClient(app) as public_client:
                health = public_client.get("/api/v1/health")
                self.assertEqual(health.status_code, 200)
                self.assertEqual(health.json()["status"], "healthy")

                costs = public_client.get("/api/v1/costs")
                self.assertEqual(costs.status_code, 200)
                self.assertIn("totalCost", costs.json())

                forecast = public_client.get("/api/v1/forecast")
                self.assertEqual(forecast.status_code, 200)
                self.assertIn("cost_context", forecast.json())
                self.assertIn("forecast_summary", forecast.json())
                self.assertIn("genai_context", forecast.json())
                self.assertIn("provider_concentration_hhi", forecast.json().get("model", {}))

                analytics = public_client.get("/api/v1/analytics")
                self.assertEqual(analytics.status_code, 200)
                self.assertIn("cost_context", analytics.json())
                self.assertIn("spend_at_risk_usd", analytics.json())
                self.assertIn("optimization_capacity_usd", analytics.json())
                self.assertIn("budget_utilization_percent", analytics.json().get("unit_metrics", {}))

                anomalies_resp = public_client.get("/api/v1/anomalies")
                self.assertEqual(anomalies_resp.status_code, 200)

                recommendations_resp = public_client.get("/api/v1/recommendations")
                self.assertEqual(recommendations_resp.status_code, 200)

                rollups = public_client.get("/api/v1/provider-accounts/rollups")
                self.assertEqual(rollups.status_code, 200)
                self.assertIn("items", rollups.json())

                import_summary = public_client.get("/api/v1/imports/costs/summary")
                self.assertEqual(import_summary.status_code, 200)
                self.assertIn("has_data", import_summary.json())
        finally:
            if previous_auth is None:
                os.environ.pop("ENABLE_AUTH", None)
            else:
                os.environ["ENABLE_AUTH"] = previous_auth


if __name__ == "__main__":
    unittest.main()
