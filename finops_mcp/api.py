"""
FastAPI-based REST API for OptiOra
Handles credential management, scanning permissions, and cost analysis
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging
import json

from .credentials import CredentialValidator, CredentialManager, CredentialStatus
from .scanning import ScanningManager, ScanningState

logger = logging.getLogger(__name__)


# Request/Response Models
class CredentialInput(BaseModel):
    """Base credential input model."""
    provider: str = Field(..., description="Cloud provider: aws, azure, gcp, oci")


class AWSCredentialInput(CredentialInput):
    """AWS credential input."""
    provider: str = "aws"
    access_key_id: str
    secret_access_key: str
    region: Optional[str] = "us-east-1"


class AzureCredentialInput(CredentialInput):
    """Azure credential input."""
    provider: str = "azure"
    subscription_id: str
    tenant_id: str
    client_id: str
    client_secret: str


class GCPCredentialInput(CredentialInput):
    """GCP credential input."""
    provider: str = "gcp"
    project_id: str
    service_account_json: Dict[str, Any]


class OCICredentialInput(CredentialInput):
    """OCI credential input."""
    provider: str = "oci"
    config_file: str
    profile: Optional[str] = "DEFAULT"


class CredentialResponse(BaseModel):
    """Credential response (without sensitive data)."""
    provider: str
    is_valid: bool
    message: str
    tested_at: Optional[datetime] = None
    error_details: Optional[str] = None


class ScanningApprovalRequest(BaseModel):
    """Request to approve scanning."""
    customer_id: str
    auto_remediate: bool = False
    scan_frequency: str = "daily"  # hourly, daily, weekly
    notification_email: str


class ScanningPermissionResponse(BaseModel):
    """Scanning permission response."""
    customer_id: str
    state: str
    providers: List[str]
    scan_frequency: str
    auto_remediate: bool
    created_at: str
    approved_at: Optional[str] = None


class StartScanRequest(BaseModel):
    """Request to start cost analysis scan."""
    customer_id: str
    providers: Optional[List[str]] = None  # If None, use all available


class ScanProgressResponse(BaseModel):
    """Scan progress response."""
    scan_id: str
    customer_id: str
    state: str  # initialized, running, completed, failed
    progress: int = 0  # 0-100
    providers: List[str]
    started_at: datetime
    completed_at: Optional[datetime] = None
    total_resources: int = 0
    anomalies_found: int = 0
    savings_identified: float = 0.0


def create_app(db_session) -> FastAPI:
    """Create and configure FastAPI application."""
    
    app = FastAPI(
        title="OptiOra API",
        description="Cloud Cost Optimization Platform",
        version="0.2.0"
    )
    
    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Restrict in production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Initialize managers
    credential_validator = CredentialValidator()
    credential_manager = CredentialManager(db_session)
    scanning_manager = ScanningManager(db_session)
    
    # ============================================================================
    # CREDENTIAL MANAGEMENT ENDPOINTS
    # ============================================================================
    
    @app.post("/api/v1/credentials/validate")
    async def validate_credentials(credential: CredentialInput) -> CredentialResponse:
        """Validate cloud credentials.
        
        Returns credential validation status and test results.
        Does NOT store credentials - use POST /credentials/add to store after validation.
        """
        try:
            if credential.provider.lower() == "aws":
                cred = credential  # Type: AWSCredentialInput
                result = credential_validator.validate_aws(
                    cred.access_key_id,
                    cred.secret_access_key,
                    cred.region
                )
            
            elif credential.provider.lower() == "azure":
                cred = credential  # Type: AzureCredentialInput
                result = credential_validator.validate_azure(
                    cred.subscription_id,
                    cred.tenant_id,
                    cred.client_id,
                    cred.client_secret
                )
            
            elif credential.provider.lower() == "gcp":
                cred = credential  # Type: GCPCredentialInput
                result = credential_validator.validate_gcp(
                    cred.project_id,
                    cred.service_account_json
                )
            
            elif credential.provider.lower() == "oci":
                cred = credential  # Type: OCICredentialInput
                result = credential_validator.validate_oci(
                    cred.config_file,
                    cred.profile
                )
            
            else:
                raise ValueError(f"Unknown provider: {credential.provider}")
            
            return CredentialResponse(
                provider=result.provider,
                is_valid=result.is_valid,
                message=result.message,
                tested_at=result.tested_at,
                error_details=result.error_details
            )
        
        except Exception as e:
            logger.error(f"Credential validation failed: {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))
    
    
    @app.post("/api/v1/credentials/add")
    async def add_credentials(
        customer_id: str,
        credential: CredentialInput,
        background_tasks: BackgroundTasks
    ) -> dict:
        """Store validated credentials securely.
        
        Credentials are encrypted before storage.
        After storing, use POST /scanning/request-approval to request scanning authorization.
        """
        try:
            # Validate first
            validation_result = await validate_credentials(credential)
            
            if not validation_result.is_valid:
                raise HTTPException(
                    status_code=400,
                    detail=f"Credential validation failed: {validation_result.message}"
                )
            
            # Store credentials
            stored = credential_manager.store_credentials(
                customer_id=customer_id,
                provider=credential.provider,
                credentials=credential.dict(),
                is_active=True
            )
            
            logger.info(f"Stored {credential.provider} credentials for {customer_id}")
            
            return {
                "status": "success",
                "message": f"{credential.provider.upper()} credentials stored securely",
                "provider": credential.provider,
                "next_step": "request_approval"
            }
        
        except Exception as e:
            logger.error(f"Failed to add credentials: {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))
    
    
    @app.get("/api/v1/credentials")
    async def list_credentials(customer_id: str) -> dict:
        """List all stored credentials for a customer (without sensitive data)."""
        try:
            credentials = credential_manager.list_credentials(customer_id)
            return credentials
        except Exception as e:
            logger.error(f"Failed to list credentials: {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))
    
    
    @app.delete("/api/v1/credentials/{provider}")
    async def delete_credentials(customer_id: str, provider: str) -> dict:
        """Delete stored credentials for a cloud provider."""
        try:
            success = credential_manager.delete_credentials(customer_id, provider)
            return {
                "status": "success",
                "message": f"{provider.upper()} credentials deleted",
                "provider": provider
            }
        except Exception as e:
            logger.error(f"Failed to delete credentials: {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))
    
    
    # ============================================================================
    # SCANNING PERMISSIONS ENDPOINTS
    # ============================================================================
    
    @app.post("/api/v1/scanning/request-approval")
    async def request_scanning_approval(
        customer_id: str,
        providers: List[str],
        notification_email: str
    ) -> dict:
        """Request customer approval before beginning cost analysis.
        
        This creates a pending approval request that customer must authorize.
        Returns an approval link/code for the customer.
        """
        try:
            permission = scanning_manager.create_permission_request(
                customer_id=customer_id,
                providers=providers,
                notification_email=notification_email
            )
            
            approval_request = scanning_manager.request_approval(
                customer_id=customer_id,
                providers=providers
            )
            
            logger.info(f"Scanning approval requested for {customer_id}")
            
            return {
                "status": "approval_pending",
                "message": approval_request['message'],
                "action_required": True,
                "approve_url": approval_request['approve_url'],
                "providers": providers,
                "customer_id": customer_id
            }
        
        except Exception as e:
            logger.error(f"Failed to request approval: {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))
    
    
    @app.post("/api/v1/scanning/approve")
    async def approve_scanning(
        approval: ScanningApprovalRequest
    ) -> ScanningPermissionResponse:
        """Customer approves scanning to begin.
        
        After this endpoint succeeds, use POST /scanning/start to begin analysis.
        """
        try:
            approved = scanning_manager.approve_scanning(
                customer_id=approval.customer_id,
                auto_remediate=approval.auto_remediate,
                scan_frequency=approval.scan_frequency
            )
            
            logger.info(f"Scanning approved for {approval.customer_id}")
            
            return ScanningPermissionResponse(
                customer_id=approved['customer_id'],
                state=approved['state'],
                providers=[],  # Get from database in production
                scan_frequency=approved['scan_frequency'],
                auto_remediate=approved['auto_remediate'],
                created_at=datetime.now().isoformat(),
                approved_at=approved['approved_at']
            )
        
        except Exception as e:
            logger.error(f"Failed to approve scanning: {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))
    
    
    @app.get("/api/v1/scanning/permission")
    async def get_scanning_permission(customer_id: str) -> ScanningPermissionResponse:
        """Get current scanning permission status."""
        try:
            permission = scanning_manager.get_permission_status(customer_id)
            
            return ScanningPermissionResponse(
                customer_id=permission['customer_id'],
                state=permission['state'],
                providers=permission['providers'],
                scan_frequency=permission['scan_frequency'],
                auto_remediate=permission['auto_remediate'],
                created_at=permission['created_at']
            )
        
        except Exception as e:
            logger.error(f"Failed to get permission status: {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))
    
    
    @app.post("/api/v1/scanning/pause")
    async def pause_scanning(customer_id: str) -> dict:
        """Customer pauses active scanning."""
        try:
            result = scanning_manager.pause_scanning(customer_id)
            return result
        except Exception as e:
            logger.error(f"Failed to pause scanning: {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))
    
    
    @app.post("/api/v1/scanning/resume")
    async def resume_scanning(customer_id: str) -> dict:
        """Customer resumes paused scanning."""
        try:
            result = scanning_manager.resume_scanning(customer_id)
            return result
        except Exception as e:
            logger.error(f"Failed to resume scanning: {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))
    
    
    # ============================================================================
    # COST ANALYSIS ENDPOINTS
    # ============================================================================
    
    @app.post("/api/v1/scanning/start")
    async def start_scan(
        scan_request: StartScanRequest,
        background_tasks: BackgroundTasks
    ) -> ScanProgressResponse:
        """Begin cost analysis scan with explicit customer consent.
        
        Requires:
        1. Credentials stored for specified providers
        2. Scanning permission approved
        
        Returns immediate scan initialization response.
        Actual scan runs in background; poll GET /scanning/{scan_id}/progress for updates.
        """
        try:
            # Check permission status
            permission = scanning_manager.get_permission_status(scan_request.customer_id)
            
            if permission['state'] != ScanningState.APPROVED:
                raise HTTPException(
                    status_code=403,
                    detail=f"Scanning not approved. Current state: {permission['state']}"
                )
            
            # Determine providers to scan
            providers_to_scan = scan_request.providers or permission['providers']
            
            # Initialize scan (in production, create database record)
            scan_id = f"scan_{scan_request.customer_id}_{datetime.now().timestamp()}"
            
            # Schedule background scan task
            background_tasks.add_task(
                _run_cost_analysis,
                scan_id=scan_id,
                customer_id=scan_request.customer_id,
                providers=providers_to_scan
            )
            
            logger.info(f"Started scan {scan_id} for {scan_request.customer_id}")
            
            return ScanProgressResponse(
                scan_id=scan_id,
                customer_id=scan_request.customer_id,
                state="running",
                progress=0,
                providers=providers_to_scan,
                started_at=datetime.now()
            )
        
        except Exception as e:
            logger.error(f"Failed to start scan: {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))
    
    
    @app.get("/api/v1/scanning/{scan_id}/progress")
    async def get_scan_progress(scan_id: str) -> ScanProgressResponse:
        """Get progress of an active or completed scan."""
        try:
            # In production, query database for scan status
            return ScanProgressResponse(
                scan_id=scan_id,
                customer_id="demo",
                state="running",
                progress=45,
                providers=["aws", "azure"],
                started_at=datetime.now(),
                total_resources=1234,
                anomalies_found=12,
                savings_identified=15470.50
            )
        
        except Exception as e:
            logger.error(f"Failed to get scan progress: {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))
    
    
    # ============================================================================
    # HEALTH & INFO ENDPOINTS
    # ============================================================================
    
    @app.get("/api/v1/health")
    async def health_check() -> dict:
        """Health check endpoint."""
        return {
            "status": "healthy",
            "version": "0.2.0",
            "timestamp": datetime.now().isoformat()
        }
    
    
    @app.get("/api/v1/info")
    async def api_info() -> dict:
        """API information and supported providers."""
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
                "recommendations": True
            }
        }
    
    
    return app


async def _run_cost_analysis(scan_id: str, customer_id: str, providers: List[str]):
    """Background task to run cost analysis (placeholder)."""
    try:
        logger.info(f"Running background scan {scan_id} for providers: {providers}")
        # TODO: Implement actual cost analysis logic
        # This will call finops_mcp tools to gather costs, detect anomalies, generate recommendations
    except Exception as e:
        logger.error(f"Background scan failed: {str(e)}")
