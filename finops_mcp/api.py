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
from datetime import datetime
from typing import Any, Dict, Iterable, List, Literal, Optional, Union

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .access_control import (
    legacy_user_scope_id,
    organization_scope_id,
    require_role,
    resolve_membership,
    scope_candidates,
)
from .audit import record_audit_event
from .auth_routes import get_current_user_optional
from .credentials import CredentialManager, CredentialStatus, CredentialValidator
from .config import Config
from .notifications import evaluate_budget_alert
from .orm_models import (
    AlertEvent,
    AuditLog,
    CostSnapshot,
    ProviderAccount,
    ProviderAccountLink,
    ProviderAccountSnapshot,
    ScanRunRecord,
    ScanningPermissionRecord,
    SessionLocal,
    User,
    UserRole,
    ensure_public_workspace,
    get_db,
)
from .scanning import ScanningManager, ScanningState
from .tools import anomalies, aws_costs, finops_analytics, recommendations
from .tools import azure_costs, gcp_costs, oci_costs
from . import __version__

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["api"])


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
    organization_id: Optional[int] = None
    auto_remediate: bool = False
    scan_frequency: str = "daily"
    notification_email: Optional[str] = None
    monthly_budget_usd: float = 0.0
    warning_threshold_percent: float = 80.0
    critical_threshold_percent: float = 100.0
    notifications_enabled: bool = True


class ScanningPermissionResponse(BaseModel):
    customer_id: str
    organization_id: int
    state: str
    providers: List[str]
    scan_frequency: str
    auto_remediate: bool
    notification_email: Optional[str] = None
    monthly_budget_usd: float = 0.0
    warning_threshold_percent: float = 80.0
    critical_threshold_percent: float = 100.0
    notifications_enabled: bool = True
    created_at: str
    approved_at: Optional[str] = None


class StartScanRequest(BaseModel):
    customer_id: Optional[str] = None
    organization_id: Optional[int] = None
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


class SnapshotSummary(BaseModel):
    scan_id: str
    provider: str
    total_cost_usd: float
    savings_identified_usd: float
    anomalies_count: int
    captured_at: datetime


class ScanDiffEntry(BaseModel):
    provider: str
    current_cost_usd: float
    previous_cost_usd: float
    delta_cost_usd: float
    delta_percent: Optional[float] = None
    current_anomalies: int = 0
    previous_anomalies: int = 0


class ScanDiffResponse(BaseModel):
    organization_id: int
    current_scan_id: str
    previous_scan_id: Optional[str] = None
    total_current_cost_usd: float
    total_previous_cost_usd: float
    total_delta_cost_usd: float
    entries: List[ScanDiffEntry]


class AuditLogResponse(BaseModel):
    id: int
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    actor_user_id: Optional[int] = None
    metadata: Dict[str, Any]
    created_at: datetime


class AlertEventResponse(BaseModel):
    id: int
    alert_type: str
    severity: str
    title: str
    message: str
    delivered_channels: List[str]
    acknowledged_at: Optional[datetime] = None
    created_at: datetime


class ProviderAccountRollupItem(BaseModel):
    account_id: int
    provider: str
    account_identifier: str
    account_name: str
    account_type: str
    parent_account_id: Optional[int] = None
    parent_account_identifier: Optional[str] = None
    direct_cost_usd: float = 0.0
    rolled_up_cost_usd: float = 0.0
    direct_savings_identified_usd: float = 0.0
    rolled_up_savings_identified_usd: float = 0.0
    direct_anomalies_count: int = 0
    rolled_up_anomalies_count: int = 0
    direct_service_count: int = 0
    rolled_up_service_count: int = 0
    child_count: int = 0
    scan_id: Optional[str] = None
    captured_at: Optional[datetime] = None


class ProviderAccountRollupResponse(BaseModel):
    organization_id: int
    customer_id: str
    provider: Optional[str] = None
    scan_id: Optional[str] = None
    generated_at: datetime
    total_direct_cost_usd: float = 0.0
    total_rolled_up_cost_usd: float = 0.0
    items: List[ProviderAccountRollupItem]


def get_credential_manager(db: Session = Depends(get_db)) -> CredentialManager:
    return CredentialManager(db)


def get_scanning_manager(db: Session = Depends(get_db)) -> ScanningManager:
    return ScanningManager(db)


def _auth_enabled() -> bool:
    return Config().auth_enabled


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


def _organization_context(
    current_user: Optional[User],
    db: Session,
    organization_id: Optional[int] = None,
) -> tuple[int, str, list[str]]:
    if not _auth_enabled():
        _, organization = ensure_public_workspace(db)
        primary_scope = f"org-{organization.id}"
        return organization.id, primary_scope, scope_candidates(primary_scope, ["public", "default"])

    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is required",
        )
    normalized_org_id = _normalize_organization_id(organization_id)
    membership = resolve_membership(current_user, organization_id=normalized_org_id)
    primary_scope = organization_scope_id(membership)
    legacy_scope = legacy_user_scope_id(current_user)
    return membership.organization_id, primary_scope, scope_candidates(primary_scope, [legacy_scope])


def _resolve_customer_id(
    current_user: Optional[User],
    db: Session,
    requested_customer_id: Optional[str] = None,
    organization_id: Optional[int] = None,
) -> tuple[int, str, list[str]]:
    """Reject mismatched customer scopes and return organization-scoped identifiers."""
    resolved_org_id, derived_customer_id, candidates = _organization_context(
        current_user,
        db,
        organization_id=organization_id,
    )
    normalized_requested = str(requested_customer_id or "").strip()
    if normalized_requested and normalized_requested != derived_customer_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="customer_id must match the authenticated organization scope",
        )
    return resolved_org_id, derived_customer_id, candidates


def _membership_for_scope(current_user: Optional[User], organization_id: Optional[int] = None):
    if not _auth_enabled():
        return None
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is required",
        )
    return resolve_membership(
        current_user,
        organization_id=_normalize_organization_id(organization_id),
    )


def _normalize_organization_id(organization_id: Optional[int]) -> Optional[int]:
    if organization_id in (None, ""):
        return None
    try:
        return int(organization_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="organization_id must be an integer")


def _parse_json_list(raw: str) -> list[str]:
    try:
        value = json.loads(raw)
        if isinstance(value, list):
            return [str(item) for item in value]
    except Exception:
        return []
    return []


def _scan_row_to_history_item(row: ScanRunRecord, organization_id: int) -> ScanHistoryItem:
    return ScanHistoryItem(
        scan_id=row.scan_id,
        customer_id=row.customer_id,
        organization_id=organization_id,
        state=row.state,
        providers=_parse_json_list(row.providers_json or "[]"),
        started_at=row.started_at,
        completed_at=row.completed_at,
        total_resources=row.total_resources or 0,
        anomalies_found=row.anomalies_found or 0,
        savings_identified=float(row.savings_identified or 0.0),
    )


def _snapshot_total(snapshot: Optional[CostSnapshot]) -> float:
    return float(snapshot.total_cost_usd or 0.0) if snapshot else 0.0


def _provider_account_rollups(
    accounts: List[ProviderAccount],
    links: List[ProviderAccountLink],
    snapshots: List[ProviderAccountSnapshot],
) -> tuple[List[ProviderAccountRollupItem], float, float]:
    account_by_id = {row.id: row for row in accounts}
    latest_snapshot_by_account: dict[int, ProviderAccountSnapshot] = {}
    for row in snapshots:
        latest_snapshot_by_account.setdefault(row.provider_account_id, row)

    children_map: dict[int, list[int]] = {}
    parent_by_child: dict[int, int] = {}
    for link in links:
        if link.parent_account_id not in account_by_id or link.child_account_id not in account_by_id:
            continue
        children_map.setdefault(link.parent_account_id, []).append(link.child_account_id)
        parent_by_child[link.child_account_id] = link.parent_account_id

    memo: dict[int, dict[str, Any]] = {}

    def _rollup(account_id: int, active: set[int]) -> dict[str, Any]:
        if account_id in memo:
            return memo[account_id]
        if account_id in active:
            raise ValueError(f"Cycle detected in provider account hierarchy at account {account_id}")

        active.add(account_id)
        snapshot = latest_snapshot_by_account.get(account_id)
        totals = {
            "direct_cost_usd": float(snapshot.direct_cost_usd or 0.0) if snapshot else 0.0,
            "rolled_up_cost_usd": float(snapshot.direct_cost_usd or 0.0) if snapshot else 0.0,
            "direct_savings_identified_usd": float(snapshot.savings_identified_usd or 0.0)
            if snapshot
            else 0.0,
            "rolled_up_savings_identified_usd": float(snapshot.savings_identified_usd or 0.0)
            if snapshot
            else 0.0,
            "direct_anomalies_count": int(snapshot.anomalies_count or 0) if snapshot else 0,
            "rolled_up_anomalies_count": int(snapshot.anomalies_count or 0) if snapshot else 0,
            "direct_service_count": int(snapshot.service_count or 0) if snapshot else 0,
            "rolled_up_service_count": int(snapshot.service_count or 0) if snapshot else 0,
            "scan_id": snapshot.scan_id if snapshot else None,
            "captured_at": snapshot.captured_at if snapshot else None,
        }

        for child_account_id in children_map.get(account_id, []):
            child_totals = _rollup(child_account_id, active)
            totals["rolled_up_cost_usd"] += child_totals["rolled_up_cost_usd"]
            totals["rolled_up_savings_identified_usd"] += child_totals[
                "rolled_up_savings_identified_usd"
            ]
            totals["rolled_up_anomalies_count"] += child_totals["rolled_up_anomalies_count"]
            totals["rolled_up_service_count"] += child_totals["rolled_up_service_count"]
            child_captured_at = child_totals["captured_at"]
            if child_captured_at and (
                totals["captured_at"] is None or child_captured_at > totals["captured_at"]
            ):
                totals["captured_at"] = child_captured_at
                totals["scan_id"] = child_totals["scan_id"]

        active.remove(account_id)
        memo[account_id] = totals
        return totals

    for account_id in account_by_id:
        _rollup(account_id, set())

    depth_memo: dict[int, int] = {}

    def _depth(account_id: int) -> int:
        if account_id in depth_memo:
            return depth_memo[account_id]
        parent_account_id = parent_by_child.get(account_id)
        depth_memo[account_id] = 0 if parent_account_id is None else _depth(parent_account_id) + 1
        return depth_memo[account_id]

    items: list[ProviderAccountRollupItem] = []
    for account in sorted(
        accounts,
        key=lambda row: (row.provider, _depth(row.id), row.account_name.lower(), row.account_identifier),
    ):
        parent_account_id = parent_by_child.get(account.id)
        parent_account = account_by_id.get(parent_account_id) if parent_account_id else None
        totals = memo[account.id]
        items.append(
            ProviderAccountRollupItem(
                account_id=account.id,
                provider=account.provider,
                account_identifier=account.account_identifier,
                account_name=account.account_name,
                account_type=account.account_type,
                parent_account_id=parent_account_id,
                parent_account_identifier=parent_account.account_identifier if parent_account else None,
                direct_cost_usd=round(totals["direct_cost_usd"], 2),
                rolled_up_cost_usd=round(totals["rolled_up_cost_usd"], 2),
                direct_savings_identified_usd=round(totals["direct_savings_identified_usd"], 2),
                rolled_up_savings_identified_usd=round(
                    totals["rolled_up_savings_identified_usd"], 2
                ),
                direct_anomalies_count=totals["direct_anomalies_count"],
                rolled_up_anomalies_count=totals["rolled_up_anomalies_count"],
                direct_service_count=totals["direct_service_count"],
                rolled_up_service_count=totals["rolled_up_service_count"],
                child_count=len(children_map.get(account.id, [])),
                scan_id=totals["scan_id"],
                captured_at=totals["captured_at"],
            )
        )

    root_account_ids = [account_id for account_id in account_by_id if account_id not in parent_by_child]
    if not root_account_ids:
        root_account_ids = list(account_by_id.keys())

    total_direct_cost_usd = round(
        sum(item.direct_cost_usd for item in items),
        2,
    )
    total_rolled_up_cost_usd = round(
        sum(memo[account_id]["rolled_up_cost_usd"] for account_id in root_account_ids),
        2,
    )
    return items, total_direct_cost_usd, total_rolled_up_cost_usd


def _ensure_provider_rollup_account(
    db: Session,
    organization_id: int,
    customer_id: str,
    provider: str,
) -> ProviderAccount:
    normalized_provider = provider.lower()
    identifier = f"{normalized_provider}-aggregate"
    account = (
        db.query(ProviderAccount)
        .filter(
            ProviderAccount.organization_id == organization_id,
            ProviderAccount.customer_id == customer_id,
            ProviderAccount.provider == normalized_provider,
            ProviderAccount.account_identifier == identifier,
        )
        .first()
    )
    if account is None:
        account = ProviderAccount(
            organization_id=organization_id,
            customer_id=customer_id,
            provider=normalized_provider,
            account_identifier=identifier,
            account_name=f"{provider.upper()} Aggregated Spend",
            account_type="provider_rollup",
            metadata_json=json.dumps({"synthetic": True, "source": "scan_aggregate"}),
            is_active=True,
        )
        db.add(account)
        db.flush()
        return account

    account.account_name = f"{provider.upper()} Aggregated Spend"
    account.account_type = "provider_rollup"
    account.metadata_json = json.dumps({"synthetic": True, "source": "scan_aggregate"})
    account.is_active = True
    account.updated_at = datetime.utcnow()
    db.flush()
    return account


def _record_provider_rollup_snapshot(
    db: Session,
    organization_id: int,
    customer_id: str,
    scan_id: str,
    provider: str,
    direct_cost_usd: float,
    savings_identified_usd: float,
    anomalies_count: int,
    service_count: int,
    captured_at: datetime,
) -> None:
    account = _ensure_provider_rollup_account(
        db,
        organization_id=organization_id,
        customer_id=customer_id,
        provider=provider,
    )
    snapshot = (
        db.query(ProviderAccountSnapshot)
        .filter(
            ProviderAccountSnapshot.scan_id == scan_id,
            ProviderAccountSnapshot.provider_account_id == account.id,
        )
        .first()
    )
    if snapshot is None:
        db.add(
            ProviderAccountSnapshot(
                organization_id=organization_id,
                customer_id=customer_id,
                scan_id=scan_id,
                provider_account_id=account.id,
                direct_cost_usd=float(direct_cost_usd or 0.0),
                savings_identified_usd=float(savings_identified_usd or 0.0),
                anomalies_count=int(anomalies_count or 0),
                service_count=int(service_count or 0),
                captured_at=captured_at,
            )
        )
        return

    snapshot.direct_cost_usd = float(direct_cost_usd or 0.0)
    snapshot.savings_identified_usd = float(savings_identified_usd or 0.0)
    snapshot.anomalies_count = int(anomalies_count or 0)
    snapshot.service_count = int(service_count or 0)
    snapshot.captured_at = captured_at


def _csv_response(filename: str, headers: list[str], rows: list[list[Any]]) -> Response:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerows(rows)
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _enforce_roles(membership, allowed_roles: Iterable[UserRole], action: str) -> None:
    if not _auth_enabled():
        return
    require_role(membership, allowed_roles, action)


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


async def _cost_context(period: str = "month", cloud_provider: str = "all") -> Dict[str, Any]:
    providers = ["aws", "azure", "gcp", "oci"] if cloud_provider == "all" else [cloud_provider]
    breakdown: Dict[str, Dict[str, float]] = {}
    total_cost = 0.0

    for provider in providers:
        summary = await _cost_summary_for_provider(provider, period)
        cost = float(summary.get("total_cost_usd", 0) or 0)
        total_cost += cost
        breakdown[provider] = {"cost": round(cost, 2), "percentage": 0.0}

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
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> CredentialResponse:
    """Validate cloud credentials without storing them."""
    membership = _membership_for_scope(current_user, organization_id=payload.get("organization_id"))
    _enforce_roles(membership, [UserRole.OWNER, UserRole.ADMIN], "Credential validation")
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
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> Dict[str, Any]:
    """Validate and store credentials metadata."""
    try:
        membership = _membership_for_scope(
            current_user,
            organization_id=payload.get("organization_id"),
        )
        _enforce_roles(membership, [UserRole.OWNER, UserRole.ADMIN], "Credential storage")
        organization_id, customer_id, scope_ids = _resolve_customer_id(
            current_user=current_user,
            db=credential_manager.db,
            requested_customer_id=payload.get("customer_id"),
            organization_id=membership.organization_id if membership else payload.get("organization_id"),
        )
        credential_payload = {
            k: v for k, v in payload.items() if k not in {"customer_id", "organization_id"}
        }
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
            legacy_customer_ids=scope_ids[1:],
        )
        record_audit_event(
            credential_manager.db,
            organization_id=organization_id,
            actor_user_id=current_user.id if current_user else None,
            action="credential.stored",
            entity_type="credential",
            entity_id=credential.provider,
            metadata={"provider": credential.provider, "scope": customer_id},
        )
        credential_manager.db.commit()
        return {
            "status": "success",
            "message": f"{credential.provider.upper()} credentials stored",
            "provider": credential.provider,
            "organization_id": organization_id,
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
    organization_id: Optional[int] = None,
    credential_manager: CredentialManager = Depends(get_credential_manager),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> Dict[str, Any]:
    try:
        resolved_org_id, scoped_customer_id, scope_ids = _resolve_customer_id(
            current_user,
            credential_manager.db,
            customer_id,
            organization_id=organization_id,
        )
        response = credential_manager.list_credentials_with_aliases(
            scoped_customer_id,
            legacy_customer_ids=scope_ids[1:],
        )
        response["organization_id"] = resolved_org_id
        return response
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to list credentials")
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/credentials/{provider}")
async def delete_credentials(
    provider: str,
    customer_id: Optional[str] = None,
    organization_id: Optional[int] = None,
    credential_manager: CredentialManager = Depends(get_credential_manager),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> Dict[str, Any]:
    try:
        membership = _membership_for_scope(current_user, organization_id=organization_id)
        _enforce_roles(membership, [UserRole.OWNER, UserRole.ADMIN], "Credential deletion")
        resolved_org_id, scoped_customer_id, scope_ids = _resolve_customer_id(
            current_user,
            credential_manager.db,
            customer_id,
            organization_id=organization_id,
        )
        deleted = credential_manager.delete_credentials(
            scoped_customer_id,
            provider,
            legacy_customer_ids=scope_ids[1:],
        )
        if not deleted:
            raise HTTPException(status_code=404, detail="Credential not found")
        record_audit_event(
            credential_manager.db,
            organization_id=resolved_org_id,
            actor_user_id=current_user.id if current_user else None,
            action="credential.deleted",
            entity_type="credential",
            entity_id=provider.lower(),
            metadata={"provider": provider.lower()},
        )
        credential_manager.db.commit()
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
    current_user: Optional[User] = Depends(get_current_user_optional),
    customer_id: Optional[str] = None,
    organization_id: Optional[int] = None,
) -> Dict[str, Any]:
    try:
        membership = _membership_for_scope(current_user, organization_id=organization_id)
        _enforce_roles(membership, [UserRole.OWNER, UserRole.ADMIN], "Scan approval requests")
        resolved_org_id, scoped_customer_id, scope_ids = _resolve_customer_id(
            current_user,
            scanning_manager.db,
            customer_id,
            organization_id=organization_id,
        )
        scanning_manager.create_permission_request(
            customer_id=scoped_customer_id,
            providers=providers,
            notification_email=notification_email,
            legacy_customer_ids=scope_ids[1:],
        )
        approval_request = scanning_manager.request_approval(
            customer_id=scoped_customer_id,
            providers=providers,
        )
        record_audit_event(
            scanning_manager.db,
            organization_id=resolved_org_id,
            actor_user_id=current_user.id if current_user else None,
            action="scan.approval_requested",
            entity_type="scan_permission",
            entity_id=scoped_customer_id,
            metadata={"providers": sorted({provider.lower() for provider in providers})},
        )
        scanning_manager.db.commit()
        return {
            "status": "approval_pending",
            "message": approval_request["message"],
            "action_required": True,
            "approve_url": approval_request["approve_url"],
            "providers": providers,
            "organization_id": resolved_org_id,
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
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> ScanningPermissionResponse:
    try:
        membership = _membership_for_scope(current_user, organization_id=approval.organization_id)
        _enforce_roles(membership, [UserRole.OWNER, UserRole.ADMIN], "Scan approval")
        organization_id, customer_id, scope_ids = _resolve_customer_id(
            current_user,
            scanning_manager.db,
            approval.customer_id,
            organization_id=approval.organization_id,
        )
        approved = scanning_manager.approve_scanning(
            customer_id=customer_id,
            auto_remediate=approval.auto_remediate,
            scan_frequency=approval.scan_frequency,
            notification_email=approval.notification_email,
            monthly_budget_usd=approval.monthly_budget_usd,
            warning_threshold_percent=approval.warning_threshold_percent,
            critical_threshold_percent=approval.critical_threshold_percent,
            notifications_enabled=approval.notifications_enabled,
            legacy_customer_ids=scope_ids[1:],
        )
        record_audit_event(
            scanning_manager.db,
            organization_id=organization_id,
            actor_user_id=current_user.id if current_user else None,
            action="scan.approved",
            entity_type="scan_permission",
            entity_id=customer_id,
            metadata={
                "scan_frequency": approval.scan_frequency,
                "auto_remediate": approval.auto_remediate,
                "budget": approval.monthly_budget_usd,
            },
        )
        scanning_manager.db.commit()
        return ScanningPermissionResponse(
            customer_id=approved["customer_id"],
            organization_id=organization_id,
            state=approved["state"],
            providers=approved["providers"],
            scan_frequency=approved["scan_frequency"],
            auto_remediate=approved["auto_remediate"],
            notification_email=approved["notification_email"],
            monthly_budget_usd=approved["monthly_budget_usd"],
            warning_threshold_percent=approved["warning_threshold_percent"],
            critical_threshold_percent=approved["critical_threshold_percent"],
            notifications_enabled=approved["notifications_enabled"],
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
    organization_id: Optional[int] = None,
    scanning_manager: ScanningManager = Depends(get_scanning_manager),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> ScanningPermissionResponse:
    try:
        resolved_org_id, scoped_customer_id, scope_ids = _resolve_customer_id(
            current_user,
            scanning_manager.db,
            customer_id,
            organization_id=organization_id,
        )
        permission = scanning_manager.get_permission_status(
            scoped_customer_id,
            legacy_customer_ids=scope_ids[1:],
        )
        return ScanningPermissionResponse(organization_id=resolved_org_id, **permission)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to get permission status")
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/scanning/pause")
async def pause_scanning(
    customer_id: Optional[str] = None,
    organization_id: Optional[int] = None,
    scanning_manager: ScanningManager = Depends(get_scanning_manager),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> Dict[str, Any]:
    try:
        membership = _membership_for_scope(current_user, organization_id=organization_id)
        _enforce_roles(membership, [UserRole.OWNER, UserRole.ADMIN], "Scan pause")
        resolved_org_id, scoped_customer_id, scope_ids = _resolve_customer_id(
            current_user,
            scanning_manager.db,
            customer_id,
            organization_id=organization_id,
        )
        payload = scanning_manager.pause_scanning(
            scoped_customer_id,
            legacy_customer_ids=scope_ids[1:],
        )
        record_audit_event(
            scanning_manager.db,
            organization_id=resolved_org_id,
            actor_user_id=current_user.id if current_user else None,
            action="scan.paused",
            entity_type="scan_permission",
            entity_id=scoped_customer_id,
        )
        scanning_manager.db.commit()
        return payload
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to pause scanning")
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/scanning/resume")
async def resume_scanning(
    customer_id: Optional[str] = None,
    organization_id: Optional[int] = None,
    scanning_manager: ScanningManager = Depends(get_scanning_manager),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> Dict[str, Any]:
    try:
        membership = _membership_for_scope(current_user, organization_id=organization_id)
        _enforce_roles(membership, [UserRole.OWNER, UserRole.ADMIN], "Scan resume")
        resolved_org_id, scoped_customer_id, scope_ids = _resolve_customer_id(
            current_user,
            scanning_manager.db,
            customer_id,
            organization_id=organization_id,
        )
        payload = scanning_manager.resume_scanning(
            scoped_customer_id,
            legacy_customer_ids=scope_ids[1:],
        )
        record_audit_event(
            scanning_manager.db,
            organization_id=resolved_org_id,
            actor_user_id=current_user.id if current_user else None,
            action="scan.resumed",
            entity_type="scan_permission",
            entity_id=scoped_customer_id,
        )
        scanning_manager.db.commit()
        return payload
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
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> ScanProgressResponse:
    try:
        membership = _membership_for_scope(current_user, organization_id=scan_request.organization_id)
        _enforce_roles(
            membership,
            [UserRole.OWNER, UserRole.ADMIN, UserRole.ANALYST],
            "Scan start",
        )
        organization_id, customer_id, scope_ids = _resolve_customer_id(
            current_user,
            scanning_manager.db,
            scan_request.customer_id,
            organization_id=scan_request.organization_id,
        )
        permission = scanning_manager.get_permission_status(
            customer_id,
            legacy_customer_ids=scope_ids[1:],
        )
        if permission["state"] not in [ScanningState.APPROVED.value, ScanningState.RUNNING.value]:
            raise HTTPException(
                status_code=403,
                detail=f"Scanning not approved. Current state: {permission['state']}",
            )

        providers_to_scan = scan_request.providers or permission["providers"]
        if not providers_to_scan:
            providers_to_scan = ["aws", "azure", "gcp", "oci"]

        scan_id = f"scan_{customer_id}_{int(datetime.utcnow().timestamp())}"
        scanning_manager.create_scan_run(scan_id, customer_id, providers_to_scan)
        record_audit_event(
            scanning_manager.db,
            organization_id=organization_id,
            actor_user_id=current_user.id if current_user else None,
            action="scan.started",
            entity_type="scan_run",
            entity_id=scan_id,
            metadata={"providers": providers_to_scan},
        )
        scanning_manager.db.commit()
        background_tasks.add_task(
            _run_cost_analysis,
            scan_id=scan_id,
            organization_id=organization_id,
            customer_id=customer_id,
            providers=providers_to_scan,
        )

        return ScanProgressResponse(
            scan_id=scan_id,
            customer_id=customer_id,
            organization_id=organization_id,
            state=ScanningState.RUNNING.value,
            progress=0,
            providers=providers_to_scan,
            started_at=datetime.utcnow(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to start scan")
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/scanning/{scan_id}/progress", response_model=ScanProgressResponse)
async def get_scan_progress(
    scan_id: str,
    scanning_manager: ScanningManager = Depends(get_scanning_manager),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> ScanProgressResponse:
    row = scanning_manager.get_scan_run(scan_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    organization_id, _, scope_ids = _resolve_customer_id(current_user, scanning_manager.db)
    if row["customer_id"] not in scope_ids:
        raise HTTPException(status_code=404, detail="Scan not found")
    return ScanProgressResponse(
        scan_id=row["scan_id"],
        customer_id=row["customer_id"],
        organization_id=organization_id,
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
    organization_id: Optional[int] = None,
    limit: int = 10,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> List[ScanHistoryItem]:
    resolved_org_id, _, scope_ids = _resolve_customer_id(
        current_user,
        db,
        organization_id=organization_id,
    )
    rows = (
        db.query(ScanRunRecord)
        .filter(ScanRunRecord.customer_id.in_(scope_ids))
        .order_by(ScanRunRecord.started_at.desc())
        .limit(max(1, min(limit, 50)))
        .all()
    )
    return [_scan_row_to_history_item(row, resolved_org_id) for row in rows]


@router.get("/hierarchy/accounts", response_model=ProviderAccountRollupResponse)
async def get_provider_account_rollups(
    customer_id: Optional[str] = None,
    organization_id: Optional[int] = None,
    provider: Optional[str] = None,
    scan_id: Optional[str] = None,
    include_inactive: bool = False,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> ProviderAccountRollupResponse:
    resolved_org_id, scoped_customer_id, _ = _resolve_customer_id(
        current_user,
        db,
        customer_id,
        organization_id=organization_id,
    )
    normalized_provider = str(provider or "").strip().lower() or None

    account_query = db.query(ProviderAccount).filter(
        ProviderAccount.organization_id == resolved_org_id,
        ProviderAccount.customer_id == scoped_customer_id,
    )
    if normalized_provider:
        account_query = account_query.filter(ProviderAccount.provider == normalized_provider)
    if not include_inactive:
        account_query = account_query.filter(ProviderAccount.is_active.is_(True))

    accounts = (
        account_query.order_by(
            ProviderAccount.provider.asc(),
            ProviderAccount.account_name.asc(),
        ).all()
    )
    if not accounts:
        return ProviderAccountRollupResponse(
            organization_id=resolved_org_id,
            customer_id=scoped_customer_id,
            provider=normalized_provider,
            scan_id=scan_id,
            generated_at=datetime.utcnow(),
            total_direct_cost_usd=0.0,
            total_rolled_up_cost_usd=0.0,
            items=[],
        )

    account_ids = [row.id for row in accounts]
    links = (
        db.query(ProviderAccountLink)
        .filter(
            ProviderAccountLink.organization_id == resolved_org_id,
            ProviderAccountLink.child_account_id.in_(account_ids),
        )
        .all()
    )

    snapshot_query = db.query(ProviderAccountSnapshot).filter(
        ProviderAccountSnapshot.organization_id == resolved_org_id,
        ProviderAccountSnapshot.customer_id == scoped_customer_id,
        ProviderAccountSnapshot.provider_account_id.in_(account_ids),
    )
    if scan_id:
        snapshot_query = snapshot_query.filter(ProviderAccountSnapshot.scan_id == scan_id)
    snapshots = (
        snapshot_query.order_by(
            ProviderAccountSnapshot.captured_at.desc(),
            ProviderAccountSnapshot.id.desc(),
        ).all()
    )

    items, total_direct_cost_usd, total_rolled_up_cost_usd = _provider_account_rollups(
        accounts,
        links,
        snapshots,
    )
    return ProviderAccountRollupResponse(
        organization_id=resolved_org_id,
        customer_id=scoped_customer_id,
        provider=normalized_provider,
        scan_id=scan_id,
        generated_at=datetime.utcnow(),
        total_direct_cost_usd=total_direct_cost_usd,
        total_rolled_up_cost_usd=total_rolled_up_cost_usd,
        items=items,
    )


@router.get("/scanning/{scan_id}/snapshots", response_model=List[SnapshotSummary])
async def get_scan_snapshots(
    scan_id: str,
    organization_id: Optional[int] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> List[SnapshotSummary]:
    _, _, scope_ids = _resolve_customer_id(current_user, db, organization_id=organization_id)
    run = (
        db.query(ScanRunRecord)
        .filter(ScanRunRecord.scan_id == scan_id, ScanRunRecord.customer_id.in_(scope_ids))
        .first()
    )
    if run is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    rows = (
        db.query(CostSnapshot)
        .filter(CostSnapshot.scan_id == scan_id)
        .order_by(CostSnapshot.provider.asc())
        .all()
    )
    return [
        SnapshotSummary(
            scan_id=row.scan_id,
            provider=row.provider,
            total_cost_usd=float(row.total_cost_usd or 0.0),
            savings_identified_usd=float(row.savings_identified_usd or 0.0),
            anomalies_count=int(row.anomalies_count or 0),
            captured_at=row.captured_at,
        )
        for row in rows
    ]


@router.get("/scanning/{scan_id}/diff", response_model=ScanDiffResponse)
async def get_scan_diff(
    scan_id: str,
    base_scan_id: Optional[str] = None,
    organization_id: Optional[int] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> ScanDiffResponse:
    resolved_org_id, _, scope_ids = _resolve_customer_id(
        current_user,
        db,
        organization_id=organization_id,
    )
    current_run = (
        db.query(ScanRunRecord)
        .filter(ScanRunRecord.scan_id == scan_id, ScanRunRecord.customer_id.in_(scope_ids))
        .first()
    )
    if current_run is None:
        raise HTTPException(status_code=404, detail="Scan not found")

    previous_run = None
    if base_scan_id:
        previous_run = (
            db.query(ScanRunRecord)
            .filter(ScanRunRecord.scan_id == base_scan_id, ScanRunRecord.customer_id.in_(scope_ids))
            .first()
        )
    else:
        previous_run = (
            db.query(ScanRunRecord)
            .filter(
                ScanRunRecord.customer_id.in_(scope_ids),
                ScanRunRecord.completed_at.is_not(None),
                ScanRunRecord.scan_id != current_run.scan_id,
                ScanRunRecord.started_at < current_run.started_at,
            )
            .order_by(ScanRunRecord.started_at.desc())
            .first()
        )

    current_snapshots = {
        row.provider: row
        for row in db.query(CostSnapshot).filter(CostSnapshot.scan_id == current_run.scan_id).all()
    }
    previous_snapshots = (
        {
            row.provider: row
            for row in db.query(CostSnapshot)
            .filter(CostSnapshot.scan_id == previous_run.scan_id)
            .all()
        }
        if previous_run
        else {}
    )

    providers = sorted(set(current_snapshots.keys()) | set(previous_snapshots.keys()))
    entries: list[ScanDiffEntry] = []
    total_current = 0.0
    total_previous = 0.0
    for provider in providers:
        current_snapshot = current_snapshots.get(provider)
        previous_snapshot = previous_snapshots.get(provider)
        current_cost = _snapshot_total(current_snapshot)
        previous_cost = _snapshot_total(previous_snapshot)
        total_current += current_cost
        total_previous += previous_cost
        delta = current_cost - previous_cost
        entries.append(
            ScanDiffEntry(
                provider=provider,
                current_cost_usd=current_cost,
                previous_cost_usd=previous_cost,
                delta_cost_usd=delta,
                delta_percent=((delta / previous_cost) * 100) if previous_cost > 0 else None,
                current_anomalies=int(current_snapshot.anomalies_count or 0)
                if current_snapshot
                else 0,
                previous_anomalies=int(previous_snapshot.anomalies_count or 0)
                if previous_snapshot
                else 0,
            )
        )

    return ScanDiffResponse(
        organization_id=resolved_org_id,
        current_scan_id=current_run.scan_id,
        previous_scan_id=previous_run.scan_id if previous_run else None,
        total_current_cost_usd=round(total_current, 2),
        total_previous_cost_usd=round(total_previous, 2),
        total_delta_cost_usd=round(total_current - total_previous, 2),
        entries=entries,
    )


@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    organization_id: Optional[int] = None,
    limit: int = 30,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> List[AuditLogResponse]:
    membership = _membership_for_scope(current_user, organization_id=organization_id)
    _enforce_roles(membership, [UserRole.OWNER, UserRole.ADMIN], "Audit log access")
    if not _auth_enabled():
        _, organization = ensure_public_workspace(db)
        organization_id = organization.id
    else:
        organization_id = membership.organization_id
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.organization_id == organization_id)
        .order_by(AuditLog.created_at.desc())
        .limit(max(1, min(limit, 100)))
        .all()
    )
    return [
        AuditLogResponse(
            id=row.id,
            action=row.action,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            actor_user_id=row.actor_user_id,
            metadata=_safe_json_load(row.metadata_json or "{}", {}),
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.get("/alerts", response_model=List[AlertEventResponse])
async def get_alerts(
    organization_id: Optional[int] = None,
    limit: int = 30,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> List[AlertEventResponse]:
    membership = _membership_for_scope(current_user, organization_id=organization_id)
    if not _auth_enabled():
        _, organization = ensure_public_workspace(db)
        organization_id = organization.id
    else:
        organization_id = membership.organization_id
    rows = (
        db.query(AlertEvent)
        .filter(AlertEvent.organization_id == organization_id)
        .order_by(AlertEvent.created_at.desc())
        .limit(max(1, min(limit, 100)))
        .all()
    )
    return [
        AlertEventResponse(
            id=row.id,
            alert_type=row.alert_type,
            severity=row.severity,
            title=row.title,
            message=row.message,
            delivered_channels=_parse_json_list(row.delivered_channels_json or "[]"),
            acknowledged_at=row.acknowledged_at,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post("/alerts/{alert_id}/acknowledge", response_model=AlertEventResponse)
async def acknowledge_alert(
    alert_id: int,
    organization_id: Optional[int] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> AlertEventResponse:
    membership = _membership_for_scope(current_user, organization_id=organization_id)
    _enforce_roles(
        membership,
        [UserRole.OWNER, UserRole.ADMIN, UserRole.ANALYST],
        "Alert acknowledgement",
    )
    if not _auth_enabled():
        _, organization = ensure_public_workspace(db)
        resolved_org_id = organization.id
    else:
        resolved_org_id = membership.organization_id
    row = (
        db.query(AlertEvent)
        .filter(AlertEvent.id == alert_id, AlertEvent.organization_id == resolved_org_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    row.acknowledged_at = datetime.utcnow()
    row.acknowledged_by_user_id = current_user.id if current_user else None
    record_audit_event(
        db,
        organization_id=resolved_org_id,
        actor_user_id=current_user.id if current_user else None,
        action="alert.acknowledged",
        entity_type="alert",
        entity_id=str(alert_id),
    )
    db.commit()
    return AlertEventResponse(
        id=row.id,
        alert_type=row.alert_type,
        severity=row.severity,
        title=row.title,
        message=row.message,
        delivered_channels=_parse_json_list(row.delivered_channels_json or "[]"),
        acknowledged_at=row.acknowledged_at,
        created_at=row.created_at,
    )


@router.get("/exports/scan-history.csv")
async def export_scan_history_csv(
    organization_id: Optional[int] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> Response:
    resolved_org_id, _, scope_ids = _resolve_customer_id(
        current_user,
        db,
        organization_id=organization_id,
    )
    rows = (
        db.query(ScanRunRecord)
        .filter(ScanRunRecord.customer_id.in_(scope_ids))
        .order_by(ScanRunRecord.started_at.desc())
        .limit(200)
        .all()
    )
    return _csv_response(
        f"optiora-scan-history-org-{resolved_org_id}.csv",
        [
            "scan_id",
            "state",
            "providers",
            "started_at",
            "completed_at",
            "total_resources",
            "anomalies_found",
            "savings_identified",
        ],
        [
            [
                row.scan_id,
                row.state,
                ", ".join(_parse_json_list(row.providers_json or "[]")),
                row.started_at.isoformat() if row.started_at else "",
                row.completed_at.isoformat() if row.completed_at else "",
                row.total_resources or 0,
                row.anomalies_found or 0,
                float(row.savings_identified or 0.0),
            ]
            for row in rows
        ],
    )


@router.get("/exports/audit-logs.csv")
async def export_audit_logs_csv(
    organization_id: Optional[int] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> Response:
    membership = _membership_for_scope(current_user, organization_id=organization_id)
    _enforce_roles(membership, [UserRole.OWNER, UserRole.ADMIN], "Audit log export")
    if not _auth_enabled():
        _, organization = ensure_public_workspace(db)
        resolved_org_id = organization.id
    else:
        resolved_org_id = membership.organization_id
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.organization_id == resolved_org_id)
        .order_by(AuditLog.created_at.desc())
        .limit(500)
        .all()
    )
    return _csv_response(
        f"optiora-audit-log-org-{resolved_org_id}.csv",
        ["created_at", "action", "entity_type", "entity_id", "actor_user_id", "metadata_json"],
        [
            [
                row.created_at.isoformat() if row.created_at else "",
                row.action,
                row.entity_type,
                row.entity_id or "",
                row.actor_user_id or "",
                row.metadata_json,
            ]
            for row in rows
        ],
    )


@router.get("/exports/alerts.csv")
async def export_alerts_csv(
    organization_id: Optional[int] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> Response:
    membership = _membership_for_scope(current_user, organization_id=organization_id)
    if not _auth_enabled():
        _, organization = ensure_public_workspace(db)
        resolved_org_id = organization.id
    else:
        resolved_org_id = membership.organization_id
    rows = (
        db.query(AlertEvent)
        .filter(AlertEvent.organization_id == resolved_org_id)
        .order_by(AlertEvent.created_at.desc())
        .limit(500)
        .all()
    )
    return _csv_response(
        f"optiora-alerts-org-{resolved_org_id}.csv",
        [
            "created_at",
            "severity",
            "alert_type",
            "title",
            "message",
            "delivered_channels",
            "acknowledged_at",
        ],
        [
            [
                row.created_at.isoformat() if row.created_at else "",
                row.severity,
                row.alert_type,
                row.title,
                row.message,
                ", ".join(_parse_json_list(row.delivered_channels_json or "[]")),
                row.acknowledged_at.isoformat() if row.acknowledged_at else "",
            ]
            for row in rows
        ],
    )


@router.get("/exports/scans/{scan_id}/diff.csv")
async def export_scan_diff_csv(
    scan_id: str,
    base_scan_id: Optional[str] = None,
    organization_id: Optional[int] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> Response:
    diff = await get_scan_diff(
        scan_id=scan_id,
        base_scan_id=base_scan_id,
        organization_id=organization_id,
        current_user=current_user,
        db=db,
    )
    return _csv_response(
        f"optiora-scan-diff-{scan_id}.csv",
        [
            "provider",
            "current_cost_usd",
            "previous_cost_usd",
            "delta_cost_usd",
            "delta_percent",
            "current_anomalies",
            "previous_anomalies",
        ],
        [
            [
                entry.provider,
                entry.current_cost_usd,
                entry.previous_cost_usd,
                entry.delta_cost_usd,
                entry.delta_percent if entry.delta_percent is not None else "",
                entry.current_anomalies,
                entry.previous_anomalies,
            ]
            for entry in diff.entries
        ],
    )


@router.get("/dashboard/costs")
@router.get("/costs")
async def dashboard_costs(period: str = "month", cloud_provider: str = "all") -> Dict[str, Any]:
    context = await _cost_context(period, cloud_provider)

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
    }


@router.get("/dashboard/anomalies")
@router.get("/anomalies")
async def dashboard_anomalies(
    cloud_provider: str = "all",
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
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
                "timestamp": row.get("date", datetime.utcnow().isoformat()),
                "change": float(row.get("increase_percent", 0) or 0),
            }
        )

    total = len(mapped)
    sliced = mapped[offset : offset + limit]
    return {"items": sliced, "total": total, "limit": limit, "offset": offset}


@router.get("/dashboard/recommendations")
@router.get("/recommendations")
async def dashboard_recommendations(
    cloud_provider: str = "all",
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    context = await _cost_context("month", cloud_provider)
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

    total = len(mapped)
    sliced = mapped[offset : offset + limit]
    return {"items": sliced, "total": total, "limit": limit, "offset": offset}


@router.get("/forecast")
async def dashboard_forecast(
    months: int = 12,
    cloud_provider: str = "all",
) -> Dict[str, Any]:
    context = await _cost_context("month", cloud_provider)
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
async def dashboard_analytics(cloud_provider: str = "all") -> Dict[str, Any]:
    context = await _cost_context("month", cloud_provider)
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
async def provider_diagnostics(current_user: Optional[User] = Depends(get_current_user_optional)) -> List[ProviderDiagnostic]:
    """Return provider readiness checks without exposing secret values."""
    _ = current_user
    return _provider_diagnostics()


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    return {
        "status": "healthy",
        "version": __version__,
        "timestamp": datetime.utcnow().isoformat(),
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
            "scan_history": True,
            "dashboard_endpoints": True,
            "finops_analytics": True,
            "forecasting": True,
            "genai_advisor": True,
            "provider_diagnostics": True,
            "audit_logging": True,
            "budget_alerts": True,
            "csv_exports": True,
            "provider_hierarchy": True,
        },
    }


async def _run_cost_analysis(
    scan_id: str,
    organization_id: int,
    customer_id: str,
    providers: List[str],
) -> None:
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
        total_cost_all_providers = 0.0
        now = datetime.utcnow()

        for provider in providers:
            summary = await _cost_summary_for_provider(provider, "month")
            if "error" in summary:
                continue

            total_cost = float(summary.get("total_cost_usd", 0) or 0)
            total_cost_all_providers += total_cost
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
            _record_provider_rollup_snapshot(
                db,
                organization_id=organization_id,
                customer_id=customer_id,
                scan_id=scan_id,
                provider=provider,
                direct_cost_usd=total_cost,
                savings_identified_usd=provider_savings,
                anomalies_count=provider_anomalies,
                service_count=len(summary.get("top_services", []) or []),
                captured_at=now,
            )

        permission = (
            db.query(ScanningPermissionRecord)
            .filter(ScanningPermissionRecord.customer_id == customer_id)
            .first()
        )
        alert_event = evaluate_budget_alert(
            db,
            organization_id=organization_id,
            customer_id=customer_id,
            scan_id=scan_id,
            total_cost_usd=total_cost_all_providers,
            permission=permission,
        )
        record_audit_event(
            db,
            organization_id=organization_id,
            actor_user_id=None,
            action="scan.completed",
            entity_type="scan_run",
            entity_id=scan_id,
            metadata={
                "providers": providers,
                "total_cost_usd": round(total_cost_all_providers, 2),
                "anomalies_found": anomalies_found,
                "budget_alert": bool(alert_event),
            },
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
