"""
REST API routes for OptiOra.

Handles:
- Credential validation/storage
- Scanning permissions and progress
- Dashboard data endpoints
"""

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional, Union, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .auth_routes import get_current_membership, get_current_user
from .credentials import CredentialManager, CredentialStatus, CredentialValidator
from .config import Config
from .orm_models import (
    SessionLocal,
    User,
    CostSnapshot,
    UserOrganization,
    ScanRunRecord,
    AlertEvent,
    AuditLog,
    ProviderAccount,
    ProviderAccountSnapshot,
    ScanningPermissionRecord,
    get_db,
)
from .scanning import ScanningManager, ScanningState
from .tools import anomalies, aws_costs, finops_analytics, recommendations
from .tools import azure_costs, gcp_costs, oci_costs
from . import __version__

logger = logging.getLogger(__name__)
_scheduler_running = False

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


def get_credential_manager(db: Session = Depends(get_db)) -> CredentialManager:
    return CredentialManager(db)


def get_scanning_manager(db: Session = Depends(get_db)) -> ScanningManager:
    return ScanningManager(db)


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


def _latest_completed_scans(customer_id: str, limit: int = 2) -> List[ScanRunRecord]:
    db = SessionLocal()
    try:
        return (
            db.query(ScanRunRecord)
            .filter(
                ScanRunRecord.customer_id == customer_id,
                ScanRunRecord.state == ScanningState.COMPLETED.value,
            )
            .order_by(ScanRunRecord.started_at.desc())
            .limit(limit)
            .all()
        )
    finally:
        db.close()


def _snapshot_map(scan_id: str) -> Dict[str, CostSnapshot]:
    db = SessionLocal()
    try:
        rows = db.query(CostSnapshot).filter(CostSnapshot.scan_id == scan_id).all()
        return {row.provider: row for row in rows}
    finally:
        db.close()


async def _cost_context(period: str = "month", cloud_provider: str = "all") -> Dict[str, Any]:
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

        scan_id = f"scan_{customer_id}_{int(datetime.utcnow().timestamp())}"
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
            started_at=datetime.utcnow(),
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
    """Run the scan scheduler loop once on-demand (owner/admin only recommended)."""
    _ = (current_user, membership)
    return await run_scheduled_scans_once()


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
    finally:
        db.close()

    items: List[ProviderAccountRollupItem] = []
    total_direct = 0.0
    for snapshot, account in rows:
        cost = float(snapshot.direct_cost_usd or 0.0)
        total_direct += cost
        items.append(
            ProviderAccountRollupItem(
                account_id=account.id,
                provider=account.provider,
                account_identifier=account.account_identifier,
                account_name=account.account_name,
                account_type=account.account_type,
                parent_account_id=None,
                parent_account_identifier=None,
                direct_cost_usd=round(cost, 2),
                rolled_up_cost_usd=round(cost, 2),
                direct_savings_identified_usd=round(float(snapshot.savings_identified_usd or 0.0), 2),
                rolled_up_savings_identified_usd=round(float(snapshot.savings_identified_usd or 0.0), 2),
                direct_anomalies_count=int(snapshot.anomalies_count or 0),
                rolled_up_anomalies_count=int(snapshot.anomalies_count or 0),
                direct_service_count=int(snapshot.service_count or 0),
                rolled_up_service_count=int(snapshot.service_count or 0),
                child_count=0,
                scan_id=snapshot.scan_id,
                captured_at=snapshot.captured_at.isoformat() if snapshot.captured_at else None,
            )
        )

    return ProviderAccountRollupResponse(
        organization_id=organization_id,
        customer_id=customer_id,
        provider=provider,
        scan_id=scan_id,
        generated_at=datetime.utcnow().isoformat(),
        total_direct_cost_usd=round(total_direct, 2),
        total_rolled_up_cost_usd=round(total_direct, 2),
        items=items,
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
        row.acknowledged_at = datetime.utcnow()
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


@router.get("/dashboard/costs")
@router.get("/costs")
async def dashboard_costs(
    period: str = "month",
    cloud_provider: str = "all",
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> Dict[str, Any]:
    _ = (current_user, membership)
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
                "timestamp": row.get("date", datetime.utcnow().isoformat()),
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
) -> List[Dict[str, Any]]:
    _ = (current_user, membership)
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
    return mapped


@router.get("/forecast")
async def dashboard_forecast(
    months: int = 12,
    cloud_provider: str = "all",
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> Dict[str, Any]:
    _ = (current_user, membership)
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
async def dashboard_analytics(
    cloud_provider: str = "all",
    current_user: User = Depends(get_current_user),
    membership: UserOrganization = Depends(get_current_membership),
) -> Dict[str, Any]:
    _ = (current_user, membership)
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
async def provider_diagnostics(current_user: User = Depends(get_current_user)) -> List[ProviderDiagnostic]:
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
            "dashboard_endpoints": True,
            "finops_analytics": True,
            "forecasting": True,
            "genai_advisor": True,
            "provider_diagnostics": True,
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
        now = datetime.utcnow()

        for provider in providers:
            summary = await _cost_summary_for_provider(provider, "month")
            if "error" in summary:
                continue

            total_cost = float(summary.get("total_cost_usd", 0) or 0)
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


async def run_scheduled_scans_once() -> Dict[str, Any]:
    """Trigger due scans for approved organizations based on configured cadence."""
    global _scheduler_running
    if _scheduler_running:
        return {"status": "busy", "started": 0}
    _scheduler_running = True
    started = 0
    now = datetime.utcnow()
    db = SessionLocal()
    try:
        permissions = (
            db.query(ScanningPermissionRecord)
            .filter(ScanningPermissionRecord.state.in_([ScanningState.APPROVED.value, ScanningState.RUNNING.value]))
            .all()
        )
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
            organization_id = _organization_id_from_customer_id(permission.customer_id)
            if organization_id is not None:
                db.add(
                    AuditLog(
                        organization_id=organization_id,
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
    return {"status": "ok", "started": started}
