"""Notification delivery and budget-alert evaluation."""

from __future__ import annotations

import json
import logging
import smtplib
from email.message import EmailMessage
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from .config import Config
from .orm_models import AlertEvent, ScanningPermissionRecord

logger = logging.getLogger(__name__)


def _send_slack_message(webhook_url: str, title: str, message: str) -> bool:
    if not webhook_url:
        return False
    try:
        response = httpx.post(
            webhook_url,
            json={"text": f"*{title}*\n{message}"},
            timeout=5.0,
        )
        response.raise_for_status()
        return True
    except Exception:
        logger.exception("Slack notification failed")
        return False


def _send_email(config: Config, to_address: str, subject: str, body: str) -> bool:
    if not (config.smtp_host and config.smtp_from_email and to_address):
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = config.smtp_from_email
    msg["To"] = to_address
    msg.set_content(body)

    try:
        with smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=10) as smtp:
            if config.smtp_use_tls:
                smtp.starttls()
            if config.smtp_user:
                smtp.login(config.smtp_user, config.smtp_password)
            smtp.send_message(msg)
        return True
    except Exception:
        logger.exception("Email notification failed")
        return False


def evaluate_budget_alert(
    db: Session,
    organization_id: int,
    customer_id: str,
    scan_id: str,
    total_cost_usd: float,
    permission: Optional[ScanningPermissionRecord],
) -> Optional[AlertEvent]:
    if permission is None:
        return None
    if not permission.notifications_enabled:
        return None
    if float(permission.monthly_budget_usd or 0) <= 0:
        return None

    budget = float(permission.monthly_budget_usd)
    spend_ratio = (float(total_cost_usd) / budget) * 100 if budget > 0 else 0

    severity = None
    if spend_ratio >= float(permission.critical_threshold_percent or 100):
        severity = "critical"
    elif spend_ratio >= float(permission.warning_threshold_percent or 80):
        severity = "warning"

    if severity is None:
        return None

    title = "Budget threshold reached"
    message = (
        f"Current monthly spend is ${total_cost_usd:,.2f} against a ${budget:,.2f} budget "
        f"({spend_ratio:.1f}% used)."
    )

    config = Config()
    delivered_channels: list[str] = []
    if permission.notification_email and _send_email(
        config,
        permission.notification_email,
        f"[OptiOra] {title}",
        message,
    ):
        delivered_channels.append("email")

    if config.slack_webhook and _send_slack_message(config.slack_webhook, title, message):
        delivered_channels.append("slack")

    event = AlertEvent(
        organization_id=organization_id,
        customer_id=customer_id,
        scan_id=scan_id,
        alert_type="budget_threshold",
        severity=severity,
        title=title,
        message=message,
        delivered_channels_json=json.dumps(delivered_channels),
    )
    db.add(event)
    return event
