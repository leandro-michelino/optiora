"""Pure helpers for scan scheduler timing and status snapshots."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Callable, Dict, Iterable, Optional


def scan_interval_seconds(scan_frequency: str) -> int:
    normalized = str(scan_frequency or "daily").strip().lower()
    if normalized == "hourly":
        return 60 * 60
    if normalized == "weekly":
        return 7 * 24 * 60 * 60
    return 24 * 60 * 60


def compute_next_run(now: datetime, scan_frequency: str, anchor: datetime) -> datetime:
    interval = timedelta(seconds=scan_interval_seconds(scan_frequency))
    next_run = anchor + interval
    while next_run < now:
        next_run += interval
    return next_run


def scheduler_settings(permission: Any, initialized_state: str) -> Dict[str, Any]:
    permission_state = getattr(permission, "state", initialized_state) if permission else initialized_state
    scan_frequency = getattr(permission, "scan_frequency", "daily") if permission else "daily"
    override_enabled = bool(getattr(permission, "scheduler_override_enabled", False)) if permission else False
    override_frequency = str(getattr(permission, "scheduler_override_frequency", "") or "").strip().lower()
    effective_scan_frequency = (
        override_frequency
        if override_enabled and override_frequency in {"hourly", "daily", "weekly"}
        else scan_frequency
    )
    return {
        "permission_state": permission_state,
        "scan_frequency": scan_frequency,
        "scheduler_override_enabled": override_enabled,
        "effective_scan_frequency": effective_scan_frequency,
        "retry_max_attempts": max(1, int(getattr(permission, "scheduler_retry_max_attempts", 1) or 1)) if permission else 1,
        "retry_backoff_seconds": max(15, int(getattr(permission, "scheduler_retry_backoff_seconds", 15) or 15)) if permission else 15,
        "overdue_alert_hours": max(1, int(getattr(permission, "scheduler_overdue_alert_hours", 24) or 24)) if permission else 24,
    }


def summarize_scheduler_runs(runs: Iterable[Any], completed_state: str, failed_state: str) -> Dict[str, Any]:
    materialized_runs = list(runs)
    last_success = next(
        (
            getattr(row, "completed_at", None) or getattr(row, "started_at", None)
            for row in materialized_runs
            if getattr(row, "state", None) == completed_state
        ),
        None,
    )
    last_failure = next(
        (
            getattr(row, "completed_at", None) or getattr(row, "started_at", None)
            for row in materialized_runs
            if getattr(row, "state", None) == failed_state
        ),
        None,
    )
    return {
        "total": len(materialized_runs),
        "success": sum(1 for row in materialized_runs if getattr(row, "state", None) == completed_state),
        "failure": sum(1 for row in materialized_runs if getattr(row, "state", None) == failed_state),
        "last_success": last_success,
        "last_failure": last_failure,
    }


def build_scheduler_timeline(
    runs: Iterable[Any],
    audit_rows: Iterable[Any],
    *,
    safe_json_load: Callable[[str, Dict[str, Any]], Dict[str, Any]],
) -> list[Dict[str, str]]:
    timeline: list[Dict[str, str]] = []
    for row in list(runs)[:6]:
        providers = safe_json_load(getattr(row, "providers_json", "[]") or "[]", [])
        timeline.append(
            {
                "id": f"scan-{getattr(row, 'scan_id', '')}",
                "event_type": "scan_run",
                "state": str(getattr(row, "state", "unknown")),
                "title": f"Scan {getattr(row, 'state', 'unknown')}",
                "detail": f"Providers: {', '.join(providers) if providers else 'n/a'}",
                "created_at": (getattr(row, "completed_at", None) or getattr(row, "started_at", None)).isoformat(),
            }
        )
    for row in audit_rows:
        metadata = safe_json_load(getattr(row, "metadata_json", "{}") or "{}", {})
        providers = metadata.get("providers", [])
        detail = f"Frequency: {metadata.get('frequency', 'n/a')}"
        if providers:
            detail = f"{detail} | Providers: {', '.join([str(item) for item in providers])}"
        timeline.append(
            {
                "id": f"audit-{getattr(row, 'id', '')}",
                "event_type": "scheduler_trigger",
                "state": "info",
                "title": "Scheduler triggered scan",
                "detail": detail,
                "created_at": getattr(row, "created_at").isoformat(),
            }
        )
    return sorted(timeline, key=lambda item: item["created_at"], reverse=True)[:10]


def scheduler_runtime_snapshot(
    *,
    now: datetime,
    permission: Any,
    runs: Iterable[Any],
    audit_rows: Iterable[Any],
    initialized_state: str,
    approved_state: str,
    running_state: str,
    completed_state: str,
    failed_state: str,
    safe_json_load: Callable[[str, Dict[str, Any]], Dict[str, Any]],
) -> Dict[str, Any]:
    settings = scheduler_settings(permission, initialized_state)
    run_summary = summarize_scheduler_runs(runs, completed_state, failed_state)
    next_run_at: Optional[datetime] = None
    if permission and settings["permission_state"] in [approved_state, running_state]:
        anchor = (
            run_summary["last_success"]
            or getattr(permission, "approved_at", None)
            or getattr(permission, "created_at", None)
            or now
        )
        next_run_at = compute_next_run(now, settings["effective_scan_frequency"], anchor)

    eta_seconds: Optional[int] = None
    if next_run_at is not None:
        eta_seconds = max(0, int((next_run_at - now).total_seconds()))

    overdue = False
    if run_summary["last_success"] is not None:
        interval = scan_interval_seconds(settings["effective_scan_frequency"])
        overdue = int((now - run_summary["last_success"]).total_seconds()) > (
            interval + settings["overdue_alert_hours"] * 3600
        )

    return {
        **settings,
        "last_success": run_summary["last_success"],
        "last_failure": run_summary["last_failure"],
        "next_run_at": next_run_at,
        "next_run_eta_seconds": eta_seconds,
        "overdue": overdue,
        "counters": {
            "total": run_summary["total"],
            "success": run_summary["success"],
            "failure": run_summary["failure"],
        },
        "timeline": build_scheduler_timeline(runs, audit_rows, safe_json_load=safe_json_load),
    }