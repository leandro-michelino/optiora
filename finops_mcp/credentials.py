"""
Credential management service.

Validates provider credentials and stores credential metadata in the local DB.
"""

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from .orm_models import CredentialRecord

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
    """Validate cloud provider credentials with lightweight provider API calls."""

    @staticmethod
    def validate_aws(
        access_key_id: str,
        secret_access_key: str,
        region: str = "us-east-1",
    ) -> CredentialStatus:
        try:
            import boto3

            client = boto3.client(
                "ce",
                aws_access_key_id=access_key_id,
                aws_secret_access_key=secret_access_key,
                region_name=region,
            )

            start = datetime.utcnow().date().replace(day=1)
            end = datetime.utcnow().date() + timedelta(days=1)  # end date is exclusive

            response = client.get_cost_and_usage(
                TimePeriod={"Start": start.isoformat(), "End": end.isoformat()},
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
            )

            total_cost = 0.0
            if response.get("ResultsByTime"):
                total_cost = float(
                    response["ResultsByTime"][0]["Total"]["UnblendedCost"]["Amount"]
                )

            return CredentialStatus(
                provider="aws",
                is_valid=True,
                message="AWS credentials validated successfully",
                test_cost_usd=round(total_cost, 2),
                tested_at=datetime.utcnow().isoformat(),
            )
        except Exception as exc:
            logger.error("AWS credential validation failed: %s", exc)
            return CredentialStatus(
                provider="aws",
                is_valid=False,
                message="Failed to validate AWS credentials",
                error_details=str(exc),
                tested_at=datetime.utcnow().isoformat(),
            )

    @staticmethod
    def validate_azure(
        subscription_id: str,
        tenant_id: str,
        client_id: str,
        client_secret: str,
    ) -> CredentialStatus:
        try:
            from azure.identity import ClientSecretCredential
            from azure.mgmt.costmanagement import CostManagementClient

            credential = ClientSecretCredential(
                tenant_id=tenant_id,
                client_id=client_id,
                client_secret=client_secret,
            )

            client = CostManagementClient(credential)
            scope = f"/subscriptions/{subscription_id}"
            query = {
                "type": "Usage",
                "timeframe": "MonthToDate",
                "dataset": {
                    "granularity": "Daily",
                    "aggregation": {"totalCost": {"name": "PreTaxCost", "function": "Sum"}},
                },
            }
            client.query.usage(scope, query)

            return CredentialStatus(
                provider="azure",
                is_valid=True,
                message="Azure credentials validated successfully",
                tested_at=datetime.utcnow().isoformat(),
            )
        except Exception as exc:
            logger.error("Azure credential validation failed: %s", exc)
            return CredentialStatus(
                provider="azure",
                is_valid=False,
                message="Failed to validate Azure credentials",
                error_details=str(exc),
                tested_at=datetime.utcnow().isoformat(),
            )

    @staticmethod
    def validate_gcp(
        project_id: str,
        service_account_json: Dict[str, Any],
    ) -> CredentialStatus:
        try:
            from google.cloud import billing_v1
            from google.oauth2 import service_account

            credentials = service_account.Credentials.from_service_account_info(
                service_account_json
            )
            client = billing_v1.CloudBillingClient(credentials=credentials)
            list(client.list_billing_accounts(page_size=1))

            return CredentialStatus(
                provider="gcp",
                is_valid=True,
                message=f"GCP credentials validated successfully for project {project_id}",
                tested_at=datetime.utcnow().isoformat(),
            )
        except Exception as exc:
            logger.error("GCP credential validation failed: %s", exc)
            return CredentialStatus(
                provider="gcp",
                is_valid=False,
                message="Failed to validate GCP credentials",
                error_details=str(exc),
                tested_at=datetime.utcnow().isoformat(),
            )

    @staticmethod
    def validate_oci(
        config_file: str,
        profile: str = "DEFAULT",
    ) -> CredentialStatus:
        try:
            import oci

            config = oci.config.from_file(config_file, profile)
            usage_client = oci.usage_api.UsageapiClient(config)
            request = oci.usage_api.models.RequestSummarizedUsagesDetails(
                tenant_id=config["tenancy"],
                granularity="MONTHLY",
            )
            usage_client.request_summarized_usages(
                request_summarized_usages_details=request
            )

            return CredentialStatus(
                provider="oci",
                is_valid=True,
                message="OCI credentials validated successfully",
                tested_at=datetime.utcnow().isoformat(),
            )
        except Exception as exc:
            logger.error("OCI credential validation failed: %s", exc)
            return CredentialStatus(
                provider="oci",
                is_valid=False,
                message="Failed to validate OCI credentials",
                error_details=str(exc),
                tested_at=datetime.utcnow().isoformat(),
            )


class CredentialManager:
    """CRUD operations for persisted credential metadata."""

    def __init__(self, db_session):
        self.db = db_session

    def store_credentials(
        self,
        customer_id: str,
        provider: str,
        credentials: Dict[str, Any],
        is_active: bool = True,
        validation: Optional[CredentialStatus] = None,
    ) -> Dict[str, Any]:
        provider = provider.lower()
        now = datetime.utcnow()
        sanitized_credentials = self._sanitize_credentials(provider, credentials)

        record = (
            self.db.query(CredentialRecord)
            .filter(
                CredentialRecord.customer_id == customer_id,
                CredentialRecord.provider == provider,
            )
            .first()
        )

        if record is None:
            record = CredentialRecord(
                customer_id=customer_id,
                provider=provider,
                credential_json=json.dumps(sanitized_credentials),
                is_active=is_active,
                is_valid=validation.is_valid if validation else False,
                validation_message=validation.message if validation else None,
                tested_at=datetime.fromisoformat(validation.tested_at)
                if validation and validation.tested_at
                else None,
            )
            self.db.add(record)
        else:
            record.credential_json = json.dumps(sanitized_credentials)
            record.is_active = is_active
            if validation:
                record.is_valid = validation.is_valid
                record.validation_message = validation.message
                record.tested_at = (
                    datetime.fromisoformat(validation.tested_at)
                    if validation.tested_at
                    else None
                )
            record.updated_at = now

        self.db.commit()
        self.db.refresh(record)

        return {
            "customer_id": customer_id,
            "provider": provider,
            "is_active": record.is_active,
            "is_valid": record.is_valid,
            "created_at": record.created_at.isoformat(),
            "status": "stored",
        }

    @staticmethod
    def _mask_value(value: Any, show_last: int = 4) -> str:
        if value is None:
            return ""
        text = str(value)
        if len(text) <= show_last:
            return "*" * len(text)
        return f"{'*' * max(len(text) - show_last, 4)}{text[-show_last:]}"

    def _sanitize_credentials(self, provider: str, credentials: Dict[str, Any]) -> Dict[str, Any]:
        """Persist only non-sensitive metadata; never store raw secrets."""
        if provider == "aws":
            return {
                "access_key_id_masked": self._mask_value(credentials.get("access_key_id")),
                "region": str(credentials.get("region") or "us-east-1"),
            }

        if provider == "azure":
            return {
                "subscription_id": str(credentials.get("subscription_id") or ""),
                "tenant_id": str(credentials.get("tenant_id") or ""),
                "client_id_masked": self._mask_value(credentials.get("client_id")),
                "has_client_secret": bool(credentials.get("client_secret")),
            }

        if provider == "gcp":
            service_account = credentials.get("service_account_json")
            email = ""
            if isinstance(service_account, str):
                try:
                    service_account = json.loads(service_account)
                except Exception:
                    service_account = {}
            if isinstance(service_account, dict):
                email = str(service_account.get("client_email") or "")

            return {
                "project_id": str(credentials.get("project_id") or ""),
                "service_account_email": email,
                "has_service_account_json": bool(credentials.get("service_account_json")),
            }

        if provider == "oci":
            return {
                "config_file": str(credentials.get("config_file") or ""),
                "profile": str(credentials.get("profile") or "DEFAULT"),
            }

        return {"provider": provider, "stored_fields": sorted(credentials.keys())}

    def list_credentials(self, customer_id: str) -> Dict[str, Any]:
        records = (
            self.db.query(CredentialRecord)
            .filter(CredentialRecord.customer_id == customer_id)
            .order_by(CredentialRecord.provider.asc())
            .all()
        )

        return {
            "customer_id": customer_id,
            "credentials": [
                {
                    "provider": row.provider,
                    "is_valid": bool(row.is_valid),
                    "message": row.validation_message,
                    "is_active": bool(row.is_active),
                    "tested_at": row.tested_at.isoformat() if row.tested_at else None,
                    "created_at": row.created_at.isoformat(),
                }
                for row in records
            ],
        }

    def delete_credentials(self, customer_id: str, provider: str) -> bool:
        record = (
            self.db.query(CredentialRecord)
            .filter(
                CredentialRecord.customer_id == customer_id,
                CredentialRecord.provider == provider.lower(),
            )
            .first()
        )
        if not record:
            return False

        self.db.delete(record)
        self.db.commit()
        return True
