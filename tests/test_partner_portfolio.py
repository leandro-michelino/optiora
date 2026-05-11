"""Tests for MSP/partner customer portfolio and white-label config."""

import os
import tempfile
import unittest

TEST_DB = os.path.join(tempfile.gettempdir(), f"optiora_partner_portfolio_{os.getpid()}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ENABLE_AUTH"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-partner-portfolio"
os.environ["PASSWORD_RESET_RETURN_TOKEN"] = "true"
os.environ["PARTNER_MODE_ENABLED"] = "true"
os.environ["WHITE_LABEL_BRAND_NAME"] = "Partner FinOps"
os.environ["WHITE_LABEL_PRIMARY_COLOR"] = "#0f766e"

try:
    from fastapi.testclient import TestClient

    from optiora_backend.app import app
    from optiora_backend.orm_models import (
        AlertEvent,
        Base,
        ImportedCostRecord,
        Organization,
        OrganizationPlan,
        User,
        UserOrganization,
        UserRole,
        engine,
        SessionLocal,
    )
except ImportError as exc:  # pragma: no cover
    raise unittest.SkipTest(f"Backend dependencies not installed: {exc}") from exc


class PartnerPortfolioTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)
        cls.client.post(
            "/auth/register",
            json={
                "email": "partner@example.com",
                "password": "StrongPass1!",
                "full_name": "Partner Owner",
            },
        )
        login = cls.client.post(
            "/auth/login",
            json={"email": "partner@example.com", "password": "StrongPass1!"},
        )
        assert login.status_code == 200, login.text
        cls.headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == "partner@example.com").first()
            assert user is not None
            first_membership = db.query(UserOrganization).filter(UserOrganization.user_id == user.id).first()
            assert first_membership is not None
            first_org = db.query(Organization).filter(Organization.id == first_membership.organization_id).first()
            assert first_org is not None
            first_org.name = "Retail Customer"
            first_org.plan = OrganizationPlan.PROFESSIONAL

            second_org = Organization(
                name="Manufacturing Customer",
                description="Second managed customer",
                plan=OrganizationPlan.ENTERPRISE,
                owner_id=user.id,
            )
            db.add(second_org)
            db.flush()
            db.add(
                UserOrganization(
                    user_id=user.id,
                    organization_id=second_org.id,
                    role=UserRole.ADMIN,
                )
            )

            db.add_all(
                [
                    ImportedCostRecord(
                        organization_id=first_org.id,
                        customer_id=f"org-{first_org.id}",
                        upload_id="portfolio-a",
                        source_filename="portfolio-a.csv",
                        provider="aws",
                        service_name="EC2",
                        cost_usd=120.0,
                        line_number=1,
                    ),
                    ImportedCostRecord(
                        organization_id=second_org.id,
                        customer_id=f"org-{second_org.id}",
                        upload_id="portfolio-b",
                        source_filename="portfolio-b.csv",
                        provider="oci",
                        service_name="Compute",
                        cost_usd=300.0,
                        line_number=1,
                    ),
                    AlertEvent(
                        organization_id=second_org.id,
                        customer_id=f"org-{second_org.id}",
                        alert_type="budget.threshold",
                        severity="warning",
                        title="Budget warning",
                        message="Portfolio alert",
                        delivered_channels_json="[]",
                    ),
                ]
            )
            db.commit()
        finally:
            db.close()

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        try:
            os.remove(TEST_DB)
        except FileNotFoundError:
            pass

    def test_partner_portfolio_returns_all_accessible_customers(self) -> None:
        resp = self.client.get("/api/v1/partner/customer-portfolio", headers=self.headers)
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()
        self.assertTrue(data["partner_mode_enabled"])
        self.assertEqual(data["white_label"]["brand_name"], "Partner FinOps")
        self.assertEqual(data["customer_count"], 2)
        self.assertAlmostEqual(data["total_cost_usd"], 420.0, places=2)
        self.assertEqual(data["open_alert_count"], 1)
        names = {row["customer_name"] for row in data["customers"]}
        self.assertEqual(names, {"Retail Customer", "Manufacturing Customer"})


if __name__ == "__main__":
    unittest.main()
