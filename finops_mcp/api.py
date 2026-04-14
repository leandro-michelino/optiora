"""
REST API routes for OptiOra.
Handles credential management, scanning permissions, and cost analysis.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging

from .orm_models import get_db
from .credentials import CredentialValidator, CredentialManager, CredentialStatus
from .scanning import ScanningManager, ScanningState

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["api"])


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

def get_credential_manager(db: Session = Depends(get_db)) -> CredentialManager:
    return CredentialManager(db)


def get_scanning_manager(db: Session = Depends(get_db)) -> ScanningManager:
    return ScanningManager(db)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class CredentialInput(BaseModel):
    """Base credential input model."""
    provider: str = Field(..., description="Cloud provider: aws, azure, gcp, oci")


class AWSCredentialInput(CredentialInput):
    provider: str = "aws"
    access_key_id: str
    secret_access_key: str
    region: Optional[str] = "us-east-1"


class AzureCredentialInput(CredentialInput):
    provider: str = "azure"
    subscription_id: str
    tenant_id: str
    client_id: str
    client_secret: str


class GCPCredentialInput(CredentialInput):
    provider: str = "gcp"
    project_id: str
    service_account_json: Dict[str, Any]


class OCICredentialInput(CredentialInput):
    provider: str = "oci"
    config_file: str
    profile: Optional[str] = "DEFAULT"


class CredentialResponse(BaseModel):
    provider: str
    is_valid: bool
    message: str
    tested_at: Optional[datetime] = None
    error_details: Optional[str] = None


class ScanningApprovalRequest(BaseModel):
    customer_id: str
    auto_remediate: bool = False
    scan_frequency: str = "daily"
    notification_email: str


class ScanningPermissionResponse(BaseModel):
    customer_id: str
    state: str
    providers: List[str]
    scan_frequency: str
    auto_remediate: bool
    created_at: str
    approved_at: Optional[str] = None


class StartScanRequest(BaseModel):
    customer_id: str
    providers: Optional[List[str]] = None


class ScanProgressResponse(BaseModel):
    scan_id: str
    customer_id: str
    state: str
    progress: int = 0
    providers: List[str]
    started_at: datetime
    completed_at: Optional[datetime] = None
    total_resources: int = 0
    anomalies_found: int = 0
    savings_identified: float = 0.0


# ---------------------------------------------------------------------------
# Credential endpoints
# ---------------------------------------------------------------------------

@router.post("/credentials/validate", response_model=CredentialResponse)
async def validate_credentials(credential: CredentialInput) -> CredentialResponse:
    """Validate cloud credentials without storing them."""
    validator = CredentialValidator()
    try:
        provider = credential.provider.lower()
        if provider == "aws":
            cred: AWSCredentialInput = credential  # type: ignore[assignment]
            result = validator.validate_aws(
                cred.access_key_id, cred.secret_access_key, cred.region
            )
        elif provider == "azure":
            cred: AzureCredentialInput = credential  # type: ignore[assignment]
            result = validator.validate_azure(
                cred.subscription_id, cred.tenant_id, cred.client_id, cred.client_secret
            )
        elif provider == "gcp":
            cred: GCPCredentialInput = credential  # type: ignore[assignment]
            result = validator.validate_gcp(cred.project_id, cred.service_account_json)
        elif provider == "oci":
            cred: OCICredentialInput = credential  # type: ignore[assignment]
            result = validator.validate_oci(cred.config_file, cred.profile)
        else:
            raise ValueError(f"Unsupported provider: {credential.provider}")

        return CredentialResponse(
            provider=result.provider,
            is_valid=result.is_valid,
            message=result.message,
            tested_at=result.tested_at,
            error_details=result.error_details,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Credential validation failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/credentials/add")
async def add_credentials(
    customer_id: str,
    credential: CredentialInput,
    background_tasks: BackgroundTasks,
    credential_manager: CredentialManager = Depends(get_credential_manager),
) -> dict:
    """Validate then store credentials securely (encrypted)."""
    validation = await validate_credentials(credential)
    if not validation.is_valid:
        raise HTTPException(
            status_code=400,
            detail=f"Credential validation failed: {validation.message}",
        )
    credential_manager.store_credentials(
        customer_id=customer_id,
        provider=credential.provider,
        credentials=credential.model_dump(),
        is_active=True,
    )
    logger.info("Stored %s credentials for %s", credential.provider, customer_id)
    return {
        "status": "success",
        "message": f"{credential.provider.upper()} credentials stored securely",
        "provider": credential.provider,
        "next_step": "request_approval",
    }


@router.get("/credentials")
async def list_credentials(
    customer_id: str,
    credential_manager: CredentialManager = Depends(get_credential_manager),
) -> dict:
    """List stored credentials for a customer (no sensitive data returned)."""
    try:
        return credential_manager.list_credentials(customer_id)
    except Exception as exc:
        logger.error("Failed to list credentials: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/credentials/{provider}")
async def delete_credentials(
    provider: str,
    customer_id: str,
    credential_manager: CredentialManager = Depends(get_credential_manager),
) -> dict:
    """Delete stored credentials for a cloud provider."""
    try:
        credential_manager.delete_credentials(customer_id, provider)
        return {"status": "success", "message": f"{provider.upper()} credentials deleted", "provider": provider}
    except Exception as exc:
        logger.error("Failed to delete credentials: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# Scanning permission endpoints
# ---------------------------------------------------------------------------

@router.post("/scanning/request-approval")
async def request_scanning_approval(
    customer_id: str,
    providers: List[str],
    notification_email: str,
    scanning_manager: ScanningManager = Depends(get_scanning_manager),
) -> dict:
    """Request customer approval before beginning cost analysis."""
    try:
        scanning_manager.create_permission_request(
            customer_id=customer_id,
            providers=providers,
            notification_email=notification_email,
        )
        approval_request = scanning_manager.request_approval(
            customer_id=customer_id,
            providers=providers,
        )
        return {
            "status": "approval_pending",
            "message": approval_request["message"],
            "action_required": True,
            "approve_url": approval_request["approve_url"],
            "providers": providers,
            "customer_id": customer_id,
        }
    except Exception as exc:
        logger.error("Failed to request approval: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/scanning/approve", response_model=ScanningPermissionResponse)
async def approve_scanning(
    approval: ScanningApprovalRequest,
    scanning_manager: ScanningManager = Depends(get_scanning_manager),
) -> ScanningPermissionResponse:
    """Customer approves scanning to begin."""
    try:
        approved = scanning_manager.approve_scanning(
            customer_id=approval.customer_id,
            auto_remediate=approval.auto_remediate,
            scan_frequency=approval.scan_frequency,
        )
        return ScanningPermissionResponse(
            customer_id=approved["customer_id"],
            state=approved["state"],
            providers=[],
            scan_frequency=approved["scan_frequency"],
            auto_remediate=approved["auto_remediate"],
            created_at=datetime.now().isoformat(),
            approved_at=approved["approved_at"],
        )
    except Exception as exc:
        logger.error("Failed to approve scanning: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/scanning/permission", response_model=ScanningPermissionResponse)
async def get_scanning_permission(
    customer_id: str,
    scanning_manager: ScanningManager = Depends(get_scanning_manager),
) -> ScanningPermissionResponse:
    """Get current scanning permission status."""
    try:
        permission = scanning_manager.get_permission_status(customer_id)
        return ScanningPermissionResponse(
            customer_id=permission["customer_id"],
            state=permission["state"],
            providers=permission["providers"],
            scan_frequency=permission["scan_frequency"],
            auto_remediate=permission["auto_remediate"],
            created_at=permission["created_at"],
        )
    except Exception as exc:
        logger.error("Failed to get permission status: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/scanning/pause")
async def pause_scanning(
    customer_id: str,
    scanning_manager: ScanningManager = Depends(get_scanning_manager),
) -> dict:
    """Pause active scanning for a customer."""
    try:
        return scanning_manager.pause_scanning(customer_id)
    except Exception as exc:
        logger.error("Failed to pause scanning: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/scanning/resume")
async def resume_scanning(
    customer_id: str,
    scanning_manager: ScanningManager = Depends(get_scanning_manager),
) -> dict:
    """Resume paused scanning for a customer."""
    try:
        return scanning_manager.resume_scanning(customer_id)
    except Exception as exc:
        logger.error("Failed to resume scanning: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# Cost analysis / scan endpoints
# ---------------------------------------------------------------------------

@router.post("/scanning/start", response_model=ScanProgressResponse)
async def start_scan(
    scan_request: StartScanRequest,
    background_tasks: BackgroundTasks,
    scanning_manager: ScanningManager = Depends(get_scanning_manager),
) -> ScanProgressResponse:
    """Begin cost analysis scan (requires prior scanning approval)."""
    try:
        permission = scanning_manager.get_permission_status(scan_request.customer_id)
        if permission["state"] != ScanningState.APPROVED:
            raise HTTPException(
                status_code=403,
                detail=f"Scanning not approved. Current state: {permission['state']}",
            )
        providers_to_scan = scan_request.providers or permission["providers"]
        scan_id = f"scan_{scan_request.customer_id}_{int(datetime.now().timestamp())}"
        background_tasks.add_task(
            _run_cost_analysis,
            scan_id=scan_id,
            customer_id=scan_request.customer_id,
            providers=providers_to_scan,
        )
        logger.info("Started scan %s for %s", scan_id, scan_request.customer_id)
        return ScanProgressResponse(
            scan_id=scan_id,
            customer_id=scan_request.customer_id,
            state="running",
            progress=0,
            providers=providers_to_scan,
            started_at=datetime.now(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to start scan: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/scanning/{scan_id}/progress", response_model=ScanProgressResponse)
async def get_scan_progress(scan_id: str) -> ScanProgressResponse:
    """Get progress of an active or completed scan."""
    # TODO: Query actual scan state from database
    return ScanProgressResponse(
        scan_id=scan_id,
        customer_id="demo",
        state="running",
        progress=45,
        providers=["aws", "azure"],
        started_at=datetime.now(),
        total_resources=1234,
        anomalies_found=12,
        savings_identified=15470.50,
    )


# ---------------------------------------------------------------------------
# Health / info
# ---------------------------------------------------------------------------

@router.get("/health")
async def health_check() -> dict:
    return {"status": "healthy", "version": "0.2.0", "timestamp": datetime.now().isoformat()}


@router.get("/info")
async def api_info() -> dict:
    return {
        "name": "OptiOra API",
        "version": "0.2.0",
        "description": "Cloud Cost Optimization Platform",
        "supported_providers": ["aws", "azure", "gcp", "oci"],
        "features": {
            "credential_management": True,
            "credential_validation": True,
            "scanning_permissions": True,
            "cost_analysis": True,
            "anomaly_detection": True,
            "recommendations": True,
        },
    }


# ---------------------------------------------------------------------------
# Background tasks
# ---------------------------------------------------------------------------

async def _run_cost_analysis(scan_id: str, customer_id: str, providers: List[str]) -> None:
    """Background task: run full cost analysis pipeline."""
    logger.info("Running background scan %s for providers: %s", scan_id, providers)
    # TODO: Implement — call finops_mcp tools to gather costs, detect anomalies,
    # generate recommendations, and persist results to database.
