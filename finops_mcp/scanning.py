"""Scanning permission and job state management."""

import json
import logging
from datetime import datetime
from enum import Enum
from typing import List, Optional

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

    def create_permission_request(
        self,
        customer_id: str,
        providers: List[str],
        notification_email: str,
    ) -> dict:
        providers = sorted({p.lower() for p in providers})
        record = (
            self.db.query(ScanningPermissionRecord)
            .filter(ScanningPermissionRecord.customer_id == customer_id)
            .first()
        )
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
            record.updated_at = datetime.utcnow()

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
    ) -> dict:
        record = (
            self.db.query(ScanningPermissionRecord)
            .filter(ScanningPermissionRecord.customer_id == customer_id)
            .first()
        )
        if record is None:
            record = ScanningPermissionRecord(
                customer_id=customer_id,
                state=ScanningState.APPROVED.value,
                providers_json="[]",
                scan_frequency=scan_frequency,
                auto_remediate=auto_remediate,
                approved_at=datetime.utcnow(),
            )
            self.db.add(record)
        else:
            record.state = ScanningState.APPROVED.value
            record.scan_frequency = scan_frequency
            record.auto_remediate = auto_remediate
            record.approved_at = datetime.utcnow()
            record.updated_at = datetime.utcnow()

        self.db.commit()
        return self.get_permission_status(customer_id)

    def pause_scanning(self, customer_id: str) -> dict:
        return self._update_state(customer_id, ScanningState.PAUSED)

    def resume_scanning(self, customer_id: str) -> dict:
        return self._update_state(customer_id, ScanningState.RUNNING)

    def get_permission_status(self, customer_id: str) -> dict:
        record = (
            self.db.query(ScanningPermissionRecord)
            .filter(ScanningPermissionRecord.customer_id == customer_id)
            .first()
        )
        if record is None:
            return {
                "customer_id": customer_id,
                "state": ScanningState.INITIALIZED.value,
                "providers": [],
                "scan_frequency": "daily",
                "auto_remediate": False,
                "created_at": datetime.utcnow().isoformat(),
                "approved_at": None,
            }

        return {
            "customer_id": record.customer_id,
            "state": record.state,
            "providers": json.loads(record.providers_json or "[]"),
            "scan_frequency": record.scan_frequency,
            "auto_remediate": bool(record.auto_remediate),
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
        row.completed_at = datetime.utcnow()
        self.db.commit()

    def fail_scan_run(self, scan_id: str, error_message: str) -> None:
        row = self.db.query(ScanRunRecord).filter(ScanRunRecord.scan_id == scan_id).first()
        if row is None:
            return
        row.state = ScanningState.FAILED.value
        row.error_message = error_message
        row.completed_at = datetime.utcnow()
        self.db.commit()

    def _update_state(self, customer_id: str, state: ScanningState) -> dict:
        record = (
            self.db.query(ScanningPermissionRecord)
            .filter(ScanningPermissionRecord.customer_id == customer_id)
            .first()
        )
        if record is None:
            raise ValueError("Scanning permission not found for customer")
        record.state = state.value
        record.updated_at = datetime.utcnow()
        self.db.commit()
        return self.get_permission_status(customer_id)
