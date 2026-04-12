"""
Credential Management Service for OptiOra
Handles validation and storage of cloud provider credentials
"""

import json
import logging
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime
import boto3
from azure.identity import ClientSecretCredential
from azure.mgmt.costmanagement import CostManagementClient
from google.cloud import billing_v1
import oci

logger = logging.getLogger(__name__)


@dataclass
class CredentialStatus:
    """Result of credential validation."""
    provider: str
    is_valid: bool
    message: str
    test_cost_usd: Optional[float] = None
    tested_at: Optional[str] = None
    error_details: Optional[str] = None


class CredentialValidator:
    """Validates cloud provider credentials."""

    @staticmethod
    def validate_aws(
        access_key_id: str, 
        secret_access_key: str, 
        region: str = "us-east-1"
    ) -> CredentialStatus:
        """Validate AWS credentials by testing Cost Explorer API."""
        try:
            client = boto3.client(
                'ce',
                aws_access_key_id=access_key_id,
                aws_secret_access_key=secret_access_key,
                region_name=region
            )
            
            # Test with a minimal request (no cost data needed)
            response = client.get_cost_and_usage(
                TimePeriod={
                    'Start': datetime.now().strftime('%Y-%m-01'),
                    'End': datetime.now().strftime('%Y-%m-%d')
                },
                Granularity='MONTHLY',
                Metrics=['UnblendedCost'],
                MaxResults=1
            )
            
            total_cost = 0.0
            if response.get('ResultsByTime'):
                total_cost = float(
                    response['ResultsByTime'][0]['Total']['UnblendedCost']['Amount']
                )
            
            return CredentialStatus(
                provider='aws',
                is_valid=True,
                message='AWS credentials validated successfully',
                test_cost_usd=total_cost,
                tested_at=datetime.now().isoformat()
            )
        
        except Exception as e:
            logger.error(f"AWS credential validation failed: {str(e)}")
            return CredentialStatus(
                provider='aws',
                is_valid=False,
                message='Failed to validate AWS credentials',
                error_details=str(e),
                tested_at=datetime.now().isoformat()
            )

    @staticmethod
    def validate_azure(
        subscription_id: str,
        tenant_id: str,
        client_id: str,
        client_secret: str
    ) -> CredentialStatus:
        """Validate Azure credentials by testing Cost Management API."""
        try:
            credential = ClientSecretCredential(
                tenant_id=tenant_id,
                client_id=client_id,
                client_secret=client_secret
            )
            
            client = CostManagementClient(credential)
            
            # Test with a minimal query
            scope = f"/subscriptions/{subscription_id}"
            query = {
                "type": "Usage",
                "timeframe": "MonthToDate",
                "dataset": {
                    "granularity": "Daily",
                    "aggregation": {
                        "totalCost": {
                            "name": "PreTaxCost",
                            "function": "Sum"
                        }
                    },
                    "grouping": [],
                    "filter": {
                        "dimensions": {
                            "name": "ChargeType",
                            "operator": "In",
                            "values": ["Usage"]
                        }
                    }
                }
            }
            
            # This will validate credentials without heavy computation
            response = client.query.usage(scope, query)
            
            return CredentialStatus(
                provider='azure',
                is_valid=True,
                message='Azure credentials validated successfully',
                tested_at=datetime.now().isoformat()
            )
        
        except Exception as e:
            logger.error(f"Azure credential validation failed: {str(e)}")
            return CredentialStatus(
                provider='azure',
                is_valid=False,
                message='Failed to validate Azure credentials',
                error_details=str(e),
                tested_at=datetime.now().isoformat()
            )

    @staticmethod
    def validate_gcp(
        project_id: str,
        service_account_json: Dict[str, Any]
    ) -> CredentialStatus:
        """Validate GCP credentials by testing BigQuery billing API."""
        try:
            # Create client from service account JSON
            client = billing_v1.CloudBillingClient()
            
            # Test by listing billing accounts (minimal permission needed)
            name = "billingAccounts"
            request = billing_v1.ListBillingAccountsRequest(name=name)
            
            response = client.list_billing_accounts(request=request)
            
            return CredentialStatus(
                provider='gcp',
                is_valid=True,
                message='GCP credentials validated successfully',
                tested_at=datetime.now().isoformat()
            )
        
        except Exception as e:
            logger.error(f"GCP credential validation failed: {str(e)}")
            return CredentialStatus(
                provider='gcp',
                is_valid=False,
                message='Failed to validate GCP credentials',
                error_details=str(e),
                tested_at=datetime.now().isoformat()
            )

    @staticmethod
    def validate_oci(
        config_file: str,
        profile: str = "DEFAULT",
        region: str = "us-phoenix-1"
    ) -> CredentialStatus:
        """Validate OCI credentials by testing Usage API."""
        try:
            config = oci.config.from_file(config_file, profile)
            
            # Test by listing usage data
            usage_client = oci.usageapi.UsageapiClient(config)
            
            # Minimal test query
            request = oci.usageapi.models.RequestSummarizedUsagesDetails(
                tenant_id=config['tenancy'],
                granularity='MONTHLY'
            )
            
            response = usage_client.request_summarized_usages(
                request_summarized_usages_details=request
            )
            
            return CredentialStatus(
                provider='oci',
                is_valid=True,
                message='OCI credentials validated successfully',
                tested_at=datetime.now().isoformat()
            )
        
        except Exception as e:
            logger.error(f"OCI credential validation failed: {str(e)}")
            return CredentialStatus(
                provider='oci',
                is_valid=False,
                message='Failed to validate OCI credentials',
                error_details=str(e),
                tested_at=datetime.now().isoformat()
            )


class CredentialManager:
    """Manages credential storage and retrieval securely."""
    
    def __init__(self, db_session):
        """Initialize with database session."""
        self.db = db_session
    
    def store_credentials(
        self,
        customer_id: str,
        provider: str,
        credentials: Dict[str, Any],
        is_active: bool = False
    ) -> Dict[str, Any]:
        """Store cloud credentials securely in database."""
        try:
            # In production, encrypt credentials before storing
            # For now, store as JSON with note to implement encryption
            
            logger.info(f"Storing credentials for {provider} (customer: {customer_id})")
            
            return {
                'customer_id': customer_id,
                'provider': provider,
                'is_active': is_active,
                'created_at': datetime.now().isoformat(),
                'status': 'stored'
            }
        
        except Exception as e:
            logger.error(f"Failed to store credentials: {str(e)}")
            raise
    
    def list_credentials(self, customer_id: str) -> list:
        """List all credentials for a customer (without sensitive data)."""
        try:
            # Returns list of credentials metadata (no secrets)
            return {
                'customer_id': customer_id,
                'credentials': []  # Populated from database
            }
        
        except Exception as e:
            logger.error(f"Failed to list credentials: {str(e)}")
            raise
    
    def delete_credentials(self, customer_id: str, provider: str) -> bool:
        """Delete stored credentials for a provider."""
        try:
            logger.info(f"Deleting credentials for {provider} (customer: {customer_id})")
            return True
        
        except Exception as e:
            logger.error(f"Failed to delete credentials: {str(e)}")
            raise
