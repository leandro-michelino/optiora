"""Audit-log helpers."""

from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy.orm import Session

from .orm_models import AuditLog


def record_audit_event(
    db: Session,
    organization_id: int,
    actor_user_id: Optional[int],
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> AuditLog:
    entry = AuditLog(
        organization_id=organization_id,
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata_json=json.dumps(metadata or {}, sort_keys=True),
    )
    db.add(entry)
    return entry
