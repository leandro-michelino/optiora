"""Data retention: archive cold cost rows to OCI Object Storage, then purge from DB.

Policy
------
- Hot tier  : DB rows younger than RETENTION_HOT_MONTHS (default 3)
- Warm tier : OCI Object Storage — objects kept for 1 year via bucket lifecycle rule
              (configured in Terraform, not managed here)
- Cold/gone : Objects deleted automatically by the bucket lifecycle rule after 1 year

Archive format: newline-delimited JSON (.ndjson), one file per table per run.
Object path:    archive/<table>/<YYYY-MM-DD>/<table>-<utc-timestamp>.ndjson
"""

import io
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import oci  # oci SDK already in pyproject.toml
from sqlalchemy import text
from sqlalchemy.orm import Session

from .orm_models import (
    CostAllocationSnapshot,
    CostPeriodSummary,
    CostSnapshot,
    ImportedCostRecord,
    NormalizedCostDimension,
    SessionLocal,
)

logger = logging.getLogger(__name__)

# Archive prefix used when writing (and reading) cost_period_summaries rows.
_ARCHIVE_SUMMARIES_PREFIX = "archive/cost_period_summaries/"

# ---------------------------------------------------------------------------
# Tables eligible for archival — (ORM model, timestamp column name)
# ---------------------------------------------------------------------------
_ARCHIVABLE_TABLES: list[tuple[Any, str]] = [
    (CostSnapshot, "captured_at"),
    (ImportedCostRecord, "created_at"),
    (NormalizedCostDimension, "captured_at"),
    (CostPeriodSummary, "computed_at"),
    (CostAllocationSnapshot, "captured_at"),
]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _cutoff_date(hot_months: int) -> datetime:
    """Return the UTC datetime before which rows are considered cold."""
    now = _utcnow()
    # Subtract hot_months months (approximate: 30 days per month)
    return now - timedelta(days=hot_months * 30)


# ---------------------------------------------------------------------------
# OCI Object Storage helpers
# ---------------------------------------------------------------------------

def _build_object_storage_client(config: "Config") -> oci.object_storage.ObjectStorageClient:  # type: ignore[name-defined]
    """Build an OCI Object Storage client using the SDK config file or env vars."""
    oci_config_file = config.oci_config_file
    oci_profile = config.oci_profile or "DEFAULT"

    if oci_config_file and os.path.isfile(oci_config_file):
        oci_cfg = oci.config.from_file(oci_config_file, oci_profile)
    else:
        # Fallback: build config dict from individual env vars (same approach as auth in ai-service.ts)
        oci_cfg = {
            "tenancy": os.environ.get("OCI_TENANCY_OCID", ""),
            "user": os.environ.get("OCI_USER_OCID", ""),
            "fingerprint": os.environ.get("OCI_FINGERPRINT", ""),
            "region": config.oci_region,
            "key_content": os.environ.get("OCI_PRIVATE_KEY", "").replace("\\n", "\n"),
        }
        key_path = os.environ.get("OCI_PRIVATE_KEY_PATH", "").strip()
        if not oci_cfg["key_content"] and key_path:
            oci_cfg["key_file"] = os.path.expanduser(key_path)

    oci.config.validate_config(oci_cfg)
    return oci.object_storage.ObjectStorageClient(oci_cfg)


def _upload_ndjson(
    client: oci.object_storage.ObjectStorageClient,
    namespace: str,
    bucket_name: str,
    object_name: str,
    rows: list[dict],
) -> None:
    """Serialize rows to NDJSON and PUT to OCI Object Storage."""
    ndjson_bytes = "\n".join(json.dumps(r, default=str) for r in rows).encode("utf-8")
    client.put_object(
        namespace_name=namespace,
        bucket_name=bucket_name,
        object_name=object_name,
        put_object_body=io.BytesIO(ndjson_bytes),
        content_type="application/x-ndjson",
        content_length=len(ndjson_bytes),
    )
    logger.info("Archived %d rows → oci://%s/%s", len(rows), bucket_name, object_name)


# ---------------------------------------------------------------------------
# Core archive-and-purge routine
# ---------------------------------------------------------------------------

def _serialize_row(row) -> dict:
    """Convert an ORM row to a plain dict (handles JSON text columns transparently)."""
    d: dict = {}
    for col in row.__table__.columns:
        val = getattr(row, col.name)
        if isinstance(val, datetime):
            val = val.isoformat()
        d[col.name] = val
    return d


def archive_and_purge_table(
    db: Session,
    client: oci.object_storage.ObjectStorageClient,
    namespace: str,
    bucket_name: str,
    model: Any,
    ts_column: str,
    cutoff: datetime,
    batch_size: int = 1000,
) -> int:
    """Archive rows older than *cutoff* from *model* to OCI, then delete them.

    Returns the total number of rows archived/deleted.
    """
    table_name = model.__tablename__
    ts_attr = getattr(model, ts_column)
    total = 0
    run_ts = _utcnow().strftime("%Y%m%dT%H%M%SZ")
    date_prefix = _utcnow().strftime("%Y-%m-%d")

    while True:
        rows = (
            db.query(model)
            .filter(ts_attr < cutoff)
            .limit(batch_size)
            .all()
        )
        if not rows:
            break

        serialized = [_serialize_row(r) for r in rows]
        object_name = f"archive/{table_name}/{date_prefix}/{table_name}-{run_ts}-{total}.ndjson"
        _upload_ndjson(client, namespace, bucket_name, object_name, serialized)

        ids = [r.id for r in rows]
        db.query(model).filter(model.id.in_(ids)).delete(synchronize_session=False)
        db.commit()
        total += len(rows)
        logger.info("Purged %d rows from %s (total so far: %d)", len(rows), table_name, total)

    return total


def run_retention(config: "Config") -> dict:  # type: ignore[name-defined]
    """Entry point called by the scheduler in app.py.

    Returns a summary dict with counts per table.
    """
    from .config import Config  # local import to avoid circular

    if not config.retention_enabled:
        logger.debug("Retention is disabled; skipping.")
        return {"skipped": True}

    bucket = config.oci_archive_bucket
    namespace = config.oci_archive_namespace
    if not bucket or not namespace:
        logger.warning(
            "Retention enabled but OCI_ARCHIVE_BUCKET or OCI_ARCHIVE_NAMESPACE not set; skipping."
        )
        return {"skipped": True, "reason": "bucket/namespace not configured"}

    cutoff = _cutoff_date(config.retention_hot_months)
    logger.info(
        "Starting retention run: archiving rows older than %s (hot_months=%d)",
        cutoff.date(),
        config.retention_hot_months,
    )

    client = _build_object_storage_client(config)
    summary: dict[str, int] = {}

    db: Session = SessionLocal()
    try:
        for model, ts_col in _ARCHIVABLE_TABLES:
            table_name = model.__tablename__
            # Skip tables that don't have the expected column (safety guard)
            if not hasattr(model, ts_col):
                logger.warning("Skipping %s: no column %s", table_name, ts_col)
                continue
            count = archive_and_purge_table(
                db=db,
                client=client,
                namespace=namespace,
                bucket_name=bucket,
                model=model,
                ts_column=ts_col,
                cutoff=cutoff,
            )
            summary[table_name] = count
    finally:
        db.close()

    logger.info("Retention run complete: %s", summary)
    return summary


# ---------------------------------------------------------------------------
# Archive reader — used by the cost-trend endpoint to serve data > 90 days
# ---------------------------------------------------------------------------

def fetch_archived_period_summaries(
    config: "Config",
    org_id: int,
    period_start_from: datetime,
    period_start_to: datetime,
) -> list[dict]:
    """Return deserialized CostPeriodSummary rows from OCI Object Storage.

    Only rows whose ``organization_id`` matches *org_id* and whose
    ``period_start`` falls in [period_start_from, period_start_to) are returned.
    The caller is responsible for deduplication.

    Returns an empty list when archival is not configured.
    """
    bucket = config.oci_archive_bucket
    namespace = config.oci_archive_namespace
    if not bucket or not namespace:
        return []

    try:
        client = _build_object_storage_client(config)
    except Exception as exc:
        logger.warning("Cannot build OCI client for archive read: %s", exc)
        return []

    # List all objects under the summaries prefix
    try:
        list_resp = client.list_objects(
            namespace_name=namespace,
            bucket_name=bucket,
            prefix=_ARCHIVE_SUMMARIES_PREFIX,
            limit=1000,
        )
        object_names = [obj.name for obj in list_resp.data.objects]
    except Exception as exc:
        logger.warning("Failed to list archive objects: %s", exc)
        return []

    results: list[dict] = []
    for obj_name in object_names:
        try:
            get_resp = client.get_object(
                namespace_name=namespace,
                bucket_name=bucket,
                object_name=obj_name,
            )
            content = get_resp.data.content.decode("utf-8")
            for line in content.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if row.get("organization_id") != org_id:
                    continue
                ps_raw = row.get("period_start")
                if ps_raw is None:
                    continue
                # Normalize to datetime for comparison
                try:
                    ps = datetime.fromisoformat(str(ps_raw).replace("Z", ""))
                except ValueError:
                    continue
                if period_start_from <= ps < period_start_to:
                    results.append(row)
        except Exception as exc:
            logger.warning("Skipping archive object %s: %s", obj_name, exc)
            continue

    logger.info(
        "Archive read: found %d rows for org=%d in [%s, %s)",
        len(results),
        org_id,
        period_start_from.date(),
        period_start_to.date(),
    )
    return results
