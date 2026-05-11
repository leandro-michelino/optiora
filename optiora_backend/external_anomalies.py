"""Helpers for external anomaly payload normalization and alert shaping."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional


def coerce_aws_anomaly_impact_usd(payload: Dict[str, Any]) -> float:
    impact = payload.get("impact")
    if isinstance(impact, dict):
        for key in ("totalImpact", "maxImpact", "impact"):
            value = impact.get(key)
            if value is not None:
                try:
                    return float(value)
                except (TypeError, ValueError):
                    pass
    for key in ("totalImpact", "impact", "estimatedImpact"):
        value = payload.get(key)
        if value is not None:
            try:
                return float(value)
            except (TypeError, ValueError):
                pass
    return 0.0


def aws_anomaly_severity(impact_usd: float, source_severity: Optional[str]) -> str:
    normalized = str(source_severity or "").strip().lower()
    if normalized in {"critical", "high", "warning", "medium", "low"}:
        if normalized == "critical":
            return "high"
        if normalized == "warning":
            return "medium"
        return normalized
    if impact_usd >= 1000:
        return "high"
    if impact_usd >= 250:
        return "medium"
    return "low"


def derive_aws_anomaly_alert(event: Dict[str, Any], now: datetime) -> Dict[str, Any]:
    timestamp_source = now if now.tzinfo is not None else now.replace(tzinfo=timezone.utc)
    detail = event.get("detail")
    detail_payload = detail if isinstance(detail, dict) else event
    anomaly_id = (
        detail_payload.get("anomalyId")
        or detail_payload.get("AnomalyId")
        or event.get("id")
        or event.get("source_event_id")
        or f"aws-anomaly-{int(timestamp_source.timestamp())}"
    )
    impact_usd = coerce_aws_anomaly_impact_usd(detail_payload)
    severity = aws_anomaly_severity(
        impact_usd=impact_usd,
        source_severity=detail_payload.get("severity"),
    )
    monitor_name = (
        detail_payload.get("monitorName")
        or detail_payload.get("dimensionValue")
        or "AWS Cost Anomaly Detection"
    )
    title = f"AWS anomaly detected ({monitor_name})"
    message = (
        f"Anomaly {anomaly_id} estimated impact ${impact_usd:.2f}. "
        f"Root cause: {detail_payload.get('rootCauses', [])[:1] or 'pending'}."
    )
    return {
        "detail_payload": detail_payload,
        "anomaly_id": anomaly_id,
        "impact_usd": impact_usd,
        "severity": severity,
        "monitor_name": monitor_name,
        "title": title,
        "message": message,
    }