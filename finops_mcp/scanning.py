"""
Scanning Permission Management
Handles customer consent before cost analysis begins
"""

import logging
from typing import Optional
from dataclasses import dataclass
from datetime import datetime
from enum import Enum


logger = logging.getLogger(__name__)


class ScanningState(str, Enum):
    """States of the scanning permission process."""
    INITIALIZED = "initialized"  # Customer just connected credentials
    PENDING_APPROVAL = "pending_approval"  # Waiting for customer to approve
    APPROVED = "approved"  # Customer approved scanning
    RUNNING = "running"  # Scanning is active
    PAUSED = "paused"  # Scanning paused by customer
    COMPLETED = "completed"  # Scan finished


@dataclass
class ScanningPermission:
    """Customer's scanning permission and preferences."""
    customer_id: str
    state: ScanningState
    providers: list  # ["aws", "azure", "gcp", "oci"]
    scan_frequency: str  # "hourly", "daily", "weekly"
    auto_remediate: bool  # Automatically apply recommended actions
    notification_email: str
    created_at: datetime
    approved_at: Optional[datetime] = None
    last_scan_at: Optional[datetime] = None


class ScanningManager:
    """Manages customer scanning permissions and preferences."""
    
    def __init__(self, db_session):
        """Initialize with database session."""
        self.db = db_session
    
    def create_permission_request(
        self,
        customer_id: str,
        providers: list,
        notification_email: str
    ) -> dict:
        """Create new scanning permission request after credentials validated."""
        try:
            logger.info(f"Creating scanning permission for {customer_id}")
            
            permission = {
                'customer_id': customer_id,
                'state': ScanningState.PENDING_APPROVAL,
                'providers': providers,
                'scan_frequency': 'daily',  # Default
                'auto_remediate': False,  # Default: disabled
                'notification_email': notification_email,
                'created_at': datetime.now().isoformat(),
                'approved_at': None,
                'last_scan_at': None
            }
            
            return permission
        
        except Exception as e:
            logger.error(f"Failed to create scanning permission: {str(e)}")
            raise
    
    def request_approval(
        self,
        customer_id: str,
        providers: list
    ) -> dict:
        """Send approval request to customer."""
        try:
            logger.info(f"Requesting approval from {customer_id}")
            
            return {
                'customer_id': customer_id,
                'message': f'Ready to scan {", ".join(providers)} for cost optimization',
                'action_required': True,
                'approve_url': f'/dashboard/scanning/approve?customer_id={customer_id}'
            }
        
        except Exception as e:
            logger.error(f"Failed to request approval: {str(e)}")
            raise
    
    def approve_scanning(
        self,
        customer_id: str,
        auto_remediate: bool = False,
        scan_frequency: str = 'daily'
    ) -> dict:
        """Customer approves scanning to begin."""
        try:
            logger.info(f"Approving scanning for {customer_id}")
            logger.info(f"Configuration: auto_remediate={auto_remediate}, frequency={scan_frequency}")
            
            return {
                'customer_id': customer_id,
                'state': ScanningState.APPROVED,
                'scan_frequency': scan_frequency,
                'auto_remediate': auto_remediate,
                'approved_at': datetime.now().isoformat(),
                'message': 'Scanning approved and will begin shortly'
            }
        
        except Exception as e:
            logger.error(f"Failed to approve scanning: {str(e)}")
            raise
    
    def pause_scanning(self, customer_id: str) -> dict:
        """Customer pauses scanning."""
        try:
            logger.info(f"Pausing scanning for {customer_id}")
            
            return {
                'customer_id': customer_id,
                'state': ScanningState.PAUSED,
                'paused_at': datetime.now().isoformat(),
                'message': 'Scanning paused'
            }
        
        except Exception as e:
            logger.error(f"Failed to pause scanning: {str(e)}")
            raise
    
    def resume_scanning(self, customer_id: str) -> dict:
        """Customer resumes scanning."""
        try:
            logger.info(f"Resuming scanning for {customer_id}")
            
            return {
                'customer_id': customer_id,
                'state': ScanningState.RUNNING,
                'resumed_at': datetime.now().isoformat(),
                'message': 'Scanning resumed'
            }
        
        except Exception as e:
            logger.error(f"Failed to resume scanning: {str(e)}")
            raise
    
    def get_permission_status(self, customer_id: str) -> dict:
        """Get current scanning permission status."""
        try:
            return {
                'customer_id': customer_id,
                'state': ScanningState.PENDING_APPROVAL,
                'providers': [],
                'scan_frequency': 'daily',
                'auto_remediate': False,
                'created_at': datetime.now().isoformat()
            }
        
        except Exception as e:
            logger.error(f"Failed to get permission status: {str(e)}")
            raise
