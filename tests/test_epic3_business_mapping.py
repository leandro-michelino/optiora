"""Epic 3: Business Mapping & Chargeback Foundations tests.

Covers:
- business_mapping_rules and normalized_cost_dimensions table presence
- CRUD for mapping rules (create, list, update, delete)
- 409 on duplicate, 400 on invalid dimension
- Chargeback aggregation after applying rules
- Allocation coverage calculation
- POST /api/v1/business-mapping/apply writes NormalizedCostDimension rows
"""

import io
import json
import os
import tempfile
import unittest

TEST_DB = os.path.join(tempfile.gettempdir(), "optiora_epic3_test.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{TEST_DB}")
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-epic3-secret"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"

try:
    from fastapi.testclient import TestClient
    from sqlalchemy import inspect as sa_inspect

    from optiora_backend.app import app
    from optiora_backend.orm_models import (
        Base,
        BusinessMappingRule,
        NormalizedCostDimension,
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


def _setup_db() -> None:
    engine.dispose()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def _teardown_db() -> None:
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def _get_token(client: TestClient, email: str, password: str) -> str:
    resp = client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _register_admin(client: TestClient, email: str = "admin3@test.com", password: str = "Pass1234!") -> str:
    resp = client.post("/auth/register", json={"email": email, "password": password})
    assert resp.status_code in (200, 201, 409), resp.text
    token = _get_token(client, email, password)
    # elevate to ADMIN
    with SessionLocal() as db:
        u = db.query(User).filter_by(email=email).first()
        if u:
            uo = db.query(UserOrganization).filter_by(user_id=u.id).first()
            if uo:
                uo.role = UserRole.ADMIN
                db.commit()
    return token


CSV_WITH_TAGS = """\
provider,service,region,cost_usd,tags
aws,EC2,us-east-1,200.00,"{""team"":""platform"",""env"":""prod""}"
aws,S3,us-east-1,50.00,"{""team"":""platform"",""env"":""dev""}"
aws,RDS,us-west-2,100.00,"{""team"":""data"",""env"":""prod""}"
aws,Lambda,eu-west-1,30.00,"{}"
"""


class BusinessMappingSchemaTest(unittest.TestCase):
    """Verify both new tables exist with required columns."""

    @classmethod
    def setUpClass(cls) -> None:
        _setup_db()

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def test_business_mapping_rules_table(self) -> None:
        inspector = sa_inspect(engine)
        tables = inspector.get_table_names()
        self.assertIn("business_mapping_rules", tables)
        cols = {c["name"] for c in inspector.get_columns("business_mapping_rules")}
        for col in ("id", "organization_id", "tag_key", "tag_value", "dimension", "mapped_value", "priority", "is_active"):
            self.assertIn(col, cols, f"Missing column: {col}")

    def test_normalized_cost_dimensions_table(self) -> None:
        inspector = sa_inspect(engine)
        tables = inspector.get_table_names()
        self.assertIn("normalized_cost_dimensions", tables)
        cols = {c["name"] for c in inspector.get_columns("normalized_cost_dimensions")}
        for col in ("id", "organization_id", "provider", "service_name", "cost_usd", "team", "environment", "application", "cost_center", "is_mapped"):
            self.assertIn(col, cols, f"Missing column: {col}")


class MappingRuleCRUDTest(unittest.TestCase):
    """CRUD for mapping rules."""

    @classmethod
    def setUpClass(cls) -> None:
        _setup_db()
        ensure_public_workspace()
        cls.client = TestClient(app, raise_server_exceptions=True)
        cls.token = _register_admin(cls.client)
        cls.headers = {"Authorization": f"Bearer {cls.token}"}

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def _create_rule(self, tag_key: str, dimension: str, mapped_value: str, tag_value: str = "*") -> dict:
        resp = self.client.post(
            "/api/v1/business-mapping/rules",
            json={"tag_key": tag_key, "tag_value": tag_value, "dimension": dimension, "mapped_value": mapped_value},
            headers=self.headers,
        )
        self.assertIn(resp.status_code, (200, 201), resp.text)
        return resp.json()

    def test_create_and_list(self) -> None:
        rule = self._create_rule("team", "team", "platform")
        self.assertEqual(rule["tag_key"], "team")
        self.assertEqual(rule["dimension"], "team")
        self.assertEqual(rule["mapped_value"], "platform")

        resp = self.client.get("/api/v1/business-mapping/rules", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("rules", data)
        rule_ids = [r["id"] for r in data["rules"]]
        self.assertIn(rule["id"], rule_ids)

    def test_update_rule(self) -> None:
        rule = self._create_rule("env", "environment", "production", tag_value="prod")
        rule_id = rule["id"]

        resp = self.client.put(
            f"/api/v1/business-mapping/rules/{rule_id}",
            json={"mapped_value": "prod-updated"},
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json()["mapped_value"], "prod-updated")

    def test_delete_rule(self) -> None:
        rule = self._create_rule("app", "application", "my-app")
        rule_id = rule["id"]

        resp = self.client.delete(f"/api/v1/business-mapping/rules/{rule_id}", headers=self.headers)
        self.assertEqual(resp.status_code, 204, resp.text)

        # Should not appear in list
        resp2 = self.client.get("/api/v1/business-mapping/rules", headers=self.headers)
        ids = [r["id"] for r in resp2.json().get("rules", [])]
        self.assertNotIn(rule_id, ids)

    def test_invalid_dimension_returns_400(self) -> None:
        resp = self.client.post(
            "/api/v1/business-mapping/rules",
            json={"tag_key": "x", "dimension": "invalid_dim", "mapped_value": "y"},
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 400, resp.text)

    def test_duplicate_returns_409(self) -> None:
        self._create_rule("dept", "cost_center", "engineering", tag_value="eng")
        resp = self.client.post(
            "/api/v1/business-mapping/rules",
            json={"tag_key": "dept", "tag_value": "eng", "dimension": "cost_center", "mapped_value": "engineering"},
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 409, resp.text)


class MappingApplyTest(unittest.TestCase):
    """POST /api/v1/business-mapping/apply writes NormalizedCostDimension rows."""

    @classmethod
    def setUpClass(cls) -> None:
        _setup_db()
        ensure_public_workspace()
        cls.client = TestClient(app, raise_server_exceptions=True)
        cls.token = _register_admin(cls.client)
        cls.headers = {"Authorization": f"Bearer {cls.token}"}
        # Create a mapping rule
        cls.client.post(
            "/api/v1/business-mapping/rules",
            json={"tag_key": "team", "tag_value": "*", "dimension": "team", "mapped_value": "matched-team"},
            headers=cls.headers,
        )
        # Upload tagged CSV
        cls.client.post(
            "/api/v1/imports/costs/csv",
            files={"file": ("tags.csv", io.BytesIO(CSV_WITH_TAGS.encode()), "text/csv")},
            headers=cls.headers,
        )

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def test_apply_returns_stats(self) -> None:
        resp = self.client.post("/api/v1/business-mapping/apply", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("records_processed", data)
        self.assertIn("dimension_rows_written", data)

    def test_normalized_rows_created(self) -> None:
        self.client.post("/api/v1/business-mapping/apply", headers=self.headers)
        with SessionLocal() as db:
            rows = db.query(NormalizedCostDimension).all()
        self.assertGreater(len(rows), 0)


class ChargebackAggregationTest(unittest.TestCase):
    """GET /api/v1/chargeback returns grouped results."""

    @classmethod
    def setUpClass(cls) -> None:
        _setup_db()
        ensure_public_workspace()
        cls.client = TestClient(app, raise_server_exceptions=True)
        cls.token = _register_admin(cls.client)
        cls.headers = {"Authorization": f"Bearer {cls.token}"}
        # Rule: tag_key=team → dimension=team
        cls.client.post(
            "/api/v1/business-mapping/rules",
            json={"tag_key": "team", "tag_value": "*", "dimension": "team", "mapped_value": "platform"},
            headers=cls.headers,
        )
        cls.client.post(
            "/api/v1/imports/costs/csv",
            files={"file": ("tags2.csv", io.BytesIO(CSV_WITH_TAGS.encode()), "text/csv")},
            headers=cls.headers,
        )

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def test_chargeback_by_team(self) -> None:
        resp = self.client.get("/api/v1/chargeback?dimension_type=team", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertIn("groups", data)
        self.assertIn("total_cost_usd", data)
        self.assertIn("coverage_percent", data)

    def test_chargeback_default_dimension(self) -> None:
        resp = self.client.get("/api/v1/chargeback", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)

    def test_invalid_dimension_type(self) -> None:
        resp = self.client.get("/api/v1/chargeback?dimension_type=bogus", headers=self.headers)
        self.assertEqual(resp.status_code, 400, resp.text)


class AllocationCoverageTest(unittest.TestCase):
    """GET /api/v1/chargeback/coverage returns coverage metrics."""

    @classmethod
    def setUpClass(cls) -> None:
        _setup_db()
        ensure_public_workspace()
        cls.client = TestClient(app, raise_server_exceptions=True)
        cls.token = _register_admin(cls.client)
        cls.headers = {"Authorization": f"Bearer {cls.token}"}
        cls.client.post(
            "/api/v1/business-mapping/rules",
            json={"tag_key": "team", "tag_value": "*", "dimension": "team", "mapped_value": "ops"},
            headers=cls.headers,
        )
        cls.client.post(
            "/api/v1/imports/costs/csv",
            files={"file": ("cov.csv", io.BytesIO(CSV_WITH_TAGS.encode()), "text/csv")},
            headers=cls.headers,
        )

    @classmethod
    def tearDownClass(cls) -> None:
        _teardown_db()

    def test_coverage_response_shape(self) -> None:
        resp = self.client.get("/api/v1/chargeback/coverage", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        for key in ("total_cost_usd", "mapped_cost_usd", "unmapped_cost_usd", "coverage_percent", "dimension_coverage", "provider_coverage", "unmapped_top_services"):
            self.assertIn(key, data, f"Missing key: {key}")

    def test_coverage_percent_in_range(self) -> None:
        resp = self.client.get("/api/v1/chargeback/coverage", headers=self.headers)
        pct = resp.json()["coverage_percent"]
        self.assertGreaterEqual(pct, 0.0)
        self.assertLessEqual(pct, 100.0)

    def test_unmapped_top_services_is_list(self) -> None:
        resp = self.client.get("/api/v1/chargeback/coverage", headers=self.headers)
        svcs = resp.json()["unmapped_top_services"]
        self.assertIsInstance(svcs, list)


if __name__ == "__main__":
    unittest.main()
