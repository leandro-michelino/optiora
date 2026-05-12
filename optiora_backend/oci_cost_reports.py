"""OCI Cost Reports ingestion into monthly trend summaries.

OCI Cost Reports are generated into an Oracle-managed Object Storage namespace
(`bling`) and are the durable source for historical OCI billing trends. This
module reads those CSV/GZIP reports, aggregates monthly provider summaries, and
writes CostPeriodSummary rows used by the dashboard trend endpoint.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable

from sqlalchemy.orm import Session

from .config import Config
from .orm_models import (
    CostPeriodSummary,
    OciCostReportIngestion,
    Organization,
    SessionLocal,
    _utcnow,
    ensure_public_workspace,
)

logger = logging.getLogger(__name__)

DATE_COLUMNS = [
    "lineItem/intervalUsageStart",
    "intervalUsageStart",
    "timeUsageStarted",
    "usageStartTime",
    "usageStart",
    "startTime",
    "startDate",
    "usage_start_time",
]
COST_COLUMNS = [
    "cost/myCost",
    "myCost",
    "computedAmount",
    "computed_amount",
    "netCost",
    "cost",
    "amount",
    "billedCost",
    "billed_cost",
]
SERVICE_COLUMNS = [
    "product/service",
    "service",
    "serviceName",
    "productName",
    "sku/service",
]
REGION_COLUMNS = [
    "product/region",
    "region",
    "regionName",
    "availabilityDomain",
]
TEAM_COLUMNS = [
    "tags/team",
    "tag/team",
    "freeformTags/team",
    "freeformTags.Team",
    "freeform_tags/team",
    "team",
]
ENV_COLUMNS = [
    "tags/env",
    "tags/environment",
    "tag/environment",
    "freeformTags/environment",
    "freeformTags.Environment",
    "environment",
    "env",
]


@dataclass
class MonthlyBucket:
    period_start: datetime
    period_end: datetime
    total: float = 0.0
    mapped: float = 0.0
    unmapped: float = 0.0
    record_count: int = 0
    services: dict[str, float] = field(default_factory=dict)
    regions: dict[str, float] = field(default_factory=dict)


@dataclass
class ObjectResult:
    object_name: str
    rows_processed: int = 0
    rows_skipped: int = 0
    periods: set[str] = field(default_factory=set)
    error: str | None = None


def _normalize_column(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _header_lookup(fieldnames: Iterable[str] | None) -> dict[str, str]:
    return {_normalize_column(name): name for name in (fieldnames or [])}


def _pick_header(headers: dict[str, str], candidates: list[str]) -> str | None:
    for candidate in candidates:
        key = _normalize_column(candidate)
        if key in headers:
            return headers[key]
    return None


def _value(row: dict[str, str], column: str | None) -> str:
    if not column:
        return ""
    return str(row.get(column) or "").strip()


def _parse_float(value: str) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None
    text = text.replace(",", "")
    if text.startswith("(") and text.endswith(")"):
        text = f"-{text[1:-1]}"
    try:
        return float(text)
    except ValueError:
        return None


def _parse_datetime(value: str) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    text = text.replace(" UTC", "Z")
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        try:
            parsed = datetime.strptime(text[:10], "%Y-%m-%d")
        except ValueError:
            return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _month_bounds(value: datetime) -> tuple[datetime, datetime]:
    start = datetime(value.year, value.month, 1)
    if value.month == 12:
        next_month = datetime(value.year + 1, 1, 1)
    else:
        next_month = datetime(value.year, value.month + 1, 1)
    return start, next_month.replace(microsecond=0)


def _month_key(value: datetime) -> str:
    return value.strftime("%Y-%m")


def _lookback_start(months: int) -> datetime:
    now = _utcnow()
    year = now.year
    month = now.month - max(1, months) + 1
    while month <= 0:
        month += 12
        year -= 1
    return datetime(year, month, 1)


def _text_from_object(object_name: str, payload: bytes) -> io.StringIO:
    data = gzip.decompress(payload) if object_name.endswith(".gz") else payload
    return io.StringIO(data.decode("utf-8-sig", errors="replace"))


def _load_oci_config(config: Config) -> tuple[dict[str, Any], str]:
    if not config.oci_config_file:
        raise RuntimeError("OCI_CONFIG_FILE is required for OCI Cost Reports ingestion.")
    try:
        import oci
    except ImportError as exc:
        raise RuntimeError("OCI SDK is not installed.") from exc

    oci_config = oci.config.from_file(config.oci_config_file, config.oci_profile or "DEFAULT")
    if config.oci_region:
        oci_config["region"] = config.oci_region
    tenancy_id = str(oci_config.get("tenancy") or "").strip()
    if not tenancy_id:
        raise RuntimeError("OCI tenancy OCID is missing from OCI config.")
    return oci_config, tenancy_id


def _home_region_config(oci_config: dict[str, Any], config: Config) -> dict[str, Any]:
    try:
        import oci
    except ImportError as exc:
        raise RuntimeError("OCI SDK is not installed.") from exc

    identity = oci.identity.IdentityClient(oci_config)
    tenancy_id = str(oci_config.get("tenancy") or "")
    subscriptions = identity.list_region_subscriptions(tenancy_id=tenancy_id).data or []
    home_region = next(
        (str(item.region_name) for item in subscriptions if bool(getattr(item, "is_home_region", False))),
        "",
    )
    if not home_region:
        home_region = config.oci_region or str(oci_config.get("region") or "")
    next_config = dict(oci_config)
    next_config["region"] = home_region
    return next_config


def _list_cost_report_objects(client: Any, namespace: str, bucket: str, prefix: str, max_objects: int) -> list[Any]:
    objects: list[Any] = []
    start = None
    while True:
        response = client.list_objects(
            namespace_name=namespace,
            bucket_name=bucket,
            prefix=prefix,
            fields="name,size,md5,timeCreated",
            limit=1000,
            start=start,
        )
        objects.extend(response.data.objects or [])
        start = getattr(response.data, "next_start_with", None)
        if not start:
            break
    objects = [obj for obj in objects if str(getattr(obj, "name", "")).endswith((".csv", ".csv.gz"))]
    objects.sort(
        key=lambda obj: (
            str(getattr(obj, "time_created", "") or ""),
            str(getattr(obj, "name", "") or ""),
        ),
        reverse=True,
    )
    return objects[:max_objects]


def _parse_report_object(object_name: str, payload: bytes) -> tuple[ObjectResult, dict[tuple[str | None, str | None, str], MonthlyBucket]]:
    result = ObjectResult(object_name=object_name)
    buckets: dict[tuple[str | None, str | None, str], MonthlyBucket] = {}
    reader = csv.DictReader(_text_from_object(object_name, payload))
    headers = _header_lookup(reader.fieldnames)
    date_col = _pick_header(headers, DATE_COLUMNS)
    cost_col = _pick_header(headers, COST_COLUMNS)
    service_col = _pick_header(headers, SERVICE_COLUMNS)
    region_col = _pick_header(headers, REGION_COLUMNS)
    team_col = _pick_header(headers, TEAM_COLUMNS)
    env_col = _pick_header(headers, ENV_COLUMNS)

    if not date_col or not cost_col:
        raise RuntimeError(
            f"Report {object_name} does not contain recognizable usage date and cost columns."
        )

    for row in reader:
        started_at = _parse_datetime(_value(row, date_col))
        cost = _parse_float(_value(row, cost_col))
        if started_at is None or cost is None:
            result.rows_skipped += 1
            continue

        period_start, period_end = _month_bounds(started_at)
        period = _month_key(period_start)
        service = _value(row, service_col) or "Unknown"
        region = _value(row, region_col) or "global"
        team = _value(row, team_col) or None
        environment = _value(row, env_col) or None
        bucket_key = (team, environment, period)
        bucket = buckets.get(bucket_key)
        if bucket is None:
            bucket = MonthlyBucket(period_start=period_start, period_end=period_end)
            buckets[bucket_key] = bucket

        bucket.total += cost
        bucket.record_count += 1
        bucket.services[service] = bucket.services.get(service, 0.0) + cost
        bucket.regions[region] = bucket.regions.get(region, 0.0) + cost
        if team or environment:
            bucket.mapped += cost
        else:
            bucket.unmapped += cost
        result.rows_processed += 1
        result.periods.add(period)

    return result, buckets


def _record_ingestion(
    db: Session,
    *,
    namespace: str,
    bucket: str,
    object_meta: Any,
    result: ObjectResult,
) -> None:
    now = _utcnow()
    object_name = str(getattr(object_meta, "name", result.object_name) or result.object_name)
    row = db.query(OciCostReportIngestion).filter(OciCostReportIngestion.object_name == object_name).first()
    if row is None:
        row = OciCostReportIngestion(
            object_name=object_name,
            namespace=namespace,
            bucket_name=bucket,
            first_seen_at=now,
        )
        db.add(row)

    row.namespace = namespace
    row.bucket_name = bucket
    row.object_size = int(getattr(object_meta, "size", 0) or 0)
    row.object_etag = str(getattr(object_meta, "md5", "") or "")
    created = getattr(object_meta, "time_created", None)
    if isinstance(created, datetime):
        row.object_time_created = created.astimezone(timezone.utc).replace(tzinfo=None) if created.tzinfo else created
    row.status = "failed" if result.error else "processed"
    row.rows_processed = int(result.rows_processed)
    row.rows_skipped = int(result.rows_skipped)
    row.periods_json = json.dumps(sorted(result.periods))
    row.error_message = result.error
    row.last_processed_at = now


def _rewrite_monthly_summaries(
    db: Session,
    *,
    organization_id: int,
    customer_id: str,
    buckets: dict[tuple[str | None, str | None, str], MonthlyBucket],
) -> int:
    periods = {bucket.period_start for bucket in buckets.values()}
    if not periods:
        return 0

    (
        db.query(CostPeriodSummary)
        .filter(
            CostPeriodSummary.organization_id == organization_id,
            CostPeriodSummary.period_type == "monthly",
            CostPeriodSummary.provider == "oci",
            CostPeriodSummary.period_start.in_(periods),
        )
        .delete(synchronize_session=False)
    )

    computed_at = _utcnow()
    rows_written = 0
    for (team, environment, _period), bucket in sorted(
        buckets.items(),
        key=lambda item: (
            item[0][2],
            item[0][0] or "",
            item[0][1] or "",
        ),
    ):
        top_services = dict(
            sorted(
                ((service, round(cost, 2)) for service, cost in bucket.services.items()),
                key=lambda item: item[1],
                reverse=True,
            )[:25]
        )
        db.add(
            CostPeriodSummary(
                organization_id=organization_id,
                customer_id=customer_id,
                period_type="monthly",
                period_start=bucket.period_start,
                period_end=bucket.period_end,
                provider="oci",
                region=None,
                team=team,
                environment=environment,
                total_cost_usd=round(bucket.total, 2),
                mapped_cost_usd=round(bucket.mapped, 2),
                unmapped_cost_usd=round(bucket.unmapped, 2),
                record_count=bucket.record_count,
                service_breakdown_json=json.dumps(top_services),
                computed_at=computed_at,
            )
        )
        rows_written += 1

    return rows_written


def ingest_oci_cost_reports(
    *,
    config: Config | None = None,
    organization_id: int | None = None,
    lookback_months: int | None = None,
    max_objects: int | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    config = config or Config()
    oci_config, tenancy_id = _load_oci_config(config)
    bucket = config.oci_cost_reports_bucket.strip() or tenancy_id
    namespace = config.oci_cost_reports_namespace.strip() or "bling"
    prefix = config.oci_cost_reports_prefix.strip() or "reports/cost-csv/"
    lookback_count = max(1, int(lookback_months or config.oci_cost_reports_lookback_months or 13))
    max_count = max(1, int(max_objects or config.oci_cost_reports_max_objects or 500))

    try:
        import oci
    except ImportError as exc:
        raise RuntimeError("OCI SDK is not installed.") from exc

    object_config = _home_region_config(oci_config, config)
    object_client = oci.object_storage.ObjectStorageClient(object_config)
    objects = _list_cost_report_objects(object_client, namespace, bucket, prefix, max_count)

    db = SessionLocal()
    try:
        if organization_id is None:
            _, organization = ensure_public_workspace(db)
            organization_id = int(organization.id)
        else:
            organization = db.query(Organization).filter(Organization.id == int(organization_id)).first()
            if organization is None:
                raise RuntimeError(f"Organization {organization_id} was not found.")
        customer_id = f"org-{organization_id}"

        merged: dict[tuple[str | None, str | None, str], MonthlyBucket] = {}
        object_results: list[ObjectResult] = []
        for object_meta in objects:
            object_name = str(getattr(object_meta, "name", "") or "")
            result = ObjectResult(object_name=object_name)
            try:
                response = object_client.get_object(namespace, bucket, object_name)
                payload = response.data.content
                result, buckets = _parse_report_object(object_name, payload)
                for key, bucket_value in buckets.items():
                    current = merged.get(key)
                    if current is None:
                        current = MonthlyBucket(
                            period_start=bucket_value.period_start,
                            period_end=bucket_value.period_end,
                        )
                        merged[key] = current
                    current.total += bucket_value.total
                    current.mapped += bucket_value.mapped
                    current.unmapped += bucket_value.unmapped
                    current.record_count += bucket_value.record_count
                    for service, cost in bucket_value.services.items():
                        current.services[service] = current.services.get(service, 0.0) + cost
                    for region, cost in bucket_value.regions.items():
                        current.regions[region] = current.regions.get(region, 0.0) + cost
            except Exception as exc:
                logger.exception("Failed to process OCI cost report object %s", object_name)
                result.error = str(exc)[:2000]
            object_results.append(result)
            _record_ingestion(db, namespace=namespace, bucket=bucket, object_meta=object_meta, result=result)

        cutoff = _lookback_start(lookback_count)
        merged = {
            key: bucket
            for key, bucket in merged.items()
            if bucket.period_start >= cutoff
        }

        rows_written = 0 if dry_run else _rewrite_monthly_summaries(
            db,
            organization_id=int(organization_id),
            customer_id=customer_id,
            buckets=merged,
        )
        if dry_run:
            db.rollback()
        else:
            db.commit()

        periods = sorted({period for result in object_results for period in result.periods})
        return {
            "namespace": namespace,
            "bucket": bucket,
            "prefix": prefix,
            "objects_seen": len(objects),
            "objects_processed": sum(1 for result in object_results if not result.error),
            "objects_failed": sum(1 for result in object_results if result.error),
            "rows_processed": sum(result.rows_processed for result in object_results),
            "rows_skipped": sum(result.rows_skipped for result in object_results),
            "periods": periods,
            "summaries_written": rows_written,
            "organization_id": int(organization_id),
            "dry_run": dry_run,
            "lookback_months": lookback_count,
        }
    finally:
        db.close()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Ingest OCI Cost Reports into OptiOra summaries.")
    parser.add_argument("--once", action="store_true", help="Run one ingestion cycle and exit.")
    parser.add_argument("--organization-id", type=int, default=None)
    parser.add_argument("--lookback-months", type=int, default=None)
    parser.add_argument("--max-objects", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    summary = ingest_oci_cost_reports(
        organization_id=args.organization_id,
        lookback_months=args.lookback_months,
        max_objects=args.max_objects,
        dry_run=args.dry_run,
    )
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
