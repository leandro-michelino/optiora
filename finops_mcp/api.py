"""
REST API routes for OptiOra.

Handles:
- Credential validation/storage
- Scanning permissions and progress
- Dashboard data endpoints
"""

import csv
import io
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional, Union
from uuid import uuid4
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .auth_routes import get_current_membership, get_current_user
from .credentials import CredentialManager, CredentialStatus, CredentialValidator
from .config import Config
from .notifications import evaluate_budget_alert
from .access_control import require_role
from .orm_models import (
    AlertEvent,
    AuditLog,
    CostSnapshot,
    ImportedCostRecord,
    ProviderAccount,
    ProviderAccountLink,
    ProviderAccountSnapshot,
    ScanRunRecord,
    ScanningPermissionRecord,
    SessionLocal,
    User,
    UserOrganization,
    UserRole,
    get_db,
)
from .scanning import ScanningManager, ScanningState
from .tools import anomalies, aws_costs, finops_analytics, recommendations
from .tools import azure_costs, gcp_costs, oci_costs
from . import __version__

logger = logging.getLogger(__name__)
_scheduler_running = False


def _utcnow() -> datetime:
    """Return current naive UTC datetime. Replaces deprecated _utcnow()."""
    return datetime.now(timezone.utc).replace(tzinfo=None)

router = APIRouter(prefix="/api/v1", tags=["api"])
SUPPORTED_COST_IMPORT_PROVIDERS = {"aws", "azure", "gcp", "oci"}


class AWSCredentialInput(BaseModel):
    provider: Literal["aws"]
    access_key_id: str
    secret_access_key: str
    region: Optional[str] = "us-east-1"


class AzureCredentialInput(BaseModel):
    provider: Literal["azure"]
    subscription_id: str
    tenant_id: str
    client_id: str
    client_secret: str


class GCPCredentialInput(BaseModel):
    provider: Literal["gcp"]
    project_id: str
    service_account_json: Union[Dict[str, Any], str]


class OCICredentialInput(BaseModel):
    provider: Literal["oci"]
    config_file: str
    profile: Optional[str] = "DEFAULT"


CredentialInput = Union[
    AWSCredentialInput,
    AzureCredentialInput,
    GCPCredentialInput,
    OCICredentialInput,
]


class CredentialResponse(BaseModel):
    provider: str
    is_valid: bool
    message: str
    test_cost_usd: Optional[float] = None
    tested_at: Optional[str] = None
    error_details: Optional[str] = None


class ScanningApprovalRequest(BaseModel):
    customer_id: Optional[str] = None
    auto_remediate: bool = False
    scan_frequency: str = "daily"
    notification_email: Optional[str] = None


class ScanningPermissionResponse(BaseModel):
    customer_id: str
    organization_id: int
    state: str
    providers: List[str]
    scan_frequency: str
    auto_remediate: bool
    created_at: str
    approved_at: Optional[str] = None


class StartScanRequest(BaseModel):
    customer_id: Optional[str] = None
    providers: Optional[List[str]] = None


class ScanProgressResponse(BaseModel):
    scan_id: str
    customer_id: str
    organization_id: int
    state: str
    progress: int = 0
    providers: List[str]
    started_at: datetime
    completed_at: Optional[datetime] = None
    total_resources: int = 0
    anomalies_found: int = 0
    savings_identified: float = 0.0


class ProviderDiagnostic(BaseModel):
    provider: str
    configured: bool
    required_settings: List[str]
    missing_settings: List[str]
    recommendation: str


class ScanHistoryItem(BaseModel):
    scan_id: str
    customer_id: str
    organization_id: int
    state: str
    providers: List[str]
    started_at: datetime
    completed_at: Optional[datetime] = None
    total_resources: int = 0
    anomalies_found: int = 0
    savings_identified: float = 0.0


class ScanDiffEntry(BaseModel):
    provider: str
    current_cost_usd: float
    previous_cost_usd: float
    delta_cost_usd: float
    delta_percent: Optional[float] = None
    current_anomalies: int
    previous_anomalies: int


class ScanDiffResponse(BaseModel):
    organization_id: int
    current_scan_id: str
    previous_scan_id: Optional[str] = None
    total_current_cost_usd: float
    total_previous_cost_usd: float
    total_delta_cost_usd: float
    entries: List[ScanDiffEntry]


class ProviderAccountRollupItem(BaseModel):
    account_id: int
    provider: str
    account_identifier: str
    account_name: str
    account_type: str
    depth: int = 0
    parent_account_id: Optional[int] = None
    parent_account_identifier: Optional[str] = None
    direct_cost_usd: float
    rolled_up_cost_usd: float
    direct_savings_identified_usd: float
    rolled_up_savings_identified_usd: float
    direct_anomalies_count: int
    rolled_up_anomalies_count: int
    direct_service_count: int
    rolled_up_service_count: int
    child_count: int
    scan_id: Optional[str] = None
    captured_at: Optional[str] = None


class ProviderAccountRollupResponse(BaseModel):
    organization_id: int
    customer_id: str
    provider: Optional[str] = None
    scan_id: Optional[str] = None
    generated_at: str
    total_direct_cost_usd: float
    total_rolled_up_cost_usd: float
    items: List[ProviderAccountRollupItem]


class SchedulerCounters(BaseModel):
    total: int
    success: int
    failure: int


class SchedulerTimelineItem(BaseModel):
    id: str
    event_type: str
    state: str
    title: str
    detail: str
    created_at: str


class SchedulerStatusResponse(BaseModel):
    organization_id: int
    customer_id: str
    scheduler_enabled: bool
    scheduler_running: bool
    permission_state: str
    scan_frequency: str
    next_run_at: Optional[str] = None
    next_run_eta_seconds: Optional[int] = None
    last_success_at: Optional[str] = None
    last_failure_at: Optional[str] = None
    counters: SchedulerCounters
    timeline: List[SchedulerTimelineItem]


class ExternalAWSAnomalyIngestRequest(BaseModel):
    events: List[Dict[str, Any]]


class ImportedCostUploadResponse(BaseModel):
    organization_id: int
    customer_id: str
    upload_id: str
    filename: str
    rows_imported: int
    total_cost_usd: float
    providers: List[str]
    imported_at: datetime


class ImportedCostSummaryResponse(BaseModel):
    organization_id: int
    customer_id: str
    has_data: bool
    upload_id: Optional[str] = None
    source_filename: Optional[str] = None
    rows_imported: int = 0
    total_cost_usd: float = 0.0
    providers: List[str] = []
    last_imported_at: Optional[datetime] = None


def get_credential_manager(db: Session = Depends(get_db)) -> CredentialManager:
    return CredentialManager(db)


def get_scanning_manager(db: Session = Depends(get_db)) -> ScanningManager:
    return ScanningManager(db)


def _parse_optional_datetime(value: Optional[str], field_name: str, line_number: int) -> Optional[datetime]:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_name} at CSV line {line_number}. Use ISO date or datetime.",
        ) from exc


def _parse_required_float(value: Optional[str], field_name: str, line_number: int) -> float:
    text = str(value or "").strip()
    if not text:
        raise HTTPException(
            status_code=400,
            detail=f"Missing {field_name} at CSV line {line_number}.",
        )
    try:
        return float(text)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_name} at CSV line {line_number}.",
        ) from exc


def _parse_optional_datetime_value(
    value: Optional[str],
    field_name: str,
    line_number: int,
) -> tuple[Optional[datetime], Optional[str]]:
    text = str(value or "").strip()
    if not text:
        return None, None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")), None
    except ValueError:
        return None, f"Invalid {field_name} at CSV line {line_number}. Use ISO date or datetime."


def _parse_required_float_value(
    value: Optional[str],
    field_name: str,
    line_number: int,
) -> tuple[Optional[float], Optional[str]]:
    text = str(value or "").strip()
    if not text:
        return None, f"Missing {field_name} at CSV line {line_number}."
    try:
        parsed = float(text)
    except ValueError:
        return None, f"Invalid {field_name} at CSV line {line_number}."
    if parsed < 0:
        return None, f"Negative {field_name} at CSV line {line_number}. Cost values must be zero or greater."
    return parsed, None


def _csv_escape(value: Any) -> str:
    return f"\"{str(value if value is not None else '').replace('\"', '\"\"')}\""


def _csv_response(filename: str, header: List[str], rows: List[List[Any]]) -> Response:
    lines = [",".join(header)]
    for row in rows:
        lines.append(",".join(_csv_escape(cell) for cell in row))
    return Response(
        "\n".join(lines),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _spreadsheet_xml_response(filename: str, sheet_name: str, rows: List[List[Any]]) -> Response:
    def _cell_xml(value: Any) -> str:
        if value is None or value == "":
            return '<Cell><Data ss:Type="String"></Data></Cell>'
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return f'<Cell><Data ss:Type="Number">{value}</Data></Cell>'
        return f'<Cell><Data ss:Type="String">{xml_escape(str(value))}</Data></Cell>'

    row_xml = "".join(
        "<Row>" + "".join(_cell_xml(cell) for cell in row) + "</Row>"
        for row in rows
    )
    workbook = (
        '<?xml version="1.0"?>'
        '<?mso-application progid="Excel.Sheet"?>'
        '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" '
        'xmlns:o="urn:schemas-microsoft-com:office:office" '
        'xmlns:x="urn:schemas-microsoft-com:office:excel" '
        'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" '
        'xmlns:html="http://www.w3.org/TR/REC-html40">'
        f'<Worksheet ss:Name="{xml_escape(sheet_name[:31] or "Sheet1")}"><Table>{row_xml}</Table></Worksheet>'
        "</Workbook>"
    )
    return Response(
        workbook,
        media_type="application/vnd.ms-excel",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _imported_cost_summary(rows: List[ImportedCostRecord]) -> Dict[str, Any]:
    providers = sorted({row.provider for row in rows})
    latest_imported_at = max((row.created_at for row in rows), default=None)
    return {
        "rows_imported": len(rows),
        "total_cost_usd": round(sum(float(row.cost_usd or 0.0) for row in rows), 2),
        "providers": providers,
        "last_imported_at": latest_imported_at,
        "upload_id": rows[0].upload_id if rows else None,
        "source_filename": rows[0].source_filename if rows else None,
    }


def _get_imported_cost_rows(
    db: Session,
    organization_id: int,
    customer_id: str,
    cloud_provider: str = "all",
) -> List[ImportedCostRecord]:
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


def _materialize_rollup_items(nodes: Dict[int, Dict[str, Any]]) -> List[ProviderAccountRollupItem]:
    children_by_parent: Dict[Optional[int], List[int]] = {}
    for node_id, node in nodes.items():
        children_by_parent.setdefault(node.get("parent_account_id"), []).append(node_id)

    for child_ids in children_by_parent.values():
        child_ids.sort(key=lambda item_id: (
            str(nodes[item_id].get("provider") or ""),
            str(nodes[item_id].get("account_name") or ""),
            str(nodes[item_id].get("account_identifier") or ""),
        ))

    def _walk(node_id: int, depth: int) -> tuple[float, float, int, int, int]:
        node = nodes[node_id]
        child_ids = children_by_parent.get(node_id, [])
        child_count = len(child_ids)
        direct_cost = float(node.get("direct_cost_usd") or 0.0)
        direct_savings = float(node.get("direct_savings_identified_usd") or 0.0)
        direct_anomalies = int(node.get("direct_anomalies_count") or 0)
        direct_services = int(node.get("direct_service_count") or 0)

        # Grouping nodes represent aggregated structure, not additive direct spend.
        if child_count > 0 and str(node.get("account_type") or "") in {
            "provider",
            "management_group",
            "organization",
            "folder",
            "tenancy",
        }:
            direct_cost = 0.0
            direct_savings = 0.0
            direct_anomalies = 0
            direct_services = 0

        rolled_cost = direct_cost
        rolled_savings = direct_savings
        rolled_anomalies = direct_anomalies
        rolled_services = direct_services
        total_descendants = child_count

        node["depth"] = depth
        node["child_count"] = child_count
        node["direct_cost_usd"] = round(direct_cost, 2)
        node["direct_savings_identified_usd"] = round(direct_savings, 2)
        node["direct_anomalies_count"] = direct_anomalies
        node["direct_service_count"] = direct_services

        for child_id in child_ids:
            child_cost, child_savings, child_anomalies, child_services, descendant_count = _walk(child_id, depth + 1)
            rolled_cost += child_cost
            rolled_savings += child_savings
            rolled_anomalies += child_anomalies
            rolled_services += child_services
            total_descendants += descendant_count

        node["rolled_up_cost_usd"] = round(rolled_cost, 2)
        node["rolled_up_savings_identified_usd"] = round(rolled_savings, 2)
        node["rolled_up_anomalies_count"] = rolled_anomalies
        node["rolled_up_service_count"] = rolled_services
        node["descendant_count"] = total_descendants
        return rolled_cost, rolled_savings, rolled_anomalies, rolled_services, total_descendants

    root_ids = children_by_parent.get(None, [])
    for root_id in root_ids:
        _walk(root_id, 0)

    ordered_ids: List[int] = []

    def _append(node_id: int) -> None:
        ordered_ids.append(node_id)
        for child_id in children_by_parent.get(node_id, []):
            _append(child_id)

    for root_id in root_ids:
        _append(root_id)

    return [
        ProviderAccountRollupItem(
            account_id=node_id,
            provider=str(nodes[node_id].get("provider") or ""),
            account_identifier=str(nodes[node_id].get("account_identifier") or ""),
            account_name=str(nodes[node_id].get("account_name") or ""),
            account_type=str(nodes[node_id].get("account_type") or "account"),
            depth=int(nodes[node_id].get("depth") or 0),
            parent_account_id=nodes[node_id].get("parent_account_id"),
            parent_account_identifier=nodes[node_id].get("parent_account_identifier"),
            direct_cost_usd=float(nodes[node_id].get("direct_cost_usd") or 0.0),
            rolled_up_cost_usd=float(nodes[node_id].get("rolled_up_cost_usd") or 0.0),
            direct_savings_identified_usd=float(nodes[node_id].get("direct_savings_identified_usd") or 0.0),
            rolled_up_savings_identified_usd=float(nodes[node_id].get("rolled_up_savings_identified_usd") or 0.0),
            direct_anomalies_count=int(nodes[node_id].get("direct_anomalies_count") or 0),
            rolled_up_anomalies_count=int(nodes[node_id].get("rolled_up_anomalies_count") or 0),
            direct_service_count=int(nodes[node_id].get("direct_service_count") or 0),
            rolled_up_service_count=int(nodes[node_id].get("rolled_up_service_count") or 0),
            child_count=int(nodes[node_id].get("child_count") or 0),
            scan_id=nodes[node_id].get("scan_id"),
            captured_at=nodes[node_id].get("captured_at"),
        )
        for node_id in ordered_ids
    ]


def _build_rollups_from_imported_rows(
    rows: List[ImportedCostRecord],
    organization_id: int,
    customer_id: str,
    provider: Optional[str] = None,
) -> ProviderAccountRollupResponse:
    next_synthetic_id = -1

    def _synthetic_id() -> int:
        nonlocal next_synthetic_id
        current = next_synthetic_id
        next_synthetic_id -= 1
        return current

    nodes: Dict[int, Dict[str, Any]] = {}
    provider_root_ids: Dict[str, int] = {}
    account_nodes: Dict[tuple[str, str], int] = {}
    latest_imported_at = max((row.created_at for row in rows), default=None)

    def _normalized_account_type(raw_value: Optional[str], default: str) -> str:
        value = str(raw_value or "").strip().lower().replace(" ", "_")
        return value or default

    def _ensure_node(
        *,
        provider_key: str,
        identifier: str,
        account_name: str,
        account_type: str,
        parent_account_id: Optional[int],
    ) -> int:
        node_key = (provider_key, identifier)
        node_id = account_nodes.get(node_key)
        if node_id is None:
            node_id = _synthetic_id()
            account_nodes[node_key] = node_id
            nodes[node_id] = {
                "provider": provider_key,
                "account_identifier": identifier,
                "account_name": account_name,
                "account_type": account_type,
                "parent_account_id": parent_account_id,
                "parent_account_identifier": (
                    nodes[parent_account_id]["account_identifier"]
                    if parent_account_id in nodes
                    else None
                ),
                "direct_cost_usd": 0.0,
                "direct_savings_identified_usd": 0.0,
                "direct_anomalies_count": 0,
                "direct_service_count": 0,
                "scan_id": None,
                "captured_at": latest_imported_at.isoformat() if latest_imported_at else None,
                "_services": set(),
            }
            return node_id

        node = nodes[node_id]
        if account_name and (
            not str(node.get("account_name") or "").strip()
            or str(node.get("account_name") or "").strip() == identifier
        ):
            node["account_name"] = account_name
        if (
            account_type
            and str(node.get("account_type") or "").strip() in {"", "account", "group"}
            and account_type not in {"", "account", "group"}
        ):
            node["account_type"] = account_type
        if parent_account_id is not None and node.get("parent_account_id") is None:
            node["parent_account_id"] = parent_account_id
            node["parent_account_identifier"] = (
                nodes[parent_account_id]["account_identifier"]
                if parent_account_id in nodes
                else None
            )
        return node_id

    for row in rows:
        provider_key = str(row.provider or "").strip().lower()
        if not provider_key:
            continue
        root_id = provider_root_ids.get(provider_key)
        if root_id is None:
            root_id = _synthetic_id()
            provider_root_ids[provider_key] = root_id
            nodes[root_id] = {
                "provider": provider_key,
                "account_identifier": f"{provider_key}:provider",
                "account_name": provider_key.upper(),
                "account_type": "provider",
                "parent_account_id": None,
                "parent_account_identifier": None,
                "direct_cost_usd": 0.0,
                "direct_savings_identified_usd": 0.0,
                "direct_anomalies_count": 0,
                "direct_service_count": 0,
                "scan_id": None,
                "captured_at": latest_imported_at.isoformat() if latest_imported_at else None,
            }

        identifier = str(row.account_identifier or row.account_name or "").strip()
        account_name = str(row.account_name or row.account_identifier or provider_key).strip()
        if not identifier:
            identifier = f"{provider_key}:unassigned"
            account_name = f"{provider_key.upper()} Unassigned"

        parent_identifier = str(row.parent_account_identifier or "").strip()
        parent_account_id: Optional[int] = root_id
        if parent_identifier:
            parent_account_id = _ensure_node(
                provider_key=provider_key,
                identifier=parent_identifier,
                account_name=parent_identifier,
                account_type="group",
                parent_account_id=root_id,
            )

        account_id = _ensure_node(
            provider_key=provider_key,
            identifier=identifier,
            account_name=account_name,
            account_type=_normalized_account_type(row.account_type, "account"),
            parent_account_id=parent_account_id,
        )
        nodes[account_id]["direct_cost_usd"] = round(float(nodes[account_id]["direct_cost_usd"]) + float(row.cost_usd or 0.0), 2)
        service_name = str(row.service_name or "").strip()
        if service_name:
            nodes[account_id].setdefault("_services", set()).add(service_name)

    for node in nodes.values():
        node["direct_service_count"] = len(node.get("_services", set()))
        node.pop("_services", None)

    items = _materialize_rollup_items(nodes)
    filtered_items = [item for item in items if provider is None or item.provider == provider]
    direct_total = round(sum(item.direct_cost_usd for item in filtered_items if item.depth > 0 or item.child_count == 0), 2)
    root_total = round(sum(item.rolled_up_cost_usd for item in filtered_items if item.depth == 0), 2)
    return ProviderAccountRollupResponse(
        organization_id=organization_id,
        customer_id=customer_id,
        provider=provider,
        scan_id=None,
        generated_at=_utcnow().isoformat(),
        total_direct_cost_usd=direct_total,
        total_rolled_up_cost_usd=root_total,
        items=filtered_items,
    )


def _parse_credential_payload(raw: Dict[str, Any]) -> CredentialInput:
    provider = str(raw.get("provider", "")).lower()
    if provider == "aws":
        return AWSCredentialInput(**raw)
    if provider == "azure":
        return AzureCredentialInput(**raw)
    if provider == "gcp":
        payload = dict(raw)
        if isinstance(payload.get("service_account_json"), str):
            payload["service_account_json"] = json.loads(payload["service_account_json"])
        return GCPCredentialInput(**payload)
    if provider == "oci":
        return OCICredentialInput(**raw)
    raise ValueError(f"Unsupported provider: {provider}")


def _run_validation(credential: CredentialInput) -> CredentialStatus:
    validator = CredentialValidator()
    if isinstance(credential, AWSCredentialInput):
        return validator.validate_aws(
            credential.access_key_id,
            credential.secret_access_key,
            credential.region or "us-east-1",
        )
    if isinstance(credential, AzureCredentialInput):
        return validator.validate_azure(
            credential.subscription_id,
            credential.tenant_id,
            credential.client_id,
            credential.client_secret,
        )
    if isinstance(credential, GCPCredentialInput):
        service_account_json = credential.service_account_json
        if isinstance(service_account_json, str):
            service_account_json = json.loads(service_account_json)
        return validator.validate_gcp(credential.project_id, service_account_json)
    if isinstance(credential, OCICredentialInput):
        return validator.validate_oci(
            credential.config_file,
            credential.profile or "DEFAULT",
        )
    raise ValueError("Unsupported credential payload")


def _safe_json_load(raw: str, default: Dict[str, Any]) -> Dict[str, Any]:
    try:
        return json.loads(raw)
    except Exception:
        return default


def _customer_id_for_org(membership: UserOrganization) -> str:
    """Derive persisted customer scope from the active organization."""
    return f"org-{membership.organization_id}"


def _organization_id_for_membership(membership: UserOrganization) -> int:
    return int(membership.organization_id)


def _organization_id_from_customer_id(customer_id: str) -> Optional[int]:
    normalized = str(customer_id or "").strip()
    if normalized.startswith("org-"):
        try:
            return int(normalized.split("-", 1)[1])
        except (TypeError, ValueError):
            return None
    return None


def _require_management_role(membership: UserOrganization, action: str) -> None:
    require_role(
        membership,
        allowed_roles=[UserRole.OWNER, UserRole.ADMIN],
        action=action,
    )


def _resolve_customer_id(
    current_user: User,
    membership: UserOrganization,
    requested_customer_id: Optional[str] = None,
) -> str:
    """Reject mismatched customer scopes and return the org-derived identifier."""
    _ = current_user
    derived_customer_id = _customer_id_for_org(membership)
    normalized_requested = str(requested_customer_id or "").strip()
    if normalized_requested and normalized_requested != derived_customer_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="customer_id must match the authenticated organization scope",
        )
    return derived_customer_id


async def _cost_summary_for_provider(provider: str, period: str = "month") -> Dict[str, Any]:
    params = {"period": period, "cloud_provider": provider}
    if provider == "aws":
        raw = await aws_costs.get_cost_summary(params)
    elif provider == "azure":
        raw = await azure_costs.get_cost_summary(params)
    elif provider == "gcp":
        raw = await gcp_costs.get_cost_summary(params)
    elif provider == "oci":
        raw = await oci_costs.get_cost_summary(params)
    else:
        return {"error": f"Unsupported provider: {provider}"}
    return _safe_json_load(raw, {"error": "Invalid tool response"})


def _imported_cost_context(
    membership: UserOrganization,
    db: Session,
    cloud_provider: str = "all",
) -> Optional[Dict[str, Any]]:
    resolved_org_id = _organization_id_for_membership(membership)
    customer_id = _customer_id_for_org(membership)
    rows = _get_imported_cost_rows(
        db,
        organization_id=resolved_org_id,
        customer_id=customer_id,
        cloud_provider=cloud_provider,
    )
    if not rows:
        return None

    breakdown: Dict[str, Dict[str, float]] = {}
    region_breakdown: Dict[str, float] = {}
    total_cost = 0.0
    for row in rows:
        provider = str(row.provider or "").strip().lower()
        if not provider:
            continue
        cost = float(row.cost_usd or 0.0)
        total_cost += cost
        provider_bucket = breakdown.setdefault(provider, {"cost": 0.0, "percentage": 0.0})
        provider_bucket["cost"] = round(provider_bucket["cost"] + cost, 2)
        region_name = str(row.region or "").strip()
        if region_name:
            region_breakdown[region_name] = round(region_breakdown.get(region_name, 0.0) + cost, 2)

    if total_cost > 0:
        for provider in breakdown:
            breakdown[provider]["percentage"] = round(
                (breakdown[provider]["cost"] / total_cost) * 100,
                1,
            )

    summary = _imported_cost_summary(rows)
    return {
        "period": "imported",
        "cloud_provider": cloud_provider,
        "total_cost": round(total_cost, 2),
        "breakdown": breakdown,
        "region_breakdown": [
            {"region": region, "cost_usd": round(cost, 2)}
            for region, cost in sorted(region_breakdown.items(), key=lambda item: item[1], reverse=True)
        ],
        "source": "csv_import",
        "rows_imported": summary["rows_imported"],
        "last_imported_at": summary["last_imported_at"].isoformat()
        if summary["last_imported_at"]
        else None,
    }


async def _cost_context(
    membership: UserOrganization,
    db: Session,
    period: str = "month",
    cloud_provider: str = "all",
) -> Dict[str, Any]:
    imported_context = _imported_cost_context(
        membership,
        db,
        cloud_provider=cloud_provider,
    )
    if imported_context is not None:
        return imported_context

    providers = ["aws", "azure", "gcp", "oci"] if cloud_provider == "all" else [cloud_provider]
    breakdown: Dict[str, Dict[str, float]] = {}
    region_breakdown: Dict[str, float] = {}
    total_cost = 0.0

    for provider in providers:
        summary = await _cost_summary_for_provider(provider, period)
        cost = float(summary.get("total_cost_usd", 0) or 0)
        total_cost += cost
        breakdown[provider] = {"cost": round(cost, 2), "percentage": 0.0}
        for region_row in summary.get("region_breakdown", []):
            region_name = str(region_row.get("region") or "global")
            region_cost = float(region_row.get("cost_usd") or 0.0)
            region_breakdown[region_name] = region_breakdown.get(region_name, 0.0) + region_cost

    if total_cost > 0:
        for provider in breakdown:
            breakdown[provider]["percentage"] = round(
                (breakdown[provider]["cost"] / total_cost) * 100, 1
            )

    return {
        "period": period,
        "cloud_provider": cloud_provider,
        "total_cost": round(total_cost, 2),
        "breakdown": breakdown,
        "region_breakdown": [
            {"region": region, "cost_usd": round(cost, 2)}
            for region, cost in sorted(region_breakdown.items(), key=lambda item: item[1], reverse=True)
        ],
    }


def _setting_missing(value: Any) -> bool:
    text = str(value or "").strip().lower()
    if not text:
        return True
    return text.startswith("your_") or text.startswith("replace_") or "example.com" in text


def _provider_diagnostics() -> List[ProviderDiagnostic]:
    config = Config()
    requirements = {
        "aws": {
            "settings": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
            "values": [
                config.aws_access_key_id,
                config.aws_secret_access_key,
                config.aws_region,
            ],
        },
        "azure": {
            "settings": [
                "AZURE_SUBSCRIPTION_ID",
                "AZURE_TENANT_ID",
                "AZURE_CLIENT_ID",
                "AZURE_CLIENT_SECRET",
            ],
            "values": [
                config.azure_subscription_id,
                config.azure_tenant_id,
                config.azure_client_id,
                config.azure_client_secret,
            ],
        },
        "gcp": {
            "settings": ["GOOGLE_APPLICATION_CREDENTIALS", "GCP_PROJECT_ID"],
            "values": [config.google_application_credentials, config.gcp_project_id],
        },
        "oci": {
            "settings": ["OCI_CONFIG_FILE", "OCI_PROFILE", "OCI_REGION"],
            "values": [config.oci_config_file, config.oci_profile, config.oci_region],
        },
    }

    diagnostics: List[ProviderDiagnostic] = []
    for provider, detail in requirements.items():
        settings = detail["settings"]
        values = detail["values"]
        missing = [setting for setting, value in zip(settings, values) if _setting_missing(value)]
        configured = not missing
        diagnostics.append(
            ProviderDiagnostic(
                provider=provider,
                configured=configured,
                required_settings=settings,
                missing_settings=missing,
                recommendation=(
                    "Ready for live billing API calls."
                    if configured
                    else f"Configure {', '.join(missing)} before enabling live {provider.upper()} cost collection."
                ),
            )
        )
    return diagnostics


@router.post("/credentials/validate", response_model=CredentialResponse)
async def validate_credentials(
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user),
) -> CredentialResponse:
    """Validate cloud credentials without storing them."""
    _ = current_user
    try:
        credential = _parse_credential_payload(payload)
        result = _run_validation(credential)
        return CredentialResponse(**result.__dict__)
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Credential validation failed")
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/credentials/add")
async def add_credentials(
    payload: Dict[str, Any],
    credential_manager: CredentialManager = Depends(get_credential_manager),
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> Dict[str, Any]:
    """Validate and store credentials metadata."""
    try:
        _require_management_role(membership, "credential updates")
        customer_id = _resolve_customer_id(
            current_user=current_user,
            membership=membership,
            requested_customer_id=payload.get("customer_id"),
        )
        credential_payload = {k: v for k, v in payload.items() if k != "customer_id"}
        credential = _parse_credential_payload(credential_payload)
        validation = _run_validation(credential)
        if not validation.is_valid:
            raise HTTPException(
                status_code=400,
                detail=f"Credential validation failed: {validation.message}",
            )

        stored = credential_manager.store_credentials(
            customer_id=customer_id,
            provider=credential.provider,
            credentials=credential.model_dump(),
            is_active=True,
            validation=validation,
        )
        return {
            "status": "success",
            "message": f"{credential.provider.upper()} credentials stored",
            "provider": credential.provider,
            "customer_id": customer_id,
            "record": stored,
        }
    except HTTPException:
        raise
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to add credentials")
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/credentials")
async def list_credentials(
    customer_id: Optional[str] = None,
    credential_manager: CredentialManager = Depends(get_credential_manager),
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> Dict[str, Any]:
    try:
        scoped_customer_id = _resolve_customer_id(current_user, membership, customer_id)
        payload = credential_manager.list_credentials(scoped_customer_id)
        payload["organization_id"] = _organization_id_for_membership(membership)
        return payload
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to list credentials")
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/credentials/{provider}")
async def delete_credentials(
    provider: str,
    customer_id: Optional[str] = None,
    credential_manager: CredentialManager = Depends(get_credential_manager),
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> Dict[str, Any]:
    try:
        _require_management_role(membership, "credential deletion")
        scoped_customer_id = _resolve_customer_id(current_user, membership, customer_id)
        deleted = credential_manager.delete_credentials(scoped_customer_id, provider)
        if not deleted:
            raise HTTPException(status_code=404, detail="Credential not found")
        return {
            "status": "success",
            "message": f"{provider.upper()} credentials deleted",
            "provider": provider,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to delete credentials")
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/scanning/request-approval")
async def request_scanning_approval(
    providers: List[str],
    notification_email: str,
    scanning_manager: ScanningManager = Depends(get_scanning_manager),
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
    customer_id: Optional[str] = None,
) -> Dict[str, Any]:
    try:
        _require_management_role(membership, "scan approval requests")
        scoped_customer_id = _resolve_customer_id(current_user, membership, customer_id)
        scanning_manager.create_permission_request(
            customer_id=scoped_customer_id,
            providers=providers,
            notification_email=notification_email,
        )
        approval_request = scanning_manager.request_approval(
            customer_id=scoped_customer_id,
            providers=providers,
        )
        return {
            "status": "approval_pending",
            "message": approval_request["message"],
            "action_required": True,
            "approve_url": approval_request["approve_url"],
            "providers": providers,
            "customer_id": scoped_customer_id,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to request approval")
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/scanning/approve", response_model=ScanningPermissionResponse)
async def approve_scanning(
    approval: ScanningApprovalRequest,
    scanning_manager: ScanningManager = Depends(get_scanning_manager),
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> ScanningPermissionResponse:
    try:
        _require_management_role(membership, "scan approval")
        customer_id = _resolve_customer_id(current_user, membership, approval.customer_id)
        approved = scanning_manager.approve_scanning(
            customer_id=customer_id,
            auto_remediate=approval.auto_remediate,
            scan_frequency=approval.scan_frequency,
        )
        return ScanningPermissionResponse(
            customer_id=approved["customer_id"],
            organization_id=_organization_id_for_membership(membership),
            state=approved["state"],
            providers=approved["providers"],
            scan_frequency=approved["scan_frequency"],
            auto_remediate=approved["auto_remediate"],
            created_at=approved["created_at"],
            approved_at=approved["approved_at"],
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to approve scanning")
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/scanning/permission", response_model=ScanningPermissionResponse)
async def get_scanning_permission(
    customer_id: Optional[str] = None,
    scanning_manager: ScanningManager = Depends(get_scanning_manager),
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> ScanningPermissionResponse:
    try:
        scoped_customer_id = _resolve_customer_id(current_user, membership, customer_id)
        permission = scanning_manager.get_permission_status(scoped_customer_id)
        return ScanningPermissionResponse(
            organization_id=_organization_id_for_membership(membership),
            **permission,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to get permission status")
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/scanning/pause")
async def pause_scanning(
    customer_id: Optional[str] = None,
    scanning_manager: ScanningManager = Depends(get_scanning_manager),
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> Dict[str, Any]:
    try:
        _require_management_role(membership, "scan pause")
        scoped_customer_id = _resolve_customer_id(current_user, membership, customer_id)
        return scanning_manager.pause_scanning(scoped_customer_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to pause scanning")
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/scanning/resume")
async def resume_scanning(
    customer_id: Optional[str] = None,
    scanning_manager: ScanningManager = Depends(get_scanning_manager),
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> Dict[str, Any]:
    try:
        _require_management_role(membership, "scan resume")
        scoped_customer_id = _resolve_customer_id(current_user, membership, customer_id)
        return scanning_manager.resume_scanning(scoped_customer_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to resume scanning")
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/scanning/start", response_model=ScanProgressResponse)
async def start_scan(
    scan_request: StartScanRequest,
    background_tasks: BackgroundTasks,
    scanning_manager: ScanningManager = Depends(get_scanning_manager),
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> ScanProgressResponse:
    try:
        _require_management_role(membership, "scan start")
        customer_id = _resolve_customer_id(current_user, membership, scan_request.customer_id)
        permission = scanning_manager.get_permission_status(customer_id)
        if permission["state"] not in [ScanningState.APPROVED.value, ScanningState.RUNNING.value]:
            raise HTTPException(
                status_code=403,
                detail=f"Scanning not approved. Current state: {permission['state']}",
            )

        providers_to_scan = scan_request.providers or permission["providers"]
        if not providers_to_scan:
            providers_to_scan = ["aws", "azure", "gcp", "oci"]

        scan_id = f"scan_{customer_id}_{int(_utcnow().timestamp())}"
        scanning_manager.create_scan_run(scan_id, customer_id, providers_to_scan)
        background_tasks.add_task(
            _run_cost_analysis,
            scan_id=scan_id,
            customer_id=customer_id,
            providers=providers_to_scan,
        )

        return ScanProgressResponse(
            scan_id=scan_id,
            customer_id=customer_id,
            organization_id=_organization_id_for_membership(membership),
            state=ScanningState.RUNNING.value,
            progress=0,
            providers=providers_to_scan,
            started_at=_utcnow(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to start scan")
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/scanning/scheduler/run-now")
async def run_scheduler_now(
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> Dict[str, Any]:
    """Run the scan scheduler loop once on-demand."""
    _ = current_user
    _require_management_role(membership, "manual scheduler runs")
    return await run_scheduled_scans_once(
        requested_organization_id=_organization_id_for_membership(membership),
    )


@router.get("/scanning/{scan_id}/progress", response_model=ScanProgressResponse)
async def get_scan_progress(
    scan_id: str,
    scanning_manager: ScanningManager = Depends(get_scanning_manager),
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> ScanProgressResponse:
    row = scanning_manager.get_scan_run(scan_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    if row["customer_id"] != _customer_id_for_org(membership):
        raise HTTPException(status_code=404, detail="Scan not found")
    return ScanProgressResponse(
        scan_id=row["scan_id"],
        customer_id=row["customer_id"],
        organization_id=_organization_id_for_membership(membership),
        state=row["state"],
        progress=row["progress"],
        providers=row["providers"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
        total_resources=row["total_resources"],
        anomalies_found=row["anomalies_found"],
        savings_identified=row["savings_identified"],
    )


@router.get("/scanning/history", response_model=List[ScanHistoryItem])
async def get_scan_history(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> List[ScanHistoryItem]:
    customer_id = _customer_id_for_org(membership)
    db = SessionLocal()
    try:
        rows = (
            db.query(ScanRunRecord)
            .filter(ScanRunRecord.customer_id == customer_id)
            .order_by(ScanRunRecord.started_at.desc())
            .limit(max(1, min(limit, 100)))
            .all()
        )
    finally:
        db.close()
    return [
        ScanHistoryItem(
            scan_id=row.scan_id,
            customer_id=row.customer_id,
            organization_id=_organization_id_for_membership(membership),
            state=row.state,
            providers=json.loads(row.providers_json or "[]"),
            started_at=row.started_at,
            completed_at=row.completed_at,
            total_resources=row.total_resources,
            anomalies_found=row.anomalies_found,
            savings_identified=float(row.savings_identified or 0.0),
        )
        for row in rows
    ]


@router.get("/scanning/{scan_id}/diff", response_model=ScanDiffResponse)
async def get_scan_diff(
    scan_id: str,
    previous_scan_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> ScanDiffResponse:
    _ = current_user
    customer_id = _customer_id_for_org(membership)
    organization_id = _organization_id_for_membership(membership)

    db = SessionLocal()
    try:
        current_run = (
            db.query(ScanRunRecord)
            .filter(
                ScanRunRecord.scan_id == scan_id,
                ScanRunRecord.customer_id == customer_id,
            )
            .first()
        )
        if current_run is None:
            raise HTTPException(status_code=404, detail="Scan not found")

        if previous_scan_id:
            previous_run = (
                db.query(ScanRunRecord)
                .filter(
                    ScanRunRecord.scan_id == previous_scan_id,
                    ScanRunRecord.customer_id == customer_id,
                )
                .first()
            )
        else:
            previous_run = (
                db.query(ScanRunRecord)
                .filter(
                    ScanRunRecord.customer_id == customer_id,
                    ScanRunRecord.state == ScanningState.COMPLETED.value,
                    ScanRunRecord.scan_id != scan_id,
                    ScanRunRecord.started_at < current_run.started_at,
                )
                .order_by(ScanRunRecord.started_at.desc())
                .first()
            )

        current_snapshots = (
            db.query(CostSnapshot).filter(CostSnapshot.scan_id == current_run.scan_id).all()
        )
        previous_snapshots = (
            db.query(CostSnapshot).filter(CostSnapshot.scan_id == previous_run.scan_id).all()
            if previous_run
            else []
        )
    finally:
        db.close()

    current_map = {row.provider: row for row in current_snapshots}
    previous_map = {row.provider: row for row in previous_snapshots}
    providers = sorted(set(current_map.keys()) | set(previous_map.keys()))

    entries: List[ScanDiffEntry] = []
    total_current = 0.0
    total_previous = 0.0
    for provider in providers:
        current_row = current_map.get(provider)
        previous_row = previous_map.get(provider)
        current_cost = float(current_row.total_cost_usd) if current_row else 0.0
        previous_cost = float(previous_row.total_cost_usd) if previous_row else 0.0
        total_current += current_cost
        total_previous += previous_cost
        delta_cost = current_cost - previous_cost
        delta_percent = None
        if previous_cost > 0:
            delta_percent = round((delta_cost / previous_cost) * 100, 2)
        entries.append(
            ScanDiffEntry(
                provider=provider,
                current_cost_usd=round(current_cost, 2),
                previous_cost_usd=round(previous_cost, 2),
                delta_cost_usd=round(delta_cost, 2),
                delta_percent=delta_percent,
                current_anomalies=int(current_row.anomalies_count if current_row else 0),
                previous_anomalies=int(previous_row.anomalies_count if previous_row else 0),
            )
        )

    return ScanDiffResponse(
        organization_id=organization_id,
        current_scan_id=current_run.scan_id,
        previous_scan_id=previous_run.scan_id if previous_run else None,
        total_current_cost_usd=round(total_current, 2),
        total_previous_cost_usd=round(total_previous, 2),
        total_delta_cost_usd=round(total_current - total_previous, 2),
        entries=entries,
    )


@router.get("/scanning/history.csv")
async def download_scan_history_csv(
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> Response:
    rows = await get_scan_history(limit=limit, current_user=current_user, membership=membership)
    lines = ["scan_id,state,providers,started_at,completed_at,total_resources,anomalies_found,savings_identified"]
    for row in rows:
        providers = "|".join(row.providers)
        lines.append(
            f"{row.scan_id},{row.state},{providers},{row.started_at.isoformat()},"
            f"{row.completed_at.isoformat() if row.completed_at else ''},"
            f"{row.total_resources},{row.anomalies_found},{row.savings_identified:.2f}"
        )
    return Response("\n".join(lines), media_type="text/csv")


@router.get("/scanning/{scan_id}/diff.csv")
async def download_scan_diff_csv(
    scan_id: str,
    previous_scan_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> Response:
    diff = await get_scan_diff(
        scan_id=scan_id,
        previous_scan_id=previous_scan_id,
        current_user=current_user,
        membership=membership,
    )
    lines = ["provider,current_cost_usd,previous_cost_usd,delta_cost_usd,delta_percent,current_anomalies,previous_anomalies"]
    for entry in diff.entries:
        lines.append(
            f"{entry.provider},{entry.current_cost_usd:.2f},{entry.previous_cost_usd:.2f},"
            f"{entry.delta_cost_usd:.2f},{entry.delta_percent if entry.delta_percent is not None else ''},"
            f"{entry.current_anomalies},{entry.previous_anomalies}"
        )
    return Response("\n".join(lines), media_type="text/csv")


@router.get("/provider-accounts/rollups", response_model=ProviderAccountRollupResponse)
async def get_provider_account_rollups(
    scan_id: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> ProviderAccountRollupResponse:
    _ = current_user
    customer_id = _customer_id_for_org(membership)
    organization_id = _organization_id_for_membership(membership)

    db = SessionLocal()
    try:
        imported_rows = _get_imported_cost_rows(
            db,
            organization_id=organization_id,
            customer_id=customer_id,
            cloud_provider=provider or "all",
        )

        query = (
            db.query(ProviderAccountSnapshot, ProviderAccount)
            .join(ProviderAccount, ProviderAccount.id == ProviderAccountSnapshot.provider_account_id)
            .filter(
                ProviderAccountSnapshot.customer_id == customer_id,
                ProviderAccountSnapshot.organization_id == organization_id,
            )
        )
        if scan_id:
            query = query.filter(ProviderAccountSnapshot.scan_id == scan_id)
        else:
            latest = (
                db.query(ProviderAccountSnapshot.scan_id)
                .filter(
                    ProviderAccountSnapshot.customer_id == customer_id,
                    ProviderAccountSnapshot.organization_id == organization_id,
                )
                .order_by(ProviderAccountSnapshot.captured_at.desc())
                .first()
            )
            if latest:
                query = query.filter(ProviderAccountSnapshot.scan_id == latest[0])
                scan_id = latest[0]
        if provider:
            query = query.filter(ProviderAccount.provider == provider)
        rows = query.all()

        if imported_rows:
            return _build_rollups_from_imported_rows(
                imported_rows,
                organization_id=organization_id,
                customer_id=customer_id,
                provider=provider,
            )

        account_ids = [account.id for _, account in rows]
        links = (
            db.query(ProviderAccountLink)
            .filter(
                ProviderAccountLink.organization_id == organization_id,
                ProviderAccountLink.child_account_id.in_(account_ids),
            )
            .all()
            if account_ids
            else []
        )
    finally:
        db.close()

    nodes: Dict[int, Dict[str, Any]] = {}
    provider_roots: Dict[str, int] = {}
    next_synthetic_id = -1

    def _synthetic_id() -> int:
        nonlocal next_synthetic_id
        current = next_synthetic_id
        next_synthetic_id -= 1
        return current

    account_by_id = {account.id: account for _, account in rows}
    parent_by_child = {link.child_account_id: link.parent_account_id for link in links}

    for snapshot, account in rows:
        nodes[account.id] = {
            "provider": account.provider,
            "account_identifier": account.account_identifier,
            "account_name": account.account_name,
            "account_type": account.account_type,
            "parent_account_id": parent_by_child.get(account.id),
            "parent_account_identifier": (
                account_by_id[parent_by_child[account.id]].account_identifier
                if parent_by_child.get(account.id) in account_by_id
                else None
            ),
            "direct_cost_usd": round(float(snapshot.direct_cost_usd or 0.0), 2),
            "direct_savings_identified_usd": round(float(snapshot.savings_identified_usd or 0.0), 2),
            "direct_anomalies_count": int(snapshot.anomalies_count or 0),
            "direct_service_count": int(snapshot.service_count or 0),
            "scan_id": snapshot.scan_id,
            "captured_at": snapshot.captured_at.isoformat() if snapshot.captured_at else None,
        }

    for node in nodes.values():
        if node.get("parent_account_id") not in nodes:
            node["parent_account_id"] = None
            node["parent_account_identifier"] = None

    management_group_by_provider: Dict[str, int] = {}
    for account_id, node in nodes.items():
        if node["account_type"] == "management_group":
            management_group_by_provider[node["provider"]] = account_id

    for account_id, node in list(nodes.items()):
        provider_key = node["provider"]
        root_id = provider_roots.get(provider_key)
        if root_id is None:
            root_id = _synthetic_id()
            provider_roots[provider_key] = root_id
            nodes[root_id] = {
                "provider": provider_key,
                "account_identifier": f"{provider_key}:provider",
                "account_name": provider_key.upper(),
                "account_type": "provider",
                "parent_account_id": None,
                "parent_account_identifier": None,
                "direct_cost_usd": 0.0,
                "direct_savings_identified_usd": 0.0,
                "direct_anomalies_count": 0,
                "direct_service_count": 0,
                "scan_id": node.get("scan_id"),
                "captured_at": node.get("captured_at"),
            }

        if node.get("parent_account_id") is not None:
            continue

        inferred_parent_id = root_id
        if node["account_type"] == "management_group":
            inferred_parent_id = root_id
        elif node["account_type"] in {"subscription", "account"} and provider_key == "azure":
            inferred_parent_id = management_group_by_provider.get(provider_key, root_id)
        elif node["account_type"] == "tenancy":
            inferred_parent_id = root_id
        elif node["account_type"] in {"project", "compartment"}:
            inferred_parent_id = root_id

        node["parent_account_id"] = inferred_parent_id if inferred_parent_id != account_id else None
        node["parent_account_identifier"] = (
            nodes[inferred_parent_id]["account_identifier"]
            if inferred_parent_id in nodes and inferred_parent_id != account_id
            else None
        )

    items = _materialize_rollup_items(nodes)
    filtered_items = [item for item in items if provider is None or item.provider == provider]
    total_direct = round(sum(item.direct_cost_usd for item in filtered_items if item.depth > 0 or item.child_count == 0), 2)
    total_rolled = round(sum(item.rolled_up_cost_usd for item in filtered_items if item.depth == 0), 2)

    return ProviderAccountRollupResponse(
        organization_id=organization_id,
        customer_id=customer_id,
        provider=provider,
        scan_id=scan_id,
        generated_at=_utcnow().isoformat(),
        total_direct_cost_usd=total_direct,
        total_rolled_up_cost_usd=total_rolled,
        items=filtered_items,
    )


@router.get("/imports/costs/summary", response_model=ImportedCostSummaryResponse)
async def get_imported_cost_summary(
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> ImportedCostSummaryResponse:
    _ = current_user
    organization_id = _organization_id_for_membership(membership)
    customer_id = _customer_id_for_org(membership)
    rows = _get_imported_cost_rows(db, organization_id, customer_id)
    if not rows:
        return ImportedCostSummaryResponse(
            organization_id=organization_id,
            customer_id=customer_id,
            has_data=False,
        )

    summary = _imported_cost_summary(rows)
    return ImportedCostSummaryResponse(
        organization_id=organization_id,
        customer_id=customer_id,
        has_data=True,
        upload_id=summary["upload_id"],
        source_filename=summary["source_filename"],
        rows_imported=summary["rows_imported"],
        total_cost_usd=summary["total_cost_usd"],
        providers=summary["providers"],
        last_imported_at=summary["last_imported_at"],
    )


@router.get("/imports/costs/template.csv")
async def download_cost_import_template(
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> Response:
    _ = (current_user, membership)
    return Response(
        (
            "provider,cost_usd,service_name,account_identifier,account_name,account_type,parent_account_identifier,region,period_start,period_end,currency\n"
            "aws,123.45,EC2,acct-aws-1,AWS Prod,account,aws-org-root,eu-west-2,2026-04-01T00:00:00Z,2026-04-30T23:59:59Z,USD\n"
            "azure,67.89,Virtual Machines,sub-azure-1,Azure Prod,subscription,mg-finops,uk south,2026-04-01T00:00:00Z,2026-04-30T23:59:59Z,USD\n"
            "oci,10.00,Compute,comp-oci-1,OCI Prod,compartment,tenancy-main,uk-london-1,2026-04-01T00:00:00Z,2026-04-30T23:59:59Z,USD\n"
        ),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=optiora-cost-import-template.csv"},
    )


@router.post("/imports/costs/csv", response_model=ImportedCostUploadResponse)
async def upload_cost_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> ImportedCostUploadResponse:
    _require_management_role(membership, "CSV cost import")
    organization_id = _organization_id_for_membership(membership)
    customer_id = _customer_id_for_org(membership)

    filename = str(file.filename or "").strip() or "cost-import.csv"
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV uploads are supported right now.")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded CSV file is empty.")

    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV upload must be UTF-8 encoded.") from exc

    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        raise HTTPException(
            status_code=400,
            detail="CSV header row is missing. Expected columns include provider and cost_usd.",
        )
    reader.fieldnames = [str(name or "").strip().lower() for name in reader.fieldnames]
    if "provider" not in reader.fieldnames or "cost_usd" not in reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV must include provider and cost_usd columns.")

    imported_at = _utcnow()
    upload_id = f"csv_{uuid4().hex}"
    rows_to_store: List[ImportedCostRecord] = []
    total_cost = 0.0
    providers: set[str] = set()
    validation_errors: List[str] = []

    for line_number, row in enumerate(reader, start=2):
        normalized_row = {
            str(key or "").strip().lower(): str(value or "").strip()
            for key, value in row.items()
        }
        provider = normalized_row.get("provider", "").lower()
        if provider not in SUPPORTED_COST_IMPORT_PROVIDERS:
            validation_errors.append(
                f"Unsupported provider at CSV line {line_number}. "
                f"Use one of: {', '.join(sorted(SUPPORTED_COST_IMPORT_PROVIDERS))}."
            )
            continue

        currency = normalized_row.get("currency", "USD").upper() or "USD"
        if currency != "USD":
            validation_errors.append(
                f"Only USD CSV imports are supported right now. Invalid currency at line {line_number}."
            )
            continue

        cost_usd, cost_error = _parse_required_float_value(normalized_row.get("cost_usd"), "cost_usd", line_number)
        period_start, period_start_error = _parse_optional_datetime_value(
            normalized_row.get("period_start"),
            "period_start",
            line_number,
        )
        period_end, period_end_error = _parse_optional_datetime_value(
            normalized_row.get("period_end"),
            "period_end",
            line_number,
        )
        for error in (cost_error, period_start_error, period_end_error):
            if error:
                validation_errors.append(error)
        if cost_usd is None or cost_error or period_start_error or period_end_error:
            continue

        total_cost += cost_usd
        providers.add(provider)
        rows_to_store.append(
            ImportedCostRecord(
                organization_id=organization_id,
                customer_id=customer_id,
                upload_id=upload_id,
                source_filename=filename,
                provider=provider,
                service_name=normalized_row.get("service_name") or normalized_row.get("service") or None,
                account_identifier=normalized_row.get("account_identifier") or None,
                account_name=normalized_row.get("account_name") or None,
                account_type=normalized_row.get("account_type") or None,
                parent_account_identifier=normalized_row.get("parent_account_identifier") or None,
                region=normalized_row.get("region") or None,
                period_start=period_start,
                period_end=period_end,
                cost_usd=cost_usd,
                currency=currency,
                line_number=line_number,
                created_at=imported_at,
            )
        )

    if validation_errors:
        detail = "CSV validation failed:\n- " + "\n- ".join(validation_errors[:10])
        if len(validation_errors) > 10:
            detail += f"\n- ...and {len(validation_errors) - 10} more issue(s)."
        raise HTTPException(status_code=400, detail=detail)

    if not rows_to_store:
        raise HTTPException(status_code=400, detail="CSV file does not contain any data rows.")

    db.query(ImportedCostRecord).filter(
        ImportedCostRecord.organization_id == organization_id,
        ImportedCostRecord.customer_id == customer_id,
    ).delete(synchronize_session=False)
    db.add_all(rows_to_store)
    db.add(
        AuditLog(
            organization_id=organization_id,
            actor_user_id=current_user.id,
            action="cost_import.csv_uploaded",
            entity_type="cost_import",
            entity_id=upload_id,
            metadata_json=json.dumps(
                {
                    "filename": filename,
                    "rows_imported": len(rows_to_store),
                    "providers": sorted(providers),
                }
            ),
            created_at=imported_at,
        )
    )
    db.commit()

    return ImportedCostUploadResponse(
        organization_id=organization_id,
        customer_id=customer_id,
        upload_id=upload_id,
        filename=filename,
        rows_imported=len(rows_to_store),
        total_cost_usd=round(total_cost, 2),
        providers=sorted(providers),
        imported_at=imported_at,
    )


@router.get("/alerts")
async def list_alerts(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> List[Dict[str, Any]]:
    _ = current_user
    customer_id = _customer_id_for_org(membership)
    organization_id = _organization_id_for_membership(membership)
    db = SessionLocal()
    try:
        rows = (
            db.query(AlertEvent)
            .filter(
                AlertEvent.customer_id == customer_id,
                AlertEvent.organization_id == organization_id,
            )
            .order_by(AlertEvent.created_at.desc())
            .limit(max(1, min(limit, 200)))
            .all()
        )
    finally:
        db.close()
    return [
        {
            "id": row.id,
            "alert_type": row.alert_type,
            "severity": row.severity,
            "title": row.title,
            "message": row.message,
            "delivered_channels": json.loads(row.delivered_channels_json or "[]"),
            "acknowledged_at": row.acknowledged_at.isoformat() if row.acknowledged_at else None,
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: int,
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> Dict[str, Any]:
    _require_management_role(membership, "alert acknowledgement")
    organization_id = _organization_id_for_membership(membership)
    db = SessionLocal()
    try:
        row = (
            db.query(AlertEvent)
            .filter(
                AlertEvent.id == alert_id,
                AlertEvent.organization_id == organization_id,
            )
            .first()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Alert not found")
        row.acknowledged_at = _utcnow()
        row.acknowledged_by_user_id = current_user.id
        db.add(
            AuditLog(
                organization_id=organization_id,
                actor_user_id=current_user.id,
                action="alert.acknowledge",
                entity_type="alert_event",
                entity_id=str(row.id),
                metadata_json=json.dumps({"alert_type": row.alert_type}),
            )
        )
        db.commit()
    finally:
        db.close()
    return {"status": "ok", "alert_id": alert_id}


@router.get("/alerts.csv")
async def download_alerts_csv(
    limit: int = 200,
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> Response:
    rows = await list_alerts(limit=limit, current_user=current_user, membership=membership)
    lines = ["id,alert_type,severity,title,message,acknowledged_at,created_at"]
    for row in rows:
        lines.append(
            f"{row['id']},{row['alert_type']},{row['severity']},"
            f"\"{str(row['title']).replace('\"', '\"\"')}\","
            f"\"{str(row['message']).replace('\"', '\"\"')}\","
            f"{row['acknowledged_at'] or ''},{row['created_at']}"
        )
    return Response("\n".join(lines), media_type="text/csv")


@router.get("/audit-logs")
async def list_audit_logs(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> List[Dict[str, Any]]:
    _ = current_user
    organization_id = _organization_id_for_membership(membership)
    db = SessionLocal()
    try:
        rows = (
            db.query(AuditLog)
            .filter(AuditLog.organization_id == organization_id)
            .order_by(AuditLog.created_at.desc())
            .limit(max(1, min(limit, 200)))
            .all()
        )
    finally:
        db.close()
    return [
        {
            "id": row.id,
            "action": row.action,
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
            "actor_user_id": row.actor_user_id,
            "metadata": _safe_json_load(row.metadata_json or "{}", {}),
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]


@router.get("/audit-logs.csv")
async def download_audit_logs_csv(
    limit: int = 200,
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> Response:
    rows = await list_audit_logs(limit=limit, current_user=current_user, membership=membership)
    lines = ["id,action,entity_type,entity_id,actor_user_id,created_at"]
    for row in rows:
        lines.append(
            f"{row['id']},{row['action']},{row['entity_type']},{row['entity_id'] or ''},"
            f"{row['actor_user_id'] or ''},{row['created_at']}"
        )
    return Response("\n".join(lines), media_type="text/csv")


async def _executive_summary_rows(
    current_user: User,
    membership: UserOrganization,
    db: Session,
) -> List[List[Any]]:
    costs = await dashboard_costs(
        current_user=current_user,
        membership=membership,
        db=db,
    )
    analytics = await dashboard_analytics(
        current_user=current_user,
        membership=membership,
        db=db,
    )
    rollups = await get_provider_account_rollups(
        current_user=current_user,
        membership=membership,
    )
    alerts = await list_alerts(
        limit=10,
        current_user=current_user,
        membership=membership,
    )

    rows: List[List[Any]] = [["Section", "Field", "Value"]]
    rows.extend(
        [
            ["Summary", "Generated At", _utcnow().isoformat()],
            ["Summary", "Organization ID", _organization_id_for_membership(membership)],
            ["Summary", "Cost Source", costs.get("cost_context", {}).get("source", "live")],
            ["Summary", "Total Monthly Cost USD", round(float(costs.get("totalCost", 0.0) or 0.0), 2)],
            ["Summary", "Potential Monthly Savings USD", round(float(costs.get("potentialSavings", 0.0) or 0.0), 2)],
            ["Summary", "Risk Score", analytics.get("risk_score", 0)],
            ["Summary", "Maturity Score", analytics.get("maturity_score", 0)],
            ["Summary", "Commitment Coverage Percent", analytics.get("commitment_coverage_percent", 0)],
            ["Summary", "Open Alerts", len([row for row in alerts if not row.get("acknowledged_at")])],
            ["Summary", "Rollup Nodes", len(rollups.items)],
        ]
    )

    for provider_name, provider_data in costs.get("breakdown", {}).items():
        rows.append([
            "Provider Breakdown",
            provider_name,
            round(float(provider_data.get("cost", 0.0) or 0.0), 2),
        ])

    for item in rollups.items[:20]:
        rows.append([
            "Account Rollup",
            f"{'  ' * item.depth}{item.account_name} ({item.account_type})",
            item.rolled_up_cost_usd,
        ])

    for alert in alerts[:10]:
        rows.append([
            "Alerts",
            f"{alert['severity']} {alert['title']}",
            alert["created_at"],
        ])

    return rows


@router.get("/reports/executive-summary.csv")
async def download_executive_summary_csv(
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> Response:
    rows = await _executive_summary_rows(current_user=current_user, membership=membership, db=db)
    return _csv_response(
        "optiora-executive-summary.csv",
        rows[0],
        rows[1:],
    )


@router.get("/reports/executive-summary.xls")
async def download_executive_summary_excel(
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> Response:
    rows = await _executive_summary_rows(current_user=current_user, membership=membership, db=db)
    return _spreadsheet_xml_response(
        "optiora-executive-summary.xls",
        "Executive Summary",
        rows,
    )


@router.get("/dashboard/costs")
@router.get("/costs")
async def dashboard_costs(
    period: str = "month",
    cloud_provider: str = "all",
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _ = current_user
    context = await _cost_context(membership, db, period, cloud_provider)

    anomalies_result = _safe_json_load(
        await anomalies.detect_anomalies({"cloud_provider": cloud_provider}),
        {},
    )
    recommendations_result = _safe_json_load(
        await recommendations.get_recommendations({"cloud_provider": cloud_provider}),
        {},
    )

    potential_savings = float(
        recommendations_result.get("total_potential_savings_annual_usd", 0) or 0
    ) / 12

    return {
        "totalCost": context["total_cost"],
        "trend": 0.0,
        "anomalies": int(anomalies_result.get("anomalies_found", 0) or 0),
        "potentialSavings": round(potential_savings, 2),
        "breakdown": context["breakdown"],
        "regionBreakdown": context["region_breakdown"],
    }


@router.get("/dashboard/anomalies")
@router.get("/anomalies")
async def dashboard_anomalies(
    cloud_provider: str = "all",
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> List[Dict[str, Any]]:
    _ = (current_user, membership)
    result = _safe_json_load(
        await anomalies.detect_anomalies({"cloud_provider": cloud_provider}),
        {},
    )
    rows = result.get("anomalies", [])
    mapped = []
    for idx, row in enumerate(rows):
        mapped.append(
            {
                "id": f"anomaly-{idx + 1}",
                "service": row.get("service", "unknown"),
                "cloud": cloud_provider if cloud_provider != "all" else "multi-cloud",
                "message": row.get("probable_cause", "Anomaly detected"),
                "severity": "high" if (row.get("increase_percent", 0) or 0) > 150 else "medium",
                "timestamp": row.get("date", _utcnow().isoformat()),
                "change": float(row.get("increase_percent", 0) or 0),
            }
        )
    return mapped


@router.get("/dashboard/recommendations")
@router.get("/recommendations")
async def dashboard_recommendations(
    cloud_provider: str = "all",
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    _ = current_user
    context = await _cost_context(membership, db, "month", cloud_provider)
    result = _safe_json_load(
        await recommendations.get_recommendations(
            {
                "cloud_provider": cloud_provider,
                "current_monthly_spend": context["total_cost"],
                "cost_breakdown": context["breakdown"],
            }
        ),
        {},
    )
    rows = result.get("recommendations", [])
    mapped = []
    for row in rows:
        mapped.append(
            {
                "id": row.get("id"),
                "service": row.get("service", "unknown"),
                "cloud": cloud_provider if cloud_provider != "all" else "multi-cloud",
                "title": row.get("description", "Optimization recommendation"),
                "description": row.get("description", ""),
                "savings": float(row.get("savings_annual_usd", 0) or 0) / 12,
                "roi": float(row.get("roi_percent", 0) or 0),
                "difficulty": "easy"
                if row.get("payback_months", 0) <= 1
                else "medium"
                if row.get("payback_months", 0) <= 3
                else "hard",
            }
        )
    return mapped


@router.get("/forecast")
async def dashboard_forecast(
    months: int = 12,
    cloud_provider: str = "all",
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _ = current_user
    context = await _cost_context(membership, db, "month", cloud_provider)
    result = _safe_json_load(
        await finops_analytics.get_forecast(
            {
                "months": months,
                "cloud_provider": cloud_provider,
                "current_monthly_spend": context["total_cost"],
                "cost_breakdown": context["breakdown"],
                "fallback_monthly_spend": 0,
            }
        ),
        {},
    )
    result["cost_context"] = context
    return result


@router.get("/analytics")
async def dashboard_analytics(
    cloud_provider: str = "all",
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _ = current_user
    context = await _cost_context(membership, db, "month", cloud_provider)
    anomalies_result = _safe_json_load(
        await anomalies.detect_anomalies({"cloud_provider": cloud_provider}),
        {},
    )
    recommendations_result = _safe_json_load(
        await recommendations.get_recommendations(
            {
                "cloud_provider": cloud_provider,
                "current_monthly_spend": context["total_cost"],
                "cost_breakdown": context["breakdown"],
            }
        ),
        {},
    )
    monthly_savings = (
        float(recommendations_result.get("total_potential_savings_annual_usd", 0) or 0) / 12
    )
    result = _safe_json_load(
        await finops_analytics.get_analytics(
            {
                "cloud_provider": cloud_provider,
                "current_monthly_spend": context["total_cost"],
                "cost_breakdown": context["breakdown"],
                "anomalies": int(anomalies_result.get("anomalies_found", 0) or 0),
                "monthly_savings": monthly_savings,
            }
        ),
        {},
    )
    result["cost_context"] = context
    return result


@router.get("/provider-diagnostics", response_model=List[ProviderDiagnostic])
async def provider_diagnostics(current_user: User = Depends(get_current_user)) -> List[ProviderDiagnostic]:
    """Return provider readiness checks without exposing secret values."""
    _ = current_user
    return _provider_diagnostics()


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    return {
        "status": "healthy",
        "version": __version__,
        "timestamp": _utcnow().isoformat(),
    }


@router.get("/info")
async def api_info() -> Dict[str, Any]:
    return {
        "name": "OptiOra API",
        "version": __version__,
        "description": "Cloud Cost Optimization Platform",
        "supported_providers": ["aws", "azure", "gcp", "oci"],
        "features": {
            "credential_management": True,
            "credential_validation": True,
            "scanning_permissions": True,
            "dashboard_endpoints": True,
            "finops_analytics": True,
            "forecasting": True,
            "genai_advisor": True,
            "provider_diagnostics": True,
            "audit_logging": True,
            "budget_alerts": True,
            "csv_exports": True,
            "csv_imports": True,
            "csv_import_templates": True,
            "excel_exports": True,
            "executive_reports": True,
            "provider_hierarchy": True,
        },
    }


async def _run_cost_analysis(scan_id: str, customer_id: str, providers: List[str]) -> None:
    """
    Background scan: fetch live cost data per provider, persist CostSnapshot
    rows for historical trend analysis, then mark the scan run complete.
    """
    db = SessionLocal()
    scanning_manager = ScanningManager(db)
    try:
        total_resources = 0
        anomalies_found = 0
        savings_identified = 0.0
        aggregated_cost_usd = 0.0
        now = _utcnow()

        for provider in providers:
            summary = await _cost_summary_for_provider(provider, "month")
            if "error" in summary:
                continue

            total_cost = float(summary.get("total_cost_usd", 0) or 0)
            aggregated_cost_usd += total_cost
            total_resources += 100
            provider_savings = total_cost * 0.08
            savings_identified += provider_savings

            # Fetch anomalies and recommendations for this provider to embed in snapshot.
            anomaly_raw = await anomalies.detect_anomalies({"cloud_provider": provider})
            anomaly_data = _safe_json_load(anomaly_raw, {})
            provider_anomalies = int(anomaly_data.get("anomalies_found", 0) or 0)
            anomalies_found += provider_anomalies

            rec_raw = await recommendations.get_recommendations({
                "cloud_provider": provider,
                "current_monthly_spend": total_cost,
            })

            # Derive period bounds from summary if available.
            try:
                period_start = datetime.fromisoformat(summary["start_date"]) if "start_date" in summary else None
                period_end = datetime.fromisoformat(summary["end_date"]) if "end_date" in summary else None
            except (ValueError, TypeError):
                period_start = period_end = None

            snapshot = CostSnapshot(
                scan_id=scan_id,
                customer_id=customer_id,
                provider=provider,
                period_start=period_start,
                period_end=period_end,
                total_cost_usd=total_cost,
                savings_identified_usd=provider_savings,
                anomalies_count=provider_anomalies,
                top_services_json=json.dumps(summary.get("top_services", [])),
                anomalies_json=anomaly_raw,
                recommendations_json=rec_raw,
                captured_at=now,
            )
            db.add(snapshot)

            # Persist provider-account hierarchy snapshots for rollup views.
            organization_id = _organization_id_from_customer_id(customer_id)
            account_rows = summary.get("account_breakdown") or []
            if organization_id is not None:
                # Guarantee at least one rollup node per provider.
                if not account_rows:
                    account_rows = [
                        {
                            "scope_type": "provider",
                            "scope_id": provider,
                            "total_cost_usd": total_cost,
                        }
                    ]
                for account_row in account_rows:
                    account_identifier = str(
                        account_row.get("account_id")
                        or account_row.get("scope_id")
                        or account_row.get("role_arn")
                        or provider
                    )
                    account_name = str(
                        account_row.get("account_name")
                        or account_row.get("scope_id")
                        or account_identifier
                    )
                    account_type = str(
                        account_row.get("scope_type")
                        or account_row.get("account_type")
                        or "account"
                    )
                    account_total_cost = float(account_row.get("total_cost_usd") or 0.0)
                    if account_total_cost == 0.0 and len(account_rows) == 1:
                        account_total_cost = total_cost

                    provider_account = (
                        db.query(ProviderAccount)
                        .filter(
                            ProviderAccount.customer_id == customer_id,
                            ProviderAccount.provider == provider,
                            ProviderAccount.account_identifier == account_identifier,
                        )
                        .first()
                    )
                    if provider_account is None:
                        provider_account = ProviderAccount(
                            organization_id=organization_id,
                            customer_id=customer_id,
                            provider=provider,
                            account_identifier=account_identifier,
                            account_name=account_name,
                            account_type=account_type,
                            native_region=(summary.get("region_breakdown") or [{}])[0].get("region"),
                            metadata_json=json.dumps(account_row),
                            is_active=True,
                        )
                        db.add(provider_account)
                        db.flush()
                    else:
                        provider_account.account_name = account_name
                        provider_account.account_type = account_type
                        provider_account.metadata_json = json.dumps(account_row)
                        provider_account.updated_at = now

                    existing_provider_snapshot = (
                        db.query(ProviderAccountSnapshot)
                        .filter(
                            ProviderAccountSnapshot.scan_id == scan_id,
                            ProviderAccountSnapshot.provider_account_id == provider_account.id,
                        )
                        .first()
                    )
                    if existing_provider_snapshot is None:
                        db.add(
                            ProviderAccountSnapshot(
                                organization_id=organization_id,
                                customer_id=customer_id,
                                scan_id=scan_id,
                                provider_account_id=provider_account.id,
                                direct_cost_usd=account_total_cost,
                                savings_identified_usd=provider_savings,
                                anomalies_count=provider_anomalies,
                                service_count=len(summary.get("top_services", [])),
                                captured_at=now,
                            )
                        )

        permission = (
            db.query(ScanningPermissionRecord)
            .filter(ScanningPermissionRecord.customer_id == customer_id)
            .first()
        )
        organization_id = _organization_id_from_customer_id(customer_id)
        if organization_id is not None:
            evaluate_budget_alert(
                db=db,
                organization_id=organization_id,
                customer_id=customer_id,
                scan_id=scan_id,
                total_cost_usd=aggregated_cost_usd,
                permission=permission,
            )

        db.commit()

        scanning_manager.complete_scan_run(
            scan_id=scan_id,
            progress=100,
            total_resources=total_resources,
            anomalies_found=anomalies_found,
            savings_identified=savings_identified,
        )
    except Exception as exc:
        logger.exception("Background scan failed")
        scanning_manager.fail_scan_run(scan_id, str(exc))
    finally:
        db.close()


def _scan_interval_seconds(scan_frequency: str) -> int:
    normalized = str(scan_frequency or "daily").strip().lower()
    if normalized == "hourly":
        return 60 * 60
    if normalized == "weekly":
        return 7 * 24 * 60 * 60
    return 24 * 60 * 60


def _coerce_aws_anomaly_impact_usd(payload: Dict[str, Any]) -> float:
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


def _aws_anomaly_severity(impact_usd: float, source_severity: Optional[str]) -> str:
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


def _compute_next_run(now: datetime, scan_frequency: str, anchor: datetime) -> datetime:
    interval = timedelta(seconds=_scan_interval_seconds(scan_frequency))
    next_run = anchor + interval
    while next_run < now:
        next_run += interval
    return next_run


@router.get("/scanning/scheduler/status", response_model=SchedulerStatusResponse)
async def get_scheduler_status(
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> SchedulerStatusResponse:
    _ = current_user
    organization_id = _organization_id_for_membership(membership)
    customer_id = _customer_id_for_org(membership)
    now = _utcnow()
    db = SessionLocal()
    try:
        permission = (
            db.query(ScanningPermissionRecord)
            .filter(ScanningPermissionRecord.customer_id == customer_id)
            .first()
        )
        runs = (
            db.query(ScanRunRecord)
            .filter(ScanRunRecord.customer_id == customer_id)
            .order_by(ScanRunRecord.started_at.desc())
            .limit(50)
            .all()
        )
        audit_rows = (
            db.query(AuditLog)
            .filter(
                AuditLog.organization_id == organization_id,
                AuditLog.action.in_(["scan.schedule.triggered"]),
            )
            .order_by(AuditLog.created_at.desc())
            .limit(8)
            .all()
        )
    finally:
        db.close()

    total_runs = len(runs)
    success_runs = sum(1 for row in runs if row.state == ScanningState.COMPLETED.value)
    failed_runs = sum(1 for row in runs if row.state == ScanningState.FAILED.value)
    last_success = next(
        (
            row.completed_at or row.started_at
            for row in runs
            if row.state == ScanningState.COMPLETED.value
        ),
        None,
    )
    last_failure = next(
        (
            row.completed_at or row.started_at
            for row in runs
            if row.state == ScanningState.FAILED.value
        ),
        None,
    )

    permission_state = permission.state if permission else ScanningState.INITIALIZED.value
    scan_frequency = permission.scan_frequency if permission else "daily"
    next_run_at: Optional[datetime] = None
    if permission and permission_state in [ScanningState.APPROVED.value, ScanningState.RUNNING.value]:
        anchor = last_success or permission.approved_at or permission.created_at or now
        next_run_at = _compute_next_run(now, scan_frequency, anchor)

    timeline: List[SchedulerTimelineItem] = []
    for row in runs[:6]:
        providers = json.loads(row.providers_json or "[]")
        timeline.append(
            SchedulerTimelineItem(
                id=f"scan-{row.scan_id}",
                event_type="scan_run",
                state=row.state,
                title=f"Scan {row.state}",
                detail=f"Providers: {', '.join(providers) if providers else 'n/a'}",
                created_at=(row.completed_at or row.started_at).isoformat(),
            )
        )
    for row in audit_rows:
        metadata = _safe_json_load(row.metadata_json or "{}", {})
        providers = metadata.get("providers", [])
        detail = f"Frequency: {metadata.get('frequency', 'n/a')}"
        if providers:
            detail = f"{detail} | Providers: {', '.join([str(item) for item in providers])}"
        timeline.append(
            SchedulerTimelineItem(
                id=f"audit-{row.id}",
                event_type="scheduler_trigger",
                state="info",
                title="Scheduler triggered scan",
                detail=detail,
                created_at=row.created_at.isoformat(),
            )
        )
    timeline = sorted(timeline, key=lambda item: item.created_at, reverse=True)[:10]

    eta_seconds: Optional[int] = None
    if next_run_at is not None:
        eta_seconds = max(0, int((next_run_at - now).total_seconds()))

    return SchedulerStatusResponse(
        organization_id=organization_id,
        customer_id=customer_id,
        scheduler_enabled=Config().enable_scan_scheduler,
        scheduler_running=_scheduler_running,
        permission_state=permission_state,
        scan_frequency=scan_frequency,
        next_run_at=next_run_at.isoformat() if next_run_at else None,
        next_run_eta_seconds=eta_seconds,
        last_success_at=last_success.isoformat() if last_success else None,
        last_failure_at=last_failure.isoformat() if last_failure else None,
        counters=SchedulerCounters(
            total=total_runs,
            success=success_runs,
            failure=failed_runs,
        ),
        timeline=timeline,
    )


@router.post("/anomalies/external/aws")
async def ingest_external_aws_anomalies(
    payload: ExternalAWSAnomalyIngestRequest,
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> Dict[str, Any]:
    _require_management_role(membership, "external anomaly ingestion")
    organization_id = _organization_id_for_membership(membership)
    customer_id = _customer_id_for_org(membership)

    if not payload.events:
        return {"status": "ok", "ingested": 0, "alert_ids": []}

    now = _utcnow()
    db = SessionLocal()
    try:
        alert_ids: List[int] = []
        for event in payload.events:
            detail = event.get("detail")
            detail_payload = detail if isinstance(detail, dict) else event
            anomaly_id = (
                detail_payload.get("anomalyId")
                or detail_payload.get("AnomalyId")
                or event.get("id")
                or f"aws-anomaly-{int(now.timestamp())}"
            )
            impact_usd = _coerce_aws_anomaly_impact_usd(detail_payload)
            severity = _aws_anomaly_severity(
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
            row = AlertEvent(
                organization_id=organization_id,
                customer_id=customer_id,
                scan_id=None,
                alert_type="external.aws.cost_anomaly",
                severity=severity,
                title=title[:255],
                message=message,
                delivered_channels_json=json.dumps(["aws-cost-anomaly-detection"]),
                created_at=now,
            )
            db.add(row)
            db.flush()
            alert_ids.append(row.id)

        db.add(
            AuditLog(
                organization_id=organization_id,
                actor_user_id=current_user.id,
                action="alert.external.ingest",
                entity_type="alert_event",
                entity_id="aws-cost-anomaly-detection",
                metadata_json=json.dumps({"count": len(alert_ids)}),
                created_at=now,
            )
        )
        db.commit()
    finally:
        db.close()

    return {"status": "ok", "ingested": len(payload.events), "alert_ids": alert_ids}


async def run_scheduled_scans_once(requested_organization_id: Optional[int] = None) -> Dict[str, Any]:
    """Trigger due scans for approved organizations based on configured cadence."""
    global _scheduler_running
    if _scheduler_running:
        return {"status": "busy", "started": 0, "organization_id": requested_organization_id}
    _scheduler_running = True
    started = 0
    now = _utcnow()
    db = SessionLocal()
    try:
        permissions_query = db.query(ScanningPermissionRecord).filter(
            ScanningPermissionRecord.state.in_([ScanningState.APPROVED.value, ScanningState.RUNNING.value])
        )
        if requested_organization_id is not None:
            permissions_query = permissions_query.filter(
                ScanningPermissionRecord.customer_id == f"org-{requested_organization_id}"
            )
        permissions = permissions_query.all()
        for permission in permissions:
            cadence_seconds = _scan_interval_seconds(permission.scan_frequency)
            last_completed = (
                db.query(ScanRunRecord)
                .filter(
                    ScanRunRecord.customer_id == permission.customer_id,
                    ScanRunRecord.state == ScanningState.COMPLETED.value,
                )
                .order_by(ScanRunRecord.completed_at.desc())
                .first()
            )
            if last_completed and last_completed.completed_at:
                elapsed = (now - last_completed.completed_at).total_seconds()
                if elapsed < cadence_seconds:
                    continue

            providers = json.loads(permission.providers_json or "[]")
            if not providers:
                providers = ["aws", "azure", "gcp", "oci"]
            scan_id = f"scan_{permission.customer_id}_{int(now.timestamp())}"
            row = ScanRunRecord(
                scan_id=scan_id,
                customer_id=permission.customer_id,
                state=ScanningState.RUNNING.value,
                providers_json=json.dumps(providers),
                progress=0,
                started_at=now,
            )
            db.add(row)
            db.commit()
            started += 1
            await _run_cost_analysis(scan_id=scan_id, customer_id=permission.customer_id, providers=providers)
            derived_org_id = _organization_id_from_customer_id(permission.customer_id)
            if derived_org_id is not None:
                db.add(
                    AuditLog(
                        organization_id=derived_org_id,
                        actor_user_id=None,
                        action="scan.schedule.triggered",
                        entity_type="scan_run",
                        entity_id=scan_id,
                        metadata_json=json.dumps(
                            {
                                "customer_id": permission.customer_id,
                                "frequency": permission.scan_frequency,
                                "providers": providers,
                            }
                        ),
                    )
                )
                db.commit()
    finally:
        db.close()
        _scheduler_running = False
    return {"status": "ok", "started": started, "organization_id": requested_organization_id}
