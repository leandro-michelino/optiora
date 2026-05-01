"""Scanning permission and job state management."""

import json
import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Iterable, List, Optional

from .orm_models import ScanRunRecord, ScanningPermissionRecord

logger = logging.getLogger(__name__)


class ScanningState(str, Enum):
    """States of the scanning process."""

    INITIALIZED = "initialized"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


class ScanningManager:
    """Persist scanning permission and scan run status."""

    def __init__(self, db_session):
        self.db = db_session

    @staticmethod
    def _scope_candidates(customer_id: str, legacy_customer_ids: Optional[Iterable[str]] = None) -> list[str]:
        ordered = [customer_id, *(legacy_customer_ids or [])]
        unique: list[str] = []
        for candidate in ordered:
            normalized = str(candidate or "").strip()
            if normalized and normalized not in unique:
                unique.append(normalized)
        return unique

    def _permission_record(
        self,
        customer_id: str,
        legacy_customer_ids: Optional[Iterable[str]] = None,
    ) -> Optional[ScanningPermissionRecord]:
        candidates = self._scope_candidates(customer_id, legacy_customer_ids)
        record = (
            self.db.query(ScanningPermissionRecord)
            .filter(ScanningPermissionRecord.customer_id.in_(candidates))
            .first()
        )
        if record and record.customer_id != customer_id:
            record.customer_id = customer_id
            self.db.commit()
        return record

    def create_permission_request(
        self,
        customer_id: str,
        providers: List[str],
        notification_email: str,
        legacy_customer_ids: Optional[Iterable[str]] = None,
    ) -> dict:
        providers = sorted({p.lower() for p in providers})
        record = self._permission_record(customer_id, legacy_customer_ids)
        if record is None:
            record = ScanningPermissionRecord(
                customer_id=customer_id,
                state=ScanningState.PENDING_APPROVAL.value,
                providers_json=json.dumps(providers),
                scan_frequency="daily",
                auto_remediate=False,
                notification_email=notification_email,
            )
            self.db.add(record)
        else:
            record.state = ScanningState.PENDING_APPROVAL.value
            record.providers_json = json.dumps(providers)
            record.notification_email = notification_email
            record.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

        self.db.commit()
        return self.get_permission_status(customer_id)

    def request_approval(self, customer_id: str, providers: List[str]) -> dict:
        return {
            "customer_id": customer_id,
            "message": f"Ready to scan {', '.join(providers)} for cost optimization",
            "action_required": True,
            "approve_url": f"/dashboard/settings?customer_id={customer_id}",
        }

    def approve_scanning(
        self,
        customer_id: str,
        auto_remediate: bool = False,
        scan_frequency: str = "daily",
        notification_email: Optional[str] = None,
        monthly_budget_usd: float = 0.0,
        warning_threshold_percent: float = 80.0,
        critical_threshold_percent: float = 100.0,
        notifications_enabled: bool = True,
        scheduler_override_enabled: bool = False,
        scheduler_override_frequency: Optional[str] = None,
        scheduler_retry_max_attempts: int = 2,
        scheduler_retry_backoff_seconds: int = 120,
        scheduler_overdue_alert_hours: int = 24,
        legacy_customer_ids: Optional[Iterable[str]] = None,
    ) -> dict:
        record = self._permission_record(customer_id, legacy_customer_ids)
        if record is None:
            record = ScanningPermissionRecord(
                customer_id=customer_id,
                state=ScanningState.APPROVED.value,
                providers_json="[]",
                scan_frequency=scan_frequency,
                auto_remediate=auto_remediate,
                notification_email=notification_email,
                monthly_budget_usd=float(monthly_budget_usd or 0.0),
                warning_threshold_percent=float(warning_threshold_percent or 80.0),
                critical_threshold_percent=float(critical_threshold_percent or 100.0),
                notifications_enabled=bool(notifications_enabled),
                scheduler_override_enabled=bool(scheduler_override_enabled),
                scheduler_override_frequency=(
                    str(scheduler_override_frequency or "").strip().lower() or None
                ),
                scheduler_retry_max_attempts=max(1, int(scheduler_retry_max_attempts or 1)),
                scheduler_retry_backoff_seconds=max(15, int(scheduler_retry_backoff_seconds or 15)),
                scheduler_overdue_alert_hours=max(1, int(scheduler_overdue_alert_hours or 1)),
                approved_at=datetime.now(timezone.utc).replace(tzinfo=None),
            )
            self.db.add(record)
        else:
            record.state = ScanningState.APPROVED.value
            record.scan_frequency = scan_frequency
            record.auto_remediate = auto_remediate
            record.notification_email = notification_email
            record.monthly_budget_usd = float(monthly_budget_usd or 0.0)
            record.warning_threshold_percent = float(warning_threshold_percent or 80.0)
            record.critical_threshold_percent = float(critical_threshold_percent or 100.0)
            record.notifications_enabled = bool(notifications_enabled)
            record.scheduler_override_enabled = bool(scheduler_override_enabled)
            record.scheduler_override_frequency = (
                str(scheduler_override_frequency or "").strip().lower() or None
            )
            record.scheduler_retry_max_attempts = max(1, int(scheduler_retry_max_attempts or 1))
            record.scheduler_retry_backoff_seconds = max(15, int(scheduler_retry_backoff_seconds or 15))
            record.scheduler_overdue_alert_hours = max(1, int(scheduler_overdue_alert_hours or 1))
            record.approved_at = datetime.now(timezone.utc).replace(tzinfo=None)
            record.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

        self.db.commit()
        return self.get_permission_status(customer_id)

    def pause_scanning(
        self,
        customer_id: str,
        legacy_customer_ids: Optional[Iterable[str]] = None,
    ) -> dict:
        return self._update_state(
            customer_id,
            ScanningState.PAUSED,
            legacy_customer_ids=legacy_customer_ids,
        )

    def resume_scanning(
        self,
        customer_id: str,
        legacy_customer_ids: Optional[Iterable[str]] = None,
    ) -> dict:
        return self._update_state(
            customer_id,
            ScanningState.RUNNING,
            legacy_customer_ids=legacy_customer_ids,
        )

    def get_permission_status(
        self,
        customer_id: str,
        legacy_customer_ids: Optional[Iterable[str]] = None,
    ) -> dict:
        record = self._permission_record(customer_id, legacy_customer_ids)
        if record is None:
            return {
                "customer_id": customer_id,
                "state": ScanningState.INITIALIZED.value,
                "providers": [],
                "scan_frequency": "daily",
                "auto_remediate": False,
                "notification_email": None,
                "monthly_budget_usd": 0.0,
                "warning_threshold_percent": 80.0,
                "critical_threshold_percent": 100.0,
                "notifications_enabled": True,
                "scheduler_override_enabled": False,
                "scheduler_override_frequency": None,
                "scheduler_retry_max_attempts": 2,
                "scheduler_retry_backoff_seconds": 120,
                "scheduler_overdue_alert_hours": 24,
                "created_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
                "approved_at": None,
            }

        return {
            "customer_id": record.customer_id,
            "state": record.state,
            "providers": json.loads(record.providers_json or "[]"),
            "scan_frequency": record.scan_frequency,
            "auto_remediate": bool(record.auto_remediate),
            "notification_email": record.notification_email,
            "monthly_budget_usd": float(record.monthly_budget_usd or 0.0),
            "warning_threshold_percent": float(record.warning_threshold_percent or 80.0),
            "critical_threshold_percent": float(record.critical_threshold_percent or 100.0),
            "notifications_enabled": bool(record.notifications_enabled),
            "scheduler_override_enabled": bool(record.scheduler_override_enabled),
            "scheduler_override_frequency": (
                str(record.scheduler_override_frequency or "").strip().lower() or None
            ),
            "scheduler_retry_max_attempts": max(1, int(record.scheduler_retry_max_attempts or 1)),
            "scheduler_retry_backoff_seconds": max(15, int(record.scheduler_retry_backoff_seconds or 15)),
            "scheduler_overdue_alert_hours": max(1, int(record.scheduler_overdue_alert_hours or 1)),
            "created_at": record.created_at.isoformat(),
            "approved_at": record.approved_at.isoformat() if record.approved_at else None,
        }

    def create_scan_run(self, scan_id: str, customer_id: str, providers: List[str]) -> None:
        row = ScanRunRecord(
            scan_id=scan_id,
            customer_id=customer_id,
            state=ScanningState.RUNNING.value,
            providers_json=json.dumps(providers),
            progress=0,
        )
        self.db.add(row)
        self.db.commit()

    def get_scan_run(self, scan_id: str) -> Optional[dict]:
        row = self.db.query(ScanRunRecord).filter(ScanRunRecord.scan_id == scan_id).first()
        if row is None:
            return None
        return {
            "scan_id": row.scan_id,
            "customer_id": row.customer_id,
            "state": row.state,
            "progress": row.progress,
            "providers": json.loads(row.providers_json or "[]"),
            "started_at": row.started_at,
            "completed_at": row.completed_at,
            "total_resources": row.total_resources,
            "anomalies_found": row.anomalies_found,
            "savings_identified": float(row.savings_identified),
            "error_message": row.error_message,
        }

    def complete_scan_run(
        self,
        scan_id: str,
        progress: int,
        total_resources: int,
        anomalies_found: int,
        savings_identified: float,
    ) -> None:
        row = self.db.query(ScanRunRecord).filter(ScanRunRecord.scan_id == scan_id).first()
        if row is None:
            return
        row.state = ScanningState.COMPLETED.value
        row.progress = progress
        row.total_resources = total_resources
        row.anomalies_found = anomalies_found
        row.savings_identified = float(savings_identified)
        row.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        self.db.commit()

    def fail_scan_run(self, scan_id: str, error_message: str) -> None:
        row = self.db.query(ScanRunRecord).filter(ScanRunRecord.scan_id == scan_id).first()
        if row is None:
            return
        row.state = ScanningState.FAILED.value
        row.error_message = error_message
        row.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        self.db.commit()

    def _update_state(
        self,
        customer_id: str,
        state: ScanningState,
        legacy_customer_ids: Optional[Iterable[str]] = None,
    ) -> dict:
        record = self._permission_record(customer_id, legacy_customer_ids)
        if record is None:
            raise ValueError("Scanning permission not found for customer")
        record.state = state.value
        record.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        self.db.commit()
        return self.get_permission_status(customer_id, legacy_customer_ids=legacy_customer_ids)
