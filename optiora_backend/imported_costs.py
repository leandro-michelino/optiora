"""Helpers for imported cost reporting and summaries."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, Iterable

if TYPE_CHECKING:
    from .orm_models import ImportedCostRecord


def summarize_imported_cost_rows(rows: Iterable[Any]) -> Dict[str, Any]:
    materialized_rows = list(rows)
    providers = sorted(
        {
            str(getattr(row, "provider", "") or "").strip().lower()
            for row in materialized_rows
            if str(getattr(row, "provider", "") or "").strip()
        }
    )
    latest_imported_at = max(
        (getattr(row, "created_at", None) for row in materialized_rows),
        default=None,
    )
    return {
        "rows_imported": len(materialized_rows),
        "total_cost_usd": round(
            sum(float(getattr(row, "cost_usd", 0.0) or 0.0) for row in materialized_rows),
            2,
        ),
        "providers": providers,
        "last_imported_at": latest_imported_at,
        "upload_id": getattr(materialized_rows[0], "upload_id", None) if materialized_rows else None,
        "source_filename": getattr(materialized_rows[0], "source_filename", None) if materialized_rows else None,
    }


def query_imported_cost_rows(
    db: Any,
    organization_id: int,
    customer_id: str,
    cloud_provider: str = "all",
) -> list[Any]:
    from .orm_models import ImportedCostRecord

    query = db.query(ImportedCostRecord).filter(
        ImportedCostRecord.organization_id == organization_id,
        ImportedCostRecord.customer_id == customer_id,
    )
    if cloud_provider != "all":
        query = query.filter(ImportedCostRecord.provider == cloud_provider)
    return query.order_by(
        ImportedCostRecord.created_at.desc(),
        ImportedCostRecord.id.desc(),
    ).all()