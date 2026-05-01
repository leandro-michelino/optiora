"""Notification delivery and budget-alert evaluation."""

from __future__ import annotations

import json
import logging
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Optional
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy.orm import Session

from .config import Config
from .orm_models import AlertEvent, AlertOpsPolicy, AlertRoutingPolicy, ScanningPermissionRecord

logger = logging.getLogger(__name__)

SUPPORTED_NOTIFICATION_CHANNELS = ("email", "slack", "teams")


def _severity_rank(value: str) -> int:
    normalized = str(value or "").strip().lower()
    rank = {"low": 1, "medium": 2, "warning": 2, "high": 3, "critical": 4}
    return rank.get(normalized, 1)


def _is_muted_window(policy: AlertOpsPolicy, now_utc: datetime) -> bool:
    if not bool(policy.mute_window_enabled):
        return False
    timezone_name = str(policy.timezone or "UTC").strip() or "UTC"
    try:
        tz = ZoneInfo(timezone_name)
    except Exception:
        tz = timezone.utc
    now_local = now_utc.replace(tzinfo=timezone.utc).astimezone(tz)
    if bool(policy.mute_weekends) and now_local.weekday() >= 5:
        return True
    start_hour = int(policy.mute_start_hour_utc or 0)
    end_hour = int(policy.mute_end_hour_utc or 0)
    current_hour = int(now_local.hour)
    if start_hour == end_hour:
        return False
    if start_hour < end_hour:
        return start_hour <= current_hour < end_hour
    return current_hour >= start_hour or current_hour < end_hour


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


def _send_teams_message(webhook_url: str, title: str, message: str) -> bool:
    if not webhook_url:
        return False
    try:
        response = httpx.post(
            webhook_url,
            json={
                "@type": "MessageCard",
                "@context": "https://schema.org/extensions",
                "summary": title,
                "themeColor": "0078D4",
                "title": title,
                "text": message,
            },
            timeout=5.0,
        )
        response.raise_for_status()
        return True
    except Exception:
        logger.exception("Teams notification failed")
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

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    ops_policy = (
        db.query(AlertOpsPolicy)
        .filter(AlertOpsPolicy.organization_id == organization_id)
        .first()
    )
    if ops_policy is not None:
        if _severity_rank(severity) < _severity_rank(str(ops_policy.min_severity or "low")):
            return None
        if _is_muted_window(ops_policy, now_utc):
            return None
        dedupe_window_minutes = max(0, int(ops_policy.dedupe_window_minutes or 0))
        if dedupe_window_minutes > 0:
            cutoff = now_utc - timedelta(minutes=dedupe_window_minutes)
            duplicate = (
                db.query(AlertEvent.id)
                .filter(
                    AlertEvent.organization_id == organization_id,
                    AlertEvent.customer_id == customer_id,
                    AlertEvent.alert_type == "budget_threshold",
                    AlertEvent.severity == severity,
                    AlertEvent.title == title,
                    AlertEvent.message == message,
                    AlertEvent.created_at >= cutoff,
                )
                .first()
            )
            if duplicate is not None:
                return None

    route_policy = (
        db.query(AlertRoutingPolicy)
        .filter(
            AlertRoutingPolicy.organization_id == organization_id,
            AlertRoutingPolicy.severity == severity,
            AlertRoutingPolicy.is_active == True,  # noqa: E712
        )
        .first()
    )
    channels = set(json.loads(route_policy.channels_json or "[]")) if route_policy else {"email", "slack", "teams"}

    config = Config()
    delivered_channels: list[str] = []
    if "email" in channels and permission.notification_email and _send_email(
        config,
        permission.notification_email,
        f"[OptiOra] {title}",
        message,
    ):
        delivered_channels.append("email")

    if "slack" in channels and config.slack_webhook and _send_slack_message(config.slack_webhook, title, message):
        delivered_channels.append("slack")
    if "teams" in channels and config.teams_webhook and _send_teams_message(config.teams_webhook, title, message):
        delivered_channels.append("teams")

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


def destination_configured(config: Config, channel: str) -> bool:
    channel_key = str(channel or "").strip().lower()
    if channel_key == "email":
        return bool(config.smtp_host and config.smtp_from_email)
    if channel_key == "slack":
        return bool(config.slack_webhook)
    if channel_key == "teams":
        return bool(config.teams_webhook)
    return False


def send_test_notification(
    config: Config,
    channel: str,
    target: Optional[str] = None,
    message: Optional[str] = None,
) -> tuple[bool, str]:
    """Send a lightweight test notification to validate destination wiring."""

    channel_key = str(channel or "").strip().lower()
    title = "[OptiOra] Notification destination test"
    body = message or "OptiOra test notification delivered successfully."

    if channel_key == "email":
        recipient = (target or "").strip()
        if not recipient:
            return False, "Email test requires a target recipient address."
        if not destination_configured(config, "email"):
            return False, "SMTP configuration is incomplete."
        ok = _send_email(config, recipient, title, body)
        return ok, "Email test delivered." if ok else "Email test failed."

    if channel_key == "slack":
        webhook = (target or config.slack_webhook or "").strip()
        if not webhook:
            return False, "Slack webhook is not configured."
        ok = _send_slack_message(webhook, title, body)
        return ok, "Slack test delivered." if ok else "Slack test failed."

    if channel_key == "teams":
        webhook = (target or config.teams_webhook or "").strip()
        if not webhook:
            return False, "Teams webhook is not configured."
        ok = _send_teams_message(webhook, title, body)
        return ok, "Teams test delivered." if ok else "Teams test failed."

    return False, f"Unsupported channel: {channel_key or 'unknown'}"
