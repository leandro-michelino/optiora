"""Regression tests for authentication and tenant-scoped API behavior."""

import asyncio
import os
import tempfile
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch


TEST_DB = os.path.join(tempfile.gettempdir(), "optiora_auth_flow_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["ENABLE_AUTH"] = "true"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient  # noqa: E402

    from finops_mcp.api import _run_cost_analysis  # noqa: E402
    from finops_mcp.app import app  # noqa: E402
    from finops_mcp.credentials import CredentialStatus  # noqa: E402
    from finops_mcp.orm_models import (  # noqa: E402
        AlertEvent,
        AuditLog,
        Base,
        CostSnapshot,
        ProviderAccount,
        ProviderAccountLink,
        ProviderAccountSnapshot,
        ScanRunRecord,
        ScanningPermissionRecord,
        SessionLocal,
        User,
        UserOrganization,
        UserRole,
        engine,
    )
except ImportError as exc:  # pragma: no cover - local dependency guard
    raise unittest.SkipTest(f"Backend dependencies are not installed: {exc}") from exc


class AuthFlowTest(unittest.TestCase):
    @staticmethod
    def _auth_headers(tokens: dict) -> dict:
        return {"Authorization": f"Bearer {tokens['access_token']}"}

    def _register_and_login(self, email: str, password: str, full_name: str) -> dict:
        register = self.client.post(
            "/auth/register",
            json={"email": email, "password": password, "full_name": full_name},
        )
        self.assertEqual(register.status_code, 201)
        login = self.client.post("/auth/login", json={"email": email, "password": password})
        self.assertEqual(login.status_code, 200)
        return login.json()

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

    def test_org_scoped_credentials_rbac_and_audit_log(self) -> None:
        owner_tokens = self._register_and_login(
            "owner2@example.com",
            "StrongPass1!",
            "Owner Two",
        )
        owner_headers = self._auth_headers(owner_tokens)
        org = self.client.get("/auth/organization", headers=owner_headers)
        self.assertEqual(org.status_code, 200)
        organization_id = org.json()["id"]

        readonly_tokens = self._register_and_login(
            "readonly@example.com",
            "StrongPass1!",
            "Readonly User",
        )
        readonly_headers = self._auth_headers(readonly_tokens)

        db = SessionLocal()
        try:
            readonly_user = db.query(User).filter(User.email == "readonly@example.com").first()
            self.assertIsNotNone(readonly_user)
            db.add(
                UserOrganization(
                    user_id=readonly_user.id,
                    organization_id=organization_id,
                    role=UserRole.READONLY,
                )
            )
            db.commit()
        finally:
            db.close()

        validation = CredentialStatus(
            provider="aws",
            is_valid=True,
            message="validated",
            tested_at=datetime.utcnow().isoformat(),
        )
        with patch("finops_mcp.api._run_validation", return_value=validation):
            add_response = self.client.post(
                "/api/v1/credentials/add",
                headers=owner_headers,
                json={
                    "organization_id": organization_id,
                    "provider": "aws",
                    "access_key_id": "AKIA1234567890",
                    "secret_access_key": "super-secret",
                    "region": "us-east-1",
                },
            )
        self.assertEqual(add_response.status_code, 200)
        body = add_response.json()
        self.assertEqual(body["customer_id"], f"org-{organization_id}")
        self.assertEqual(body["organization_id"], organization_id)

        list_response = self.client.get(
            f"/api/v1/credentials?organization_id={organization_id}",
            headers=owner_headers,
        )
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.json()["organization_id"], organization_id)
        self.assertEqual(list_response.json()["credentials"][0]["provider"], "aws")

        audit_response = self.client.get("/api/v1/audit-logs", headers=owner_headers)
        self.assertEqual(audit_response.status_code, 200)
        self.assertTrue(any(item["action"] == "credential.stored" for item in audit_response.json()))

        with patch("finops_mcp.api._run_validation", return_value=validation):
            readonly_attempt = self.client.post(
                "/api/v1/credentials/add",
                headers=readonly_headers,
                json={
                    "organization_id": organization_id,
                    "provider": "aws",
                    "access_key_id": "AKIA9999999999",
                    "secret_access_key": "blocked-secret",
                    "region": "us-east-1",
                },
            )
        self.assertEqual(readonly_attempt.status_code, 403)
        self.assertIn("Credential storage requires", readonly_attempt.json()["detail"])

    def test_credential_delete_updates_list_and_audit(self) -> None:
        tokens = self._register_and_login(
            "owner4@example.com",
            "StrongPass1!",
            "Owner Four",
        )
        headers = self._auth_headers(tokens)
        organization_id = self.client.get("/auth/organization", headers=headers).json()["id"]

        validation = CredentialStatus(
            provider="aws",
            is_valid=True,
            message="validated",
            tested_at=datetime.utcnow().isoformat(),
        )
        with patch("finops_mcp.api._run_validation", return_value=validation):
            add_response = self.client.post(
                "/api/v1/credentials/add",
                headers=headers,
                json={
                    "organization_id": organization_id,
                    "provider": "aws",
                    "access_key_id": "AKIA000000000001",
                    "secret_access_key": "delete-secret",
                    "region": "us-east-1",
                },
            )
        self.assertEqual(add_response.status_code, 200)

        before_delete = self.client.get(
            "/api/v1/credentials",
            headers=headers,
            params={"organization_id": organization_id},
        )
        self.assertEqual(before_delete.status_code, 200)
        self.assertEqual(len(before_delete.json()["credentials"]), 1)

        delete_response = self.client.delete(
            "/api/v1/credentials/aws",
            headers=headers,
            params={"organization_id": organization_id},
        )
        self.assertEqual(delete_response.status_code, 200)
        self.assertEqual(delete_response.json()["provider"], "aws")

        after_delete = self.client.get(
            "/api/v1/credentials",
            headers=headers,
            params={"organization_id": organization_id},
        )
        self.assertEqual(after_delete.status_code, 200)
        self.assertEqual(after_delete.json()["credentials"], [])

        audit_response = self.client.get(
            "/api/v1/audit-logs",
            headers=headers,
            params={"organization_id": organization_id},
        )
        self.assertEqual(audit_response.status_code, 200)
        actions = [item["action"] for item in audit_response.json()]
        self.assertIn("credential.stored", actions)
        self.assertIn("credential.deleted", actions)

    def test_scanning_request_pause_resume_and_start_transitions(self) -> None:
        tokens = self._register_and_login(
            "owner5@example.com",
            "StrongPass1!",
            "Owner Five",
        )
        headers = self._auth_headers(tokens)
        organization_id = self.client.get("/auth/organization", headers=headers).json()["id"]

        permission = self.client.get(
            "/api/v1/scanning/permission",
            headers=headers,
            params={"organization_id": organization_id},
        )
        self.assertEqual(permission.status_code, 200)
        self.assertEqual(permission.json()["state"], "initialized")

        approval_request = self.client.post(
            "/api/v1/scanning/request-approval",
            headers=headers,
            params=[
                ("organization_id", organization_id),
                ("notification_email", "owner5@example.com"),
                ("providers", "gcp"),
                ("providers", "aws"),
            ],
        )
        self.assertEqual(approval_request.status_code, 200)
        self.assertEqual(approval_request.json()["status"], "approval_pending")

        pending_permission = self.client.get(
            "/api/v1/scanning/permission",
            headers=headers,
            params={"organization_id": organization_id},
        )
        self.assertEqual(pending_permission.status_code, 200)
        self.assertEqual(pending_permission.json()["state"], "pending_approval")
        self.assertEqual(sorted(pending_permission.json()["providers"]), ["aws", "gcp"])

        denied_start = self.client.post(
            "/api/v1/scanning/start",
            headers=headers,
            json={"organization_id": organization_id, "providers": ["aws"]},
        )
        self.assertEqual(denied_start.status_code, 403)
        self.assertIn("pending_approval", denied_start.json()["detail"])

        approve_response = self.client.post(
            "/api/v1/scanning/approve",
            headers=headers,
            json={
                "organization_id": organization_id,
                "notification_email": "owner5@example.com",
                "monthly_budget_usd": 1200.0,
            },
        )
        self.assertEqual(approve_response.status_code, 200)
        self.assertEqual(approve_response.json()["state"], "approved")

        pause_response = self.client.post(
            "/api/v1/scanning/pause",
            headers=headers,
            params={"organization_id": organization_id},
        )
        self.assertEqual(pause_response.status_code, 200)
        self.assertEqual(pause_response.json()["state"], "paused")

        paused_start = self.client.post(
            "/api/v1/scanning/start",
            headers=headers,
            json={"organization_id": organization_id, "providers": ["aws"]},
        )
        self.assertEqual(paused_start.status_code, 403)
        self.assertIn("paused", paused_start.json()["detail"])

        resume_response = self.client.post(
            "/api/v1/scanning/resume",
            headers=headers,
            params={"organization_id": organization_id},
        )
        self.assertEqual(resume_response.status_code, 200)
        self.assertEqual(resume_response.json()["state"], "running")

        with patch("finops_mcp.api._run_cost_analysis", new=lambda **kwargs: None):
            start_response = self.client.post(
                "/api/v1/scanning/start",
                headers=headers,
                json={"organization_id": organization_id, "providers": ["aws"]},
            )
        self.assertEqual(start_response.status_code, 200)
        self.assertEqual(start_response.json()["state"], "running")
        self.assertEqual(start_response.json()["providers"], ["aws"])
        self.assertTrue(start_response.json()["scan_id"].startswith("scan_org-"))

        audit_response = self.client.get(
            "/api/v1/audit-logs",
            headers=headers,
            params={"organization_id": organization_id},
        )
        self.assertEqual(audit_response.status_code, 200)
        actions = {item["action"] for item in audit_response.json()}
        self.assertTrue(
            {
                "scan.approval_requested",
                "scan.approved",
                "scan.paused",
                "scan.resumed",
                "scan.started",
            }.issubset(actions)
        )

    def test_account_rollup_endpoint_returns_hierarchy_totals(self) -> None:
        owner_tokens = self._register_and_login(
            "owner9@example.com",
            "StrongPass1!",
            "Owner Nine",
        )
        outsider_tokens = self._register_and_login(
            "owner10@example.com",
            "StrongPass1!",
            "Owner Ten",
        )
        owner_headers = self._auth_headers(owner_tokens)
        outsider_headers = self._auth_headers(outsider_tokens)
        organization_id = self.client.get("/auth/organization", headers=owner_headers).json()["id"]
        customer_id = f"org-{organization_id}"

        db = SessionLocal()
        try:
            db.add(
                ScanRunRecord(
                    scan_id="scan_hierarchy_1",
                    customer_id=customer_id,
                    state="completed",
                    providers_json='["aws","azure"]',
                    progress=100,
                    total_resources=12,
                    anomalies_found=4,
                    savings_identified=34.0,
                    started_at=datetime.utcnow() - timedelta(hours=3),
                    completed_at=datetime.utcnow() - timedelta(hours=2, minutes=45),
                )
            )
            aws_root = ProviderAccount(
                organization_id=organization_id,
                customer_id=customer_id,
                provider="aws",
                account_identifier="org-root",
                account_name="AWS Organization Root",
                account_type="organization",
            )
            aws_prod = ProviderAccount(
                organization_id=organization_id,
                customer_id=customer_id,
                provider="aws",
                account_identifier="111111111111",
                account_name="Production",
                account_type="account",
            )
            aws_dev = ProviderAccount(
                organization_id=organization_id,
                customer_id=customer_id,
                provider="aws",
                account_identifier="222222222222",
                account_name="Development",
                account_type="account",
            )
            azure_sub = ProviderAccount(
                organization_id=organization_id,
                customer_id=customer_id,
                provider="azure",
                account_identifier="sub-001",
                account_name="Shared Services",
                account_type="subscription",
            )
            db.add_all([aws_root, aws_prod, aws_dev, azure_sub])
            db.flush()

            db.add_all(
                [
                    ProviderAccountLink(
                        organization_id=organization_id,
                        parent_account_id=aws_root.id,
                        child_account_id=aws_prod.id,
                    ),
                    ProviderAccountLink(
                        organization_id=organization_id,
                        parent_account_id=aws_root.id,
                        child_account_id=aws_dev.id,
                    ),
                ]
            )
            db.add_all(
                [
                    ProviderAccountSnapshot(
                        organization_id=organization_id,
                        customer_id=customer_id,
                        scan_id="scan_hierarchy_1",
                        provider_account_id=aws_root.id,
                        direct_cost_usd=15.0,
                        savings_identified_usd=1.0,
                        anomalies_count=0,
                        service_count=2,
                        captured_at=datetime.utcnow() - timedelta(hours=2),
                    ),
                    ProviderAccountSnapshot(
                        organization_id=organization_id,
                        customer_id=customer_id,
                        scan_id="scan_hierarchy_1",
                        provider_account_id=aws_prod.id,
                        direct_cost_usd=120.0,
                        savings_identified_usd=20.0,
                        anomalies_count=1,
                        service_count=6,
                        captured_at=datetime.utcnow() - timedelta(hours=2),
                    ),
                    ProviderAccountSnapshot(
                        organization_id=organization_id,
                        customer_id=customer_id,
                        scan_id="scan_hierarchy_1",
                        provider_account_id=aws_dev.id,
                        direct_cost_usd=80.0,
                        savings_identified_usd=10.0,
                        anomalies_count=2,
                        service_count=4,
                        captured_at=datetime.utcnow() - timedelta(hours=2),
                    ),
                    ProviderAccountSnapshot(
                        organization_id=organization_id,
                        customer_id=customer_id,
                        scan_id="scan_hierarchy_1",
                        provider_account_id=azure_sub.id,
                        direct_cost_usd=40.0,
                        savings_identified_usd=3.0,
                        anomalies_count=1,
                        service_count=3,
                        captured_at=datetime.utcnow() - timedelta(hours=2),
                    ),
                ]
            )
            db.commit()
        finally:
            db.close()

        response = self.client.get(
            "/api/v1/hierarchy/accounts",
            headers=owner_headers,
            params={"organization_id": organization_id},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["customer_id"], customer_id)
        self.assertEqual(payload["total_direct_cost_usd"], 255.0)
        self.assertEqual(payload["total_rolled_up_cost_usd"], 255.0)
        self.assertEqual(len(payload["items"]), 4)

        aws_root_item = next(
            item for item in payload["items"] if item["account_identifier"] == "org-root"
        )
        self.assertEqual(aws_root_item["direct_cost_usd"], 15.0)
        self.assertEqual(aws_root_item["rolled_up_cost_usd"], 215.0)
        self.assertEqual(aws_root_item["rolled_up_anomalies_count"], 3)
        self.assertEqual(aws_root_item["child_count"], 2)

        aws_only = self.client.get(
            "/api/v1/hierarchy/accounts",
            headers=owner_headers,
            params={"organization_id": organization_id, "provider": "aws"},
        )
        self.assertEqual(aws_only.status_code, 200)
        self.assertEqual(aws_only.json()["total_rolled_up_cost_usd"], 215.0)
        self.assertEqual(len(aws_only.json()["items"]), 3)

        blocked = self.client.get(
            "/api/v1/hierarchy/accounts",
            headers=outsider_headers,
            params={"customer_id": customer_id},
        )
        self.assertEqual(blocked.status_code, 403)

    def test_background_scan_creates_provider_rollup_snapshots(self) -> None:
        tokens = self._register_and_login(
            "owner11@example.com",
            "StrongPass1!",
            "Owner Eleven",
        )
        organization_id = self.client.get(
            "/auth/organization",
            headers=self._auth_headers(tokens),
        ).json()["id"]
        customer_id = f"org-{organization_id}"

        db = SessionLocal()
        try:
            db.add(
                ScanRunRecord(
                    scan_id="scan_rollup_population",
                    customer_id=customer_id,
                    state="running",
                    providers_json='["aws"]',
                    progress=0,
                    started_at=datetime.utcnow() - timedelta(minutes=5),
                )
            )
            db.commit()
        finally:
            db.close()

        async def fake_summary(provider: str, period: str = "month") -> dict:
            self.assertEqual(provider, "aws")
            self.assertEqual(period, "month")
            return {
                "total_cost_usd": 150.0,
                "top_services": [
                    {"service": "EC2", "cost_usd": 100.0},
                    {"service": "S3", "cost_usd": 50.0},
                ],
            }

        async def fake_anomalies(_params: dict) -> str:
            return '{"anomalies_found": 2, "anomalies": []}'

        async def fake_recommendations(_params: dict) -> str:
            return '{"recommendations": [], "total_potential_savings_annual_usd": 144.0}'

        with patch("finops_mcp.api._cost_summary_for_provider", side_effect=fake_summary), patch(
            "finops_mcp.api.anomalies.detect_anomalies",
            side_effect=fake_anomalies,
        ), patch(
            "finops_mcp.api.recommendations.get_recommendations",
            side_effect=fake_recommendations,
        ):
            asyncio.run(
                _run_cost_analysis(
                    scan_id="scan_rollup_population",
                    organization_id=organization_id,
                    customer_id=customer_id,
                    providers=["aws"],
                )
            )

        db = SessionLocal()
        try:
            account = (
                db.query(ProviderAccount)
                .filter(
                    ProviderAccount.organization_id == organization_id,
                    ProviderAccount.customer_id == customer_id,
                    ProviderAccount.provider == "aws",
                    ProviderAccount.account_identifier == "aws-aggregate",
                )
                .first()
            )
            self.assertIsNotNone(account)
            self.assertEqual(account.account_type, "provider_rollup")

            snapshot = (
                db.query(ProviderAccountSnapshot)
                .filter(
                    ProviderAccountSnapshot.scan_id == "scan_rollup_population",
                    ProviderAccountSnapshot.provider_account_id == account.id,
                )
                .first()
            )
            self.assertIsNotNone(snapshot)
            self.assertEqual(snapshot.direct_cost_usd, 150.0)
            self.assertEqual(snapshot.savings_identified_usd, 12.0)
            self.assertEqual(snapshot.anomalies_count, 2)
            self.assertEqual(snapshot.service_count, 2)
        finally:
            db.close()

    def test_scan_history_diff_alerts_and_exports(self) -> None:
        tokens = self._register_and_login(
            "owner3@example.com",
            "StrongPass1!",
            "Owner Three",
        )
        headers = self._auth_headers(tokens)
        org = self.client.get("/auth/organization", headers=headers).json()
        organization_id = org["id"]
        customer_id = f"org-{organization_id}"

        db = SessionLocal()
        try:
            permission = ScanningPermissionRecord(
                customer_id=customer_id,
                state="approved",
                providers_json='["aws","gcp"]',
                scan_frequency="daily",
                auto_remediate=False,
                notification_email="owner3@example.com",
                monthly_budget_usd=1000.0,
                warning_threshold_percent=80.0,
                critical_threshold_percent=100.0,
                notifications_enabled=True,
            )
            previous_run = ScanRunRecord(
                scan_id="scan_previous",
                customer_id=customer_id,
                state="completed",
                providers_json='["aws","gcp"]',
                progress=100,
                total_resources=100,
                anomalies_found=1,
                savings_identified=80.0,
                started_at=datetime.utcnow() - timedelta(days=2),
                completed_at=datetime.utcnow() - timedelta(days=2, minutes=-5),
            )
            current_run = ScanRunRecord(
                scan_id="scan_current",
                customer_id=customer_id,
                state="completed",
                providers_json='["aws","gcp"]',
                progress=100,
                total_resources=120,
                anomalies_found=2,
                savings_identified=120.0,
                started_at=datetime.utcnow() - timedelta(days=1),
                completed_at=datetime.utcnow() - timedelta(days=1, minutes=-5),
            )
            db.add(permission)
            db.add(previous_run)
            db.add(current_run)
            db.add_all(
                [
                    CostSnapshot(
                        scan_id="scan_previous",
                        customer_id=customer_id,
                        provider="aws",
                        total_cost_usd=400.0,
                        savings_identified_usd=30.0,
                        anomalies_count=1,
                        captured_at=datetime.utcnow() - timedelta(days=2),
                    ),
                    CostSnapshot(
                        scan_id="scan_previous",
                        customer_id=customer_id,
                        provider="gcp",
                        total_cost_usd=200.0,
                        savings_identified_usd=20.0,
                        anomalies_count=0,
                        captured_at=datetime.utcnow() - timedelta(days=2),
                    ),
                    CostSnapshot(
                        scan_id="scan_current",
                        customer_id=customer_id,
                        provider="aws",
                        total_cost_usd=550.0,
                        savings_identified_usd=40.0,
                        anomalies_count=2,
                        captured_at=datetime.utcnow() - timedelta(days=1),
                    ),
                    CostSnapshot(
                        scan_id="scan_current",
                        customer_id=customer_id,
                        provider="gcp",
                        total_cost_usd=250.0,
                        savings_identified_usd=30.0,
                        anomalies_count=0,
                        captured_at=datetime.utcnow() - timedelta(days=1),
                    ),
                ]
            )
            db.add(
                AlertEvent(
                    organization_id=organization_id,
                    customer_id=customer_id,
                    scan_id="scan_current",
                    alert_type="budget_threshold",
                    severity="warning",
                    title="Budget threshold reached",
                    message="Spend exceeded warning threshold",
                    delivered_channels_json='["email"]',
                )
            )
            db.add(
                AuditLog(
                    organization_id=organization_id,
                    actor_user_id=1,
                    action="scan.completed",
                    entity_type="scan_run",
                    entity_id="scan_current",
                    metadata_json='{"providers":["aws","gcp"]}',
                )
            )
            db.commit()
        finally:
            db.close()

        history = self.client.get("/api/v1/scanning/history", headers=headers)
        self.assertEqual(history.status_code, 200)
        self.assertGreaterEqual(len(history.json()), 2)

        diff = self.client.get("/api/v1/scanning/scan_current/diff", headers=headers)
        self.assertEqual(diff.status_code, 200)
        diff_body = diff.json()
        self.assertEqual(diff_body["previous_scan_id"], "scan_previous")
        self.assertEqual(diff_body["total_delta_cost_usd"], 200.0)

        alerts = self.client.get("/api/v1/alerts", headers=headers)
        self.assertEqual(alerts.status_code, 200)
        self.assertEqual(alerts.json()[0]["alert_type"], "budget_threshold")
        alert_id = alerts.json()[0]["id"]

        acknowledge = self.client.post(f"/api/v1/alerts/{alert_id}/acknowledge", headers=headers)
        self.assertEqual(acknowledge.status_code, 200)
        self.assertIsNotNone(acknowledge.json()["acknowledged_at"])

        export_history = self.client.get("/api/v1/exports/scan-history.csv", headers=headers)
        self.assertEqual(export_history.status_code, 200)
        self.assertIn("scan_id,state,providers", export_history.text)

        export_diff = self.client.get("/api/v1/exports/scans/scan_current/diff.csv", headers=headers)
        self.assertEqual(export_diff.status_code, 200)
        self.assertIn("provider,current_cost_usd,previous_cost_usd", export_diff.text)

    def test_scan_progress_and_snapshots_require_org_scope(self) -> None:
        owner_a_tokens = self._register_and_login(
            "owner6@example.com",
            "StrongPass1!",
            "Owner Six",
        )
        owner_b_tokens = self._register_and_login(
            "owner7@example.com",
            "StrongPass1!",
            "Owner Seven",
        )
        owner_a_headers = self._auth_headers(owner_a_tokens)
        owner_b_headers = self._auth_headers(owner_b_tokens)
        organization_id = self.client.get("/auth/organization", headers=owner_a_headers).json()["id"]
        customer_id = f"org-{organization_id}"

        db = SessionLocal()
        try:
            db.add(
                ScanRunRecord(
                    scan_id="scan_scope_guard",
                    customer_id=customer_id,
                    state="completed",
                    providers_json='["aws"]',
                    progress=100,
                    total_resources=42,
                    anomalies_found=1,
                    savings_identified=55.0,
                    started_at=datetime.utcnow() - timedelta(hours=2),
                    completed_at=datetime.utcnow() - timedelta(hours=1, minutes=50),
                )
            )
            db.add(
                CostSnapshot(
                    scan_id="scan_scope_guard",
                    customer_id=customer_id,
                    provider="aws",
                    total_cost_usd=123.45,
                    savings_identified_usd=12.0,
                    anomalies_count=1,
                    captured_at=datetime.utcnow() - timedelta(hours=2),
                )
            )
            db.commit()
        finally:
            db.close()

        visible_progress = self.client.get(
            "/api/v1/scanning/scan_scope_guard/progress",
            headers=owner_a_headers,
        )
        self.assertEqual(visible_progress.status_code, 200)
        self.assertEqual(visible_progress.json()["customer_id"], customer_id)

        visible_snapshots = self.client.get(
            "/api/v1/scanning/scan_scope_guard/snapshots",
            headers=owner_a_headers,
        )
        self.assertEqual(visible_snapshots.status_code, 200)
        self.assertEqual(len(visible_snapshots.json()), 1)

        hidden_progress = self.client.get(
            "/api/v1/scanning/scan_scope_guard/progress",
            headers=owner_b_headers,
        )
        self.assertEqual(hidden_progress.status_code, 404)

        hidden_snapshots = self.client.get(
            "/api/v1/scanning/scan_scope_guard/snapshots",
            headers=owner_b_headers,
        )
        self.assertEqual(hidden_snapshots.status_code, 404)

    def test_audit_and_alert_exports_return_csv(self) -> None:
        tokens = self._register_and_login(
            "owner8@example.com",
            "StrongPass1!",
            "Owner Eight",
        )
        headers = self._auth_headers(tokens)
        organization_id = self.client.get("/auth/organization", headers=headers).json()["id"]
        customer_id = f"org-{organization_id}"

        db = SessionLocal()
        try:
            owner_user = db.query(User).filter(User.email == "owner8@example.com").first()
            self.assertIsNotNone(owner_user)
            db.add(
                AuditLog(
                    organization_id=organization_id,
                    actor_user_id=owner_user.id,
                    action="scan.completed",
                    entity_type="scan_run",
                    entity_id="scan_export_case",
                    metadata_json='{"provider":"aws"}',
                )
            )
            db.add(
                AlertEvent(
                    organization_id=organization_id,
                    customer_id=customer_id,
                    scan_id="scan_export_case",
                    alert_type="budget_threshold",
                    severity="critical",
                    title="Critical budget threshold reached",
                    message="Monthly budget has been exceeded",
                    delivered_channels_json='["email","slack"]',
                )
            )
            db.commit()
        finally:
            db.close()

        audit_export = self.client.get(
            "/api/v1/exports/audit-logs.csv",
            headers=headers,
            params={"organization_id": organization_id},
        )
        self.assertEqual(audit_export.status_code, 200)
        self.assertIn("text/csv", audit_export.headers["content-type"])
        self.assertIn("attachment; filename=", audit_export.headers["content-disposition"])
        self.assertIn("created_at,action,entity_type,entity_id,actor_user_id,metadata_json", audit_export.text)
        self.assertIn("scan.completed", audit_export.text)

        alerts_export = self.client.get(
            "/api/v1/exports/alerts.csv",
            headers=headers,
            params={"organization_id": organization_id},
        )
        self.assertEqual(alerts_export.status_code, 200)
        self.assertIn("text/csv", alerts_export.headers["content-type"])
        self.assertIn("created_at,severity,alert_type,title,message,delivered_channels,acknowledged_at", alerts_export.text)
        self.assertIn("Critical budget threshold reached", alerts_export.text)
        self.assertIn("budget_threshold", alerts_export.text)


if __name__ == "__main__":
    unittest.main()
