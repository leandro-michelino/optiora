"""Tests for budget alert evaluation and outbound delivery channel wiring."""

from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch


try:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from finops_mcp.notifications import evaluate_budget_alert
    from finops_mcp.orm_models import AlertEvent, Base
except ImportError as exc:  # pragma: no cover - local dependency guard
    raise unittest.SkipTest(f"Backend dependencies are not installed: {exc}") from exc


class _Permission:
    def __init__(
        self,
        *,
        notifications_enabled: bool = True,
        monthly_budget_usd: float = 1000.0,
        warning_threshold_percent: float = 80.0,
        critical_threshold_percent: float = 100.0,
        notification_email: str | None = "ops@example.com",
    ) -> None:
        self.notifications_enabled = notifications_enabled
        self.monthly_budget_usd = monthly_budget_usd
        self.warning_threshold_percent = warning_threshold_percent
        self.critical_threshold_percent = critical_threshold_percent
        self.notification_email = notification_email


class NotificationFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        cls.Session = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)
        Base.metadata.create_all(bind=cls.engine)

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        self.db = self.Session()

    def tearDown(self) -> None:
        self.db.rollback()
        self.db.close()

    def test_budget_alert_creates_event_and_tracks_channels(self) -> None:
        permission = _Permission(monthly_budget_usd=1000.0, warning_threshold_percent=70.0)

        with (
            patch(
                "finops_mcp.notifications.Config",
                return_value=SimpleNamespace(
                    smtp_host="smtp.example.com",
                    smtp_port=587,
                    smtp_user="",
                    smtp_password="",
                    smtp_from_email="noreply@example.com",
                    smtp_use_tls=True,
                    slack_webhook="https://hooks.slack.test/demo",
                    teams_webhook="https://teams.microsoft.test/demo",
                ),
            ),
            patch("finops_mcp.notifications._send_email", return_value=True),
            patch("finops_mcp.notifications._send_slack_message", return_value=True),
            patch("finops_mcp.notifications._send_teams_message", return_value=True),
        ):
            event = evaluate_budget_alert(
                db=self.db,
                organization_id=1,
                customer_id="org-1",
                scan_id="scan_org-1_1",
                total_cost_usd=900.0,
                permission=permission,
            )

        self.assertIsNotNone(event)
        assert event is not None
        self.assertEqual(event.severity, "warning")
        channels = json.loads(event.delivered_channels_json or "[]")
        self.assertEqual(channels, ["email", "slack", "teams"])

    def test_budget_alert_skips_when_disabled_or_below_threshold(self) -> None:
        permission_disabled = _Permission(notifications_enabled=False)
        permission_below = _Permission(monthly_budget_usd=1000.0, warning_threshold_percent=90.0)

        with (
            patch(
                "finops_mcp.notifications.Config",
                return_value=SimpleNamespace(
                    smtp_host="smtp.example.com",
                    smtp_port=587,
                    smtp_user="",
                    smtp_password="",
                    smtp_from_email="noreply@example.com",
                    smtp_use_tls=True,
                    slack_webhook="https://hooks.slack.test/demo",
                    teams_webhook="https://teams.microsoft.test/demo",
                ),
            ),
            patch("finops_mcp.notifications._send_email", return_value=True),
            patch("finops_mcp.notifications._send_slack_message", return_value=True),
            patch("finops_mcp.notifications._send_teams_message", return_value=True),
        ):
            event_disabled = evaluate_budget_alert(
                db=self.db,
                organization_id=1,
                customer_id="org-1",
                scan_id="scan_org-1_2",
                total_cost_usd=950.0,
                permission=permission_disabled,
            )
            event_below = evaluate_budget_alert(
                db=self.db,
                organization_id=1,
                customer_id="org-1",
                scan_id="scan_org-1_3",
                total_cost_usd=850.0,
                permission=permission_below,
            )

        self.assertIsNone(event_disabled)
        self.assertIsNone(event_below)
        self.assertEqual(self.db.query(AlertEvent).count(), 0)


if __name__ == "__main__":
    unittest.main()
