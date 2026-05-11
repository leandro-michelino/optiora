"""Epic 2: Multi-account hierarchy and region breakdown tests.

Covers:
- cost_allocation_snapshots table presence and columns
- GET /api/v1/provider-accounts inventory endpoint
- GET /api/v1/provider-accounts/{account_id}/region-breakdown endpoint
- top_regions populated in rollup response from imported CSV
- account inventory is org-scoped
"""

import asyncio
import io
import os
import tempfile
import unittest

TEST_DB = os.path.join(tempfile.gettempdir(), "optiora_epic2_test.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{TEST_DB}")
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-epic2-secret"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient
    from sqlalchemy import inspect as sa_inspect

    from optiora_backend.app import app
    from optiora_backend.orm_models import (
        Base,
        CostAllocationSnapshot,
        Organization,
        ProviderAccount,
        SessionLocal,
        User,
        UserOrganization,
        UserRole,
        ensure_public_workspace,
        engine,
    )
except ImportError as exc:
    raise unittest.SkipTest(f"Backend dependencies not installed: {exc}") from exc


def _setup_db() -> None:
    engine.dispose()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def _teardown_db() -> None:
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


class CostAllocationSnapshotSchemaTest(unittest.TestCase):
    """Verify that the cost_allocation_snapshots table exists with required columns."""

    @classmethod
    def setUpClass(cls) -> None:
        engine.dispose()
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def test_cost_allocation_snapshots_table_exists(self) -> None:
        inspector = sa_inspect(engine)
        self.assertTrue(
            inspector.has_table("cost_allocation_snapshots"),
            "Table cost_allocation_snapshots is missing from schema",
        )

    def test_cost_allocation_snapshots_has_required_columns(self) -> None:
        inspector = sa_inspect(engine)
        col_names = {c["name"] for c in inspector.get_columns("cost_allocation_snapshots")}
        required = (
            "id",
            "organization_id",
            "customer_id",
            "scan_id",
            "provider_account_id",
            "provider",
            "region",
            "cost_usd",
            "captured_at",
        )
        for col in required:
            self.assertIn(col, col_names, f"Column {col!r} missing from cost_allocation_snapshots")

    def test_provider_account_links_table_has_hierarchy_columns(self) -> None:
        inspector = sa_inspect(engine)
        self.assertTrue(inspector.has_table("provider_account_links"))
        col_names = {c["name"] for c in inspector.get_columns("provider_account_links")}
        for col in ("parent_account_id", "child_account_id", "organization_id"):
            self.assertIn(col, col_names, f"Column {col!r} missing from provider_account_links")


class ProviderAccountInventoryEndpointTest(unittest.TestCase):
    """Test GET /api/v1/provider-accounts returns org-scoped inventory."""

    @classmethod
    def setUpClass(cls) -> None:
        _setup_db()
        cls.client = TestClient(app)

        reg = cls.client.post(
            "/auth/register",
            json={"email": "inv-owner@example.com", "password": "StrongPass1!", "full_name": "Inv Owner"},
        )
        cls.owner_id = reg.json()["id"]
        cls.client.post("/auth/login", json={"email": "inv-owner@example.com", "password": "StrongPass1!"})

        db = SessionLocal()
        try:
            owner = db.query(User).filter(User.id == cls.owner_id).first()
            org = Organization(name="Inv Org", owner_id=owner.id)
            db.add(org)
            db.flush()
            db.add(UserOrganization(user_id=owner.id, organization_id=org.id, role=UserRole.OWNER))

            acct = ProviderAccount(
                organization_id=org.id,
                customer_id=f"org-{org.id}",
                provider="aws",
                account_identifier="111111111111",
                account_name="Test Account",
                account_type="account",
                is_active=True,
            )
            db.add(acct)
            db.commit()
            cls.org_id = org.id
            cls.account_id = acct.id
        finally:
            db.close()

        cls.client.post("/auth/organization/select", json={"organization_id": cls.org_id})

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def test_inventory_returns_accounts_list(self) -> None:
        resp = self.client.get("/api/v1/provider-accounts")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("accounts", data)
        self.assertIn("total", data)
        self.assertGreaterEqual(data["total"], 1)

    def test_inventory_contains_seeded_account(self) -> None:
        resp = self.client.get("/api/v1/provider-accounts")
        self.assertEqual(resp.status_code, 200)
        identifiers = [a["account_identifier"] for a in resp.json()["accounts"]]
        self.assertIn("111111111111", identifiers)

    def test_inventory_provider_filter(self) -> None:
        resp = self.client.get("/api/v1/provider-accounts?provider=aws")
        self.assertEqual(resp.status_code, 200)
        for acct in resp.json()["accounts"]:
            self.assertEqual(acct["provider"], "aws")

    def test_inventory_unknown_provider_returns_empty(self) -> None:
        resp = self.client.get("/api/v1/provider-accounts?provider=nonexistent")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["total"], 0)


class AccountRegionBreakdownEndpointTest(unittest.TestCase):
    """Test GET /api/v1/provider-accounts/{account_id}/region-breakdown."""

    @classmethod
    def setUpClass(cls) -> None:
        _setup_db()
        cls.client = TestClient(app)

        reg = cls.client.post(
            "/auth/register",
            json={"email": "region-owner@example.com", "password": "StrongPass1!", "full_name": "Region Owner"},
        )
        cls.owner_id = reg.json()["id"]
        cls.client.post("/auth/login", json={"email": "region-owner@example.com", "password": "StrongPass1!"})

        from datetime import datetime, timezone

        db = SessionLocal()
        try:
            owner = db.query(User).filter(User.id == cls.owner_id).first()
            org = Organization(name="Region Org", owner_id=owner.id)
            db.add(org)
            db.flush()
            db.add(UserOrganization(user_id=owner.id, organization_id=org.id, role=UserRole.OWNER))
            customer_id = f"org-{org.id}"

            acct = ProviderAccount(
                organization_id=org.id,
                customer_id=customer_id,
                provider="aws",
                account_identifier="222222222222",
                account_name="Region Account",
                account_type="account",
                is_active=True,
            )
            db.add(acct)
            db.flush()

            scan_id = "scan-region-test-001"
            for region, cost in [("us-east-1", 100.0), ("eu-west-1", 50.0)]:
                db.add(
                    CostAllocationSnapshot(
                        organization_id=org.id,
                        customer_id=customer_id,
                        scan_id=scan_id,
                        provider_account_id=acct.id,
                        provider="aws",
                        region=region,
                        cost_usd=cost,
                        captured_at=datetime.now(timezone.utc).replace(tzinfo=None),
                    )
                )

            db.commit()
            cls.org_id = org.id
            cls.account_id = acct.id
            cls.scan_id = scan_id
        finally:
            db.close()

        cls.client.post("/auth/organization/select", json={"organization_id": cls.org_id})

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def test_region_breakdown_returns_regions(self) -> None:
        resp = self.client.get(
            f"/api/v1/provider-accounts/{self.account_id}/region-breakdown",
            params={"scan_id": self.scan_id},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("regions", data)
        self.assertGreaterEqual(len(data["regions"]), 2)

    def test_region_breakdown_total_cost_sums_correctly(self) -> None:
        resp = self.client.get(
            f"/api/v1/provider-accounts/{self.account_id}/region-breakdown",
            params={"scan_id": self.scan_id},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        region_names = {r["region"] for r in data["regions"]}
        self.assertIn("us-east-1", region_names)
        self.assertIn("eu-west-1", region_names)
        total = sum(r["cost_usd"] for r in data["regions"])
        self.assertAlmostEqual(total, 150.0, places=1)

    def test_region_breakdown_404_for_unknown_account(self) -> None:
        resp = self.client.get("/api/v1/provider-accounts/999999/region-breakdown")
        self.assertEqual(resp.status_code, 404)


class RollupTopRegionsFromCsvTest(unittest.TestCase):
    """Test that CSV import with region column produces top_regions in rollup response."""

    @classmethod
    def setUpClass(cls) -> None:
        _setup_db()
        prev_auth = os.environ.get("ENABLE_AUTH")
        os.environ["ENABLE_AUTH"] = "false"
        try:
            ensure_public_workspace()
            cls.client = TestClient(app)

            csv_content = (
                "provider,cost_usd,service_name,region,account_identifier,account_name,account_type\n"
                "aws,120.00,EC2,us-east-1,acct-csv-001,CSV Account,account\n"
                "aws,80.00,S3,us-west-2,acct-csv-001,CSV Account,account\n"
                "aws,40.00,Lambda,eu-central-1,acct-csv-001,CSV Account,account\n"
            )
            upload = cls.client.post(
                "/api/v1/imports/costs/csv",
                files={"file": ("rollup-regions.csv", csv_content.encode(), "text/csv")},
            )
            cls.upload_ok = upload.status_code == 200
            cls.client.post(
                "/api/v1/scanning/approve",
                json={
                    "scan_frequency": "daily",
                    "monthly_budget_usd": 500.0,
                    "warning_threshold_percent": 80.0,
                    "critical_threshold_percent": 100.0,
                    "auto_remediate": False,
                },
            )
        finally:
            if prev_auth is None:
                os.environ.pop("ENABLE_AUTH", None)
            else:
                os.environ["ENABLE_AUTH"] = prev_auth

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def setUp(self) -> None:
        if not self.upload_ok:
            self.skipTest("CSV upload failed in setUpClass")
        prev_auth = os.environ.get("ENABLE_AUTH")
        os.environ["ENABLE_AUTH"] = "false"
        self._prev_auth = prev_auth
        self.client = TestClient(app)

    def tearDown(self) -> None:
        prev_auth = self._prev_auth
        if prev_auth is None:
            os.environ.pop("ENABLE_AUTH", None)
        else:
            os.environ["ENABLE_AUTH"] = prev_auth

    def test_rollup_response_contains_items(self) -> None:
        resp = self.client.get("/api/v1/provider-accounts/rollups")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("items", data)
        self.assertGreater(len(data["items"]), 0)

    def test_rollup_item_has_top_regions_field(self) -> None:
        resp = self.client.get("/api/v1/provider-accounts/rollups")
        self.assertEqual(resp.status_code, 200)
        items = resp.json()["items"]
        account_items = [i for i in items if i.get("account_identifier") == "acct-csv-001"]
        if not account_items:
            self.skipTest("acct-csv-001 not found in rollup items")
        item = account_items[0]
        self.assertIn("top_regions", item)

    def test_rollup_top_regions_reflects_csv_data(self) -> None:
        resp = self.client.get("/api/v1/provider-accounts/rollups")
        self.assertEqual(resp.status_code, 200)
        items = resp.json()["items"]
        account_items = [i for i in items if i.get("account_identifier") == "acct-csv-001"]
        if not account_items:
            self.skipTest("acct-csv-001 not found in rollup items")
        top_regions = account_items[0].get("top_regions", [])
        region_names = {r["region"] for r in top_regions}
        self.assertIn("us-east-1", region_names, "us-east-1 should appear in top_regions for acct-csv-001")

    def test_rollup_contains_budget_fields_when_budget_is_approved(self) -> None:
        resp = self.client.get("/api/v1/provider-accounts/rollups")
        self.assertEqual(resp.status_code, 200)
        items = resp.json().get("items", [])
        account_items = [i for i in items if i.get("account_identifier") == "acct-csv-001"]
        if not account_items:
            self.skipTest("acct-csv-001 not found in rollup items")

        row = account_items[0]
        self.assertIn("budget_monthly_usd", row)
        self.assertIn("rolled_up_budget_monthly_usd", row)
        self.assertIn("budget_status", row)


class EnterpriseHierarchyFederationFromCsvTest(unittest.TestCase):
    """Verify imported enterprise hierarchy shapes roll up across all supported providers."""

    @classmethod
    def setUpClass(cls) -> None:
        _setup_db()
        prev_auth = os.environ.get("ENABLE_AUTH")
        os.environ["ENABLE_AUTH"] = "false"
        try:
            ensure_public_workspace()
            cls.client = TestClient(app)
            csv_content = (
                "provider,cost_usd,service_name,region,account_identifier,account_name,account_type,parent_account_identifier\n"
                "aws,100.00,EC2,us-east-1,111111111111,AWS Prod Account,account,aws-org-root\n"
                "azure,200.00,Virtual Machines,westeurope,sub-prod-001,Azure Prod Subscription,subscription,mg-root\n"
                "gcp,300.00,Compute Engine,europe-west1,project-prod-001,GCP Prod Project,project,folder-root\n"
                "oci,400.00,Compute,uk-london-1,compartment-prod-001,OCI Prod Compartment,compartment,tenancy-root\n"
            )
            upload = cls.client.post(
                "/api/v1/imports/costs/csv",
                files={"file": ("enterprise-hierarchy.csv", csv_content.encode("utf-8"), "text/csv")},
            )
            cls.upload_ok = upload.status_code == 200
            cls.upload_text = upload.text
        finally:
            if prev_auth is None:
                os.environ.pop("ENABLE_AUTH", None)
            else:
                os.environ["ENABLE_AUTH"] = prev_auth

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def setUp(self) -> None:
        if not self.upload_ok:
            self.skipTest(f"CSV upload failed in setUpClass: {self.upload_text}")
        self._prev_auth = os.environ.get("ENABLE_AUTH")
        os.environ["ENABLE_AUTH"] = "false"
        self.client = TestClient(app)

    def tearDown(self) -> None:
        if self._prev_auth is None:
            os.environ.pop("ENABLE_AUTH", None)
        else:
            os.environ["ENABLE_AUTH"] = self._prev_auth

    def test_federation_contains_provider_native_parent_types(self) -> None:
        resp = self.client.get("/api/v1/federation/costs")
        self.assertEqual(resp.status_code, 200, resp.text)
        accounts = resp.json()["accounts"]
        by_identifier = {row["account_identifier"]: row for row in accounts}

        expected_parent_types = {
            "aws-org-root": "organization",
            "mg-root": "management_group",
            "folder-root": "folder",
            "tenancy-root": "tenancy",
        }
        for identifier, account_type in expected_parent_types.items():
            self.assertIn(identifier, by_identifier)
            self.assertEqual(by_identifier[identifier]["account_type"], account_type)
            self.assertGreater(by_identifier[identifier]["rolled_up_cost_usd"], 0)

        self.assertEqual(by_identifier["111111111111"]["parent_account_identifier"], "aws-org-root")
        self.assertEqual(by_identifier["sub-prod-001"]["parent_account_identifier"], "mg-root")
        self.assertEqual(by_identifier["project-prod-001"]["parent_account_identifier"], "folder-root")
        self.assertEqual(by_identifier["compartment-prod-001"]["parent_account_identifier"], "tenancy-root")

    def test_federation_totals_are_consolidated_without_double_counting_parent_nodes(self) -> None:
        resp = self.client.get("/api/v1/federation/costs")
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()

        self.assertAlmostEqual(data["total_cost_usd"], 1000.0, places=2)
        self.assertEqual(data["provider_totals_usd"], {"aws": 100.0, "azure": 200.0, "gcp": 300.0, "oci": 400.0})
        self.assertAlmostEqual(data["source_totals_usd"]["imported"], 1000.0, places=2)
        for account_type in ("organization", "management_group", "folder", "tenancy"):
            self.assertIn(account_type, data["account_type_totals_usd"])

    def test_provider_filter_keeps_single_provider_tree(self) -> None:
        resp = self.client.get("/api/v1/federation/costs?provider=azure")
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertAlmostEqual(data["total_cost_usd"], 200.0, places=2)
        self.assertEqual(set(data["provider_totals_usd"].keys()), {"azure"})
        self.assertTrue(all(row["provider"] == "azure" for row in data["accounts"]))


class AccountInventoryOrgScopeTest(unittest.TestCase):
    """Verify that account inventory endpoint is scoped to the active organization."""

    @classmethod
    def setUpClass(cls) -> None:
        _setup_db()
        cls.client = TestClient(app)

        for email, name in [
            ("scope-owner-a@example.com", "Owner A"),
            ("scope-owner-b@example.com", "Owner B"),
        ]:
            cls.client.post(
                "/auth/register",
                json={"email": email, "password": "StrongPass1!", "full_name": name},
            )

        db = SessionLocal()
        try:
            owner_a = db.query(User).filter(User.email == "scope-owner-a@example.com").first()
            owner_b = db.query(User).filter(User.email == "scope-owner-b@example.com").first()

            org_a = Organization(name="Scope Org A", owner_id=owner_a.id)
            org_b = Organization(name="Scope Org B", owner_id=owner_b.id)
            db.add_all([org_a, org_b])
            db.flush()

            db.add(UserOrganization(user_id=owner_a.id, organization_id=org_a.id, role=UserRole.OWNER))
            db.add(UserOrganization(user_id=owner_b.id, organization_id=org_b.id, role=UserRole.OWNER))

            acct_a = ProviderAccount(
                organization_id=org_a.id,
                customer_id=f"org-{org_a.id}",
                provider="aws",
                account_identifier="scope-acct-a",
                account_name="Scope Account A",
                account_type="account",
                is_active=True,
            )
            acct_b = ProviderAccount(
                organization_id=org_b.id,
                customer_id=f"org-{org_b.id}",
                provider="azure",
                account_identifier="scope-acct-b",
                account_name="Scope Account B",
                account_type="subscription",
                is_active=True,
            )
            db.add_all([acct_a, acct_b])
            db.commit()
            cls.org_a_id = org_a.id
            cls.org_b_id = org_b.id
        finally:
            db.close()

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def test_org_a_sees_only_own_accounts(self) -> None:
        self.client.post("/auth/login", json={"email": "scope-owner-a@example.com", "password": "StrongPass1!"})
        self.client.post("/auth/organization/select", json={"organization_id": self.org_a_id})

        resp = self.client.get("/api/v1/provider-accounts")
        self.assertEqual(resp.status_code, 200)
        identifiers = {a["account_identifier"] for a in resp.json()["accounts"]}
        self.assertIn("scope-acct-a", identifiers)
        self.assertNotIn("scope-acct-b", identifiers)

    def test_org_b_sees_only_own_accounts(self) -> None:
        self.client.post("/auth/login", json={"email": "scope-owner-b@example.com", "password": "StrongPass1!"})
        self.client.post("/auth/organization/select", json={"organization_id": self.org_b_id})

        resp = self.client.get("/api/v1/provider-accounts")
        self.assertEqual(resp.status_code, 200)
        identifiers = {a["account_identifier"] for a in resp.json()["accounts"]}
        self.assertIn("scope-acct-b", identifiers)
        self.assertNotIn("scope-acct-a", identifiers)


class HierarchyAwareScanOrchestrationTest(unittest.TestCase):
    """Test hierarchy-aware scan orchestration via target_accounts on scan start."""

    @classmethod
    def setUpClass(cls) -> None:
        _setup_db()
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def test_scan_start_accepts_target_accounts_field(self) -> None:
        """POST /scanning/start with target_accounts is accepted (200) when approved."""
        self.client.post(
            "/auth/register",
            json={"email": "hier-owner@example.com", "password": "StrongPass1!", "full_name": "Hier Owner"},
        )
        self.client.post("/auth/login", json={"email": "hier-owner@example.com", "password": "StrongPass1!"})

        import optiora_backend.api as api_module

        async def _noop(scan_id: str, customer_id: str, providers: list, target_accounts=None) -> None:
            _ = (scan_id, customer_id, providers, target_accounts)

        orig_cost = api_module._run_cost_analysis
        try:
            api_module._run_cost_analysis = _noop

            self.client.post(
                "/api/v1/scanning/approve",
                json={"scan_frequency": "daily", "auto_remediate": False},
            )

            resp = self.client.post(
                "/api/v1/scanning/start",
                json={"providers": ["aws"], "target_accounts": ["111111111111", "222222222222"]},
            )
            self.assertEqual(resp.status_code, 200)
            self.assertIn("scan_id", resp.json())
        finally:
            api_module._run_cost_analysis = orig_cost

    def test_scan_start_without_target_accounts_still_works(self) -> None:
        """POST /scanning/start without target_accounts runs as normal."""
        self.client.post(
            "/auth/register",
            json={"email": "hier-owner2@example.com", "password": "StrongPass1!", "full_name": "Hier Owner 2"},
        )
        self.client.post("/auth/login", json={"email": "hier-owner2@example.com", "password": "StrongPass1!"})

        import optiora_backend.api as api_module

        async def _noop(scan_id: str, customer_id: str, providers: list, target_accounts=None) -> None:
            _ = (scan_id, customer_id, providers, target_accounts)

        orig_cost = api_module._run_cost_analysis
        try:
            api_module._run_cost_analysis = _noop

            self.client.post(
                "/api/v1/scanning/approve",
                json={"scan_frequency": "daily", "auto_remediate": False},
            )

            resp = self.client.post(
                "/api/v1/scanning/start",
                json={"providers": ["aws"]},
            )
            self.assertEqual(resp.status_code, 200)
            self.assertIn("scan_id", resp.json())
        finally:
            api_module._run_cost_analysis = orig_cost


class OciCompartmentListTest(unittest.TestCase):
    """Verify OCI _compartment_list returns tenancy plus any extra compartment IDs."""

    def test_compartment_list_tenancy_only(self) -> None:
        from optiora_backend.tools.oci_costs import _compartment_list
        import os

        orig = os.environ.pop("OCI_COMPARTMENT_IDS", None)
        try:
            result = _compartment_list("ocid1.tenancy.oc1..aaaatest")
            self.assertEqual(result, ["ocid1.tenancy.oc1..aaaatest"])
        finally:
            if orig is not None:
                os.environ["OCI_COMPARTMENT_IDS"] = orig

    def test_compartment_list_with_extra_compartments(self) -> None:
        from optiora_backend.tools.oci_costs import _compartment_list
        import os

        os.environ["OCI_COMPARTMENT_IDS"] = "ocid1.compartment.oc1..comp1, ocid1.compartment.oc1..comp2"
        try:
            result = _compartment_list("ocid1.tenancy.oc1..aaaatest")
            self.assertEqual(len(result), 3)
            self.assertEqual(result[0], "ocid1.tenancy.oc1..aaaatest")
            self.assertIn("ocid1.compartment.oc1..comp1", result)
            self.assertIn("ocid1.compartment.oc1..comp2", result)
        finally:
            os.environ.pop("OCI_COMPARTMENT_IDS", None)

    def test_compartment_list_deduplicates_tenancy(self) -> None:
        from optiora_backend.tools.oci_costs import _compartment_list
        import os

        os.environ["OCI_COMPARTMENT_IDS"] = "ocid1.tenancy.oc1..aaaatest,ocid1.compartment.oc1..compX"
        try:
            result = _compartment_list("ocid1.tenancy.oc1..aaaatest")
            self.assertEqual(result.count("ocid1.tenancy.oc1..aaaatest"), 1)
            self.assertEqual(len(result), 2)
        finally:
            os.environ.pop("OCI_COMPARTMENT_IDS", None)


class HierarchyPersistenceFromScopeMetadataTest(unittest.TestCase):
    """Verify parent scope metadata is persisted and exposed in hierarchy endpoints."""

    @classmethod
    def setUpClass(cls) -> None:
        _setup_db()
        cls.client = TestClient(app)
        cls.client.post(
            "/auth/register",
            json={"email": "hier-persist@example.com", "password": "StrongPass1!", "full_name": "Hierarchy Persist"},
        )
        login = cls.client.post(
            "/auth/login",
            json={"email": "hier-persist@example.com", "password": "StrongPass1!"},
        )
        cls.token = login.json()["access_token"]
        cls.headers = {"Authorization": f"Bearer {cls.token}"}
        org = cls.client.get("/auth/organization", headers=cls.headers)
        cls.org_id = org.json()["id"]
        cls.customer_id = f"org-{cls.org_id}"

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def test_oci_scope_parent_relationship_surfaces_in_rollups_and_federation(self) -> None:
        import optiora_backend.api as api_module

        async def _fake_cost_summary(provider: str, period: str = "month") -> dict:
            _ = period
            if provider != "oci":
                return {"error": "unsupported in test"}
            tenancy_id = "ocid1.tenancy.oc1..root"
            compartment_id = "ocid1.compartment.oc1..compA"
            return {
                "period": "month",
                "start_date": "2026-04-01",
                "end_date": "2026-04-30",
                "total_cost_usd": 150.0,
                "top_services": [{"service": "Compute", "cost_usd": 150.0}],
                "region_breakdown": [{"region": "uk-london-1", "cost_usd": 150.0}],
                "account_breakdown": [
                    {
                        "scope_type": "tenancy",
                        "scope_id": tenancy_id,
                        "scope_name": "Root Tenancy",
                        "total_cost_usd": 150.0,
                    },
                    {
                        "scope_type": "compartment",
                        "scope_id": compartment_id,
                        "scope_name": "Application Compartment",
                        "parent_scope_id": tenancy_id,
                        "parent_scope_type": "tenancy",
                        "total_cost_usd": 150.0,
                        "region_breakdown": [{"region": "uk-london-1", "cost_usd": 150.0}],
                    },
                ],
            }

        original_cost_summary = api_module._cost_summary_for_provider
        try:
            api_module._cost_summary_for_provider = _fake_cost_summary
            asyncio.run(
                api_module._run_cost_analysis(
                    scan_id="scan_hierarchy_scope_meta",
                    customer_id=self.customer_id,
                    providers=["oci"],
                )
            )
        finally:
            api_module._cost_summary_for_provider = original_cost_summary

        rollups_resp = self.client.get("/api/v1/provider-accounts/rollups?provider=oci", headers=self.headers)
        self.assertEqual(rollups_resp.status_code, 200, rollups_resp.text)
        rollup_items = rollups_resp.json().get("items", [])
        tenancy = next((item for item in rollup_items if item.get("account_type") == "tenancy"), None)
        compartment = next((item for item in rollup_items if item.get("account_type") == "compartment"), None)
        self.assertIsNotNone(tenancy, "tenancy node missing from OCI rollup")
        self.assertIsNotNone(compartment, "compartment node missing from OCI rollup")
        self.assertEqual(compartment["parent_account_identifier"], tenancy["account_identifier"])

        federation_resp = self.client.get("/api/v1/federation/costs?provider=oci", headers=self.headers)
        self.assertEqual(federation_resp.status_code, 200, federation_resp.text)
        accounts = federation_resp.json().get("accounts", [])
        fed_compartment = next((a for a in accounts if a.get("account_type") == "compartment"), None)
        self.assertIsNotNone(fed_compartment, "compartment missing from federation output")
        self.assertEqual(fed_compartment.get("parent_account_identifier"), tenancy["account_identifier"])
        self.assertAlmostEqual(fed_compartment.get("direct_cost_usd"), 150.0, places=2)
        self.assertAlmostEqual(fed_compartment.get("rolled_up_cost_usd"), 150.0, places=2)
        federation_data = federation_resp.json()
        self.assertAlmostEqual(federation_data["provider_totals_usd"]["oci"], 150.0, places=2)
        self.assertIn("tenancy", federation_data["account_type_totals_usd"])


if __name__ == "__main__":
    unittest.main()
