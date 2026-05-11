"""
Credential management service.

Validates provider credentials and stores credential metadata in the local DB.
"""

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, Optional

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
    def _csv_or_list_values(value: Any) -> list[str]:
        if isinstance(value, (list, tuple, set)):
            raw_values = value
        else:
            raw_values = str(value or "").split(",")
        output: list[str] = []
        for raw in raw_values:
            text = str(raw or "").strip()
            if text and text not in output:
                output.append(text)
        return output

    @staticmethod
    def _normalize_oci_inputs(config_file: str, profile: str) -> tuple[str, str]:
        resolved_config = str(config_file or "~/.oci/config").strip() or "~/.oci/config"
        resolved_profile = str(profile or "DEFAULT").strip() or "DEFAULT"

        if resolved_profile.startswith("[") and resolved_profile.endswith("]") and len(resolved_profile) > 2:
            resolved_profile = resolved_profile[1:-1].strip() or "DEFAULT"

        expanded = os.path.abspath(
            os.path.expanduser(os.path.expandvars(resolved_config))
        )
        return expanded, resolved_profile

    @staticmethod
    def validate_aws(
        access_key_id: str,
        secret_access_key: str,
        region: str = "us-east-1",
    ) -> CredentialStatus:
        try:
            import boto3

            ce_client = boto3.client(
                "ce",
                aws_access_key_id=access_key_id,
                aws_secret_access_key=secret_access_key,
                region_name=region,
            )

            start = datetime.now(timezone.utc).replace(tzinfo=None).date().replace(day=1)
            end = datetime.now(timezone.utc).replace(tzinfo=None).date() + timedelta(days=1)  # end date is exclusive

            response = ce_client.get_cost_and_usage(
                TimePeriod={"Start": start.isoformat(), "End": end.isoformat()},
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
            )

            total_cost = 0.0
            if response.get("ResultsByTime"):
                total_cost = float(
                    response["ResultsByTime"][0]["Total"]["UnblendedCost"]["Amount"]
                )

            # Probe additional permissions and report which are available.
            permissions_verified: list[str] = ["ce:GetCostAndUsage"]

            ec2_client = boto3.client(
                "ec2",
                aws_access_key_id=access_key_id,
                aws_secret_access_key=secret_access_key,
                region_name=region,
            )
            try:
                ec2_client.describe_instances(MaxResults=5)
                permissions_verified.append("ec2:DescribeInstances")
            except Exception:
                pass

            try:
                ec2_client.describe_volumes(MaxResults=5)
                permissions_verified.append("ec2:DescribeVolumes")
            except Exception:
                pass

            try:
                ce_client.get_savings_plans_purchase_recommendation(
                    SavingsPlansType="COMPUTE_SP",
                    TermInYears="ONE_YEAR",
                    PaymentOption="NO_UPFRONT",
                    LookbackPeriodInDays="THIRTY_DAYS",
                )
                permissions_verified.append("ce:GetSavingsPlansPurchaseRecommendation")
            except Exception:
                pass

            try:
                ce_client.get_reservation_purchase_recommendation(
                    Service="Amazon Elastic Compute Cloud - Compute",
                    LookbackPeriodInDays="THIRTY_DAYS",
                    TermInYears="ONE_YEAR",
                    PaymentOption="NO_UPFRONT",
                )
                permissions_verified.append("ce:GetReservationPurchaseRecommendation")
            except Exception:
                pass

            message = (
                f"AWS credentials validated. Permissions confirmed: {', '.join(permissions_verified)}"
            )

            return CredentialStatus(
                provider="aws",
                is_valid=True,
                message=message,
                test_cost_usd=round(total_cost, 2),
                tested_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            )
        except Exception as exc:
            logger.error("AWS credential validation failed: %s", exc)
            return CredentialStatus(
                provider="aws",
                is_valid=False,
                message="Failed to validate AWS credentials",
                error_details=str(exc),
                tested_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            )

    @staticmethod
    def validate_azure(
        subscription_id: str,
        tenant_id: str,
        client_id: str,
        client_secret: str,
        subscription_ids: Any = None,
        management_group_id: Optional[str] = None,
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
            subscriptions = CredentialValidator._csv_or_list_values(subscription_ids)
            if subscription_id and subscription_id not in subscriptions:
                subscriptions.insert(0, subscription_id)
            management_group = str(management_group_id or "").strip()
            if management_group:
                scope = f"/providers/Microsoft.Management/managementGroups/{management_group}"
            elif subscriptions:
                scope = f"/subscriptions/{subscriptions[0]}"
            else:
                return CredentialStatus(
                    provider="azure",
                    is_valid=False,
                    message="Azure validation needs a subscription id or management group id",
                    tested_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
                )
            query = {
                "type": "Usage",
                "timeframe": "MonthToDate",
                "dataset": {
                    "granularity": "Daily",
                    "aggregation": {"totalCost": {"name": "PreTaxCost", "function": "Sum"}},
                },
            }
            result = client.query.usage(scope, query)

            # Extract MTD cost total from the query result rows.
            total_cost = 0.0
            if hasattr(result, "rows") and result.rows:
                for row in result.rows:
                    if len(row) >= 2:
                        try:
                            total_cost += float(row[1]) if row[1] else 0.0
                        except (TypeError, ValueError):
                            pass

            permissions_verified = ["Microsoft.CostManagement/query/action"]

            # Probe resource manager read access.
            try:
                from azure.mgmt.resource import ResourceManagementClient

                if subscriptions:
                    rm_client = ResourceManagementClient(credential, subscriptions[0])
                    list(rm_client.resource_groups.list())
                    permissions_verified.append("Microsoft.Resources/resourceGroups/read")
            except Exception:
                pass

            message = (
                f"Azure credentials validated. Permissions confirmed: {', '.join(permissions_verified)}"
            )

            return CredentialStatus(
                provider="azure",
                is_valid=True,
                message=message,
                test_cost_usd=round(total_cost, 2) if total_cost > 0 else None,
                tested_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            )
        except Exception as exc:
            logger.error("Azure credential validation failed: %s", exc)
            return CredentialStatus(
                provider="azure",
                is_valid=False,
                message="Failed to validate Azure credentials",
                error_details=str(exc),
                tested_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            )

    @staticmethod
    def validate_gcp(
        project_id: str,
        service_account_json: Dict[str, Any],
    ) -> CredentialStatus:
        try:
            from google.oauth2 import service_account

            credentials = service_account.Credentials.from_service_account_info(
                service_account_json
            )

            permissions_verified: list[str] = []

            # Primary probe: billing account read access.
            try:
                from google.cloud import billing_v1

                billing_client = billing_v1.CloudBillingClient(credentials=credentials)
                list(billing_client.list_billing_accounts(page_size=1))
                permissions_verified.append("billing.accounts.list")
            except Exception as exc:
                raise exc  # billing access is required; re-raise

            # Secondary probe: BigQuery read access (needed for billing export queries).
            try:
                from google.cloud import bigquery

                bq_client = bigquery.Client(
                    project=project_id, credentials=credentials
                )
                list(bq_client.list_datasets(max_results=1))
                permissions_verified.append("bigquery.datasets.list")
            except Exception:
                pass

            # Tertiary probe: project IAM read.
            try:
                from google.cloud import resourcemanager_v3

                rm_client = resourcemanager_v3.ProjectsClient(credentials=credentials)
                rm_client.get_project(name=f"projects/{project_id}")
                permissions_verified.append("resourcemanager.projects.get")
            except Exception:
                pass

            message = (
                f"GCP credentials validated for project {project_id}. "
                f"Permissions confirmed: {', '.join(permissions_verified)}"
            )

            return CredentialStatus(
                provider="gcp",
                is_valid=True,
                message=message,
                tested_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            )
        except Exception as exc:
            logger.error("GCP credential validation failed: %s", exc)
            return CredentialStatus(
                provider="gcp",
                is_valid=False,
                message="Failed to validate GCP credentials",
                error_details=str(exc),
                tested_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            )

    @staticmethod
    def validate_oci(
        config_file: str,
        profile: str = "DEFAULT",
    ) -> CredentialStatus:
        try:
            import oci
            from datetime import date

            resolved_config_file, resolved_profile = CredentialValidator._normalize_oci_inputs(
                config_file=config_file,
                profile=profile,
            )

            if not os.path.isfile(resolved_config_file):
                return CredentialStatus(
                    provider="oci",
                    is_valid=False,
                    message=(
                        "OCI config file not found on the API server. "
                        f"Resolved path: {resolved_config_file}. "
                        "Use a path that exists on the OptiOra host (not your browser/laptop path)."
                    ),
                    error_details=f"Missing file: {resolved_config_file}",
                    tested_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
                )

            oci_config = oci.config.from_file(resolved_config_file, resolved_profile)
            tenancy_id = oci_config["tenancy"]

            # Use an exact UTC boundary window to satisfy Usage API precision
            # requirements (hours/minutes/seconds must be zeroed).
            today = date.today()
            start = datetime(today.year, today.month, 1, 0, 0, 0, tzinfo=timezone.utc)
            end = datetime(today.year, today.month, today.day, 0, 0, 0, tzinfo=timezone.utc) + timedelta(days=1)

            request = oci.usage_api.models.RequestSummarizedUsagesDetails(
                tenant_id=tenancy_id,
                time_usage_started=start,
                time_usage_ended=end,
                granularity="MONTHLY",
            )
            def _request_usage(cfg: Dict[str, Any]):
                usage_client = oci.usage_api.UsageapiClient(cfg)
                return usage_client.request_summarized_usages(
                    request_summarized_usages_details=request
                )

            used_region = str(oci_config.get("region") or "")
            try:
                response = _request_usage(oci_config)
            except Exception as usage_exc:
                usage_text = str(usage_exc).lower()
                if "home region" not in usage_text:
                    raise
                identity_client = oci.identity.IdentityClient(oci_config)
                subscriptions = identity_client.list_region_subscriptions(
                    tenancy_id=tenancy_id
                ).data
                home_region = next(
                    (
                        str(sub.region_name)
                        for sub in subscriptions
                        if bool(getattr(sub, "is_home_region", False))
                    ),
                    "",
                )
                if not home_region:
                    raise
                retry_config = dict(oci_config)
                retry_config["region"] = home_region
                response = _request_usage(retry_config)
                used_region = home_region

            # Extract MTD cost total from the response items.
            total_cost = 0.0
            for item in (response.data.items or []):
                try:
                    total_cost += float(item.computed_amount or 0)
                except (TypeError, ValueError):
                    pass

            permissions_verified = ["oci:usage-api:RequestSummarizedUsages"]
            if used_region:
                permissions_verified.append(f"oci:usage-region:{used_region}")

            # Secondary probe: identity tenancy read.
            try:
                identity_client = oci.identity.IdentityClient(oci_config)
                identity_client.get_tenancy(tenancy_id=tenancy_id)
                permissions_verified.append("oci:identity:GetTenancy")
            except Exception:
                pass

            message = (
                f"OCI credentials validated. "
                f"Permissions confirmed: {', '.join(permissions_verified)}"
            )

            return CredentialStatus(
                provider="oci",
                is_valid=True,
                message=message,
                test_cost_usd=round(total_cost, 2) if total_cost > 0 else None,
                tested_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            )
        except Exception as exc:
            logger.error("OCI credential validation failed: %s", exc)
            detail = str(exc)
            hint = ""
            lowered = detail.lower()
            if "profile" in lowered and "not found" in lowered:
                hint = (
                    " Check OCI profile name. Use profile names without brackets "
                    "(for example: JNB, not [JNB])."
                )
            return CredentialStatus(
                provider="oci",
                is_valid=False,
                message=f"Failed to validate OCI credentials.{hint}".strip(),
                error_details=detail,
                tested_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            )


class CredentialManager:
    """CRUD operations for persisted credential metadata."""

    def __init__(self, db_session):
        self.db = db_session

    @staticmethod
    def _scope_candidates(customer_id: str, legacy_customer_ids: Optional[Iterable[str]] = None) -> list[str]:
        ordered = [customer_id, *(legacy_customer_ids or [])]
        unique: list[str] = []
        for candidate in ordered:
            normalized = str(candidate or "").strip()
            if normalized and normalized not in unique:
                unique.append(normalized)
        return unique

    def store_credentials(
        self,
        customer_id: str,
        provider: str,
        credentials: Dict[str, Any],
        is_active: bool = True,
        validation: Optional[CredentialStatus] = None,
        legacy_customer_ids: Optional[Iterable[str]] = None,
    ) -> Dict[str, Any]:
        provider = provider.lower()
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        sanitized_credentials = self._sanitize_credentials(provider, credentials)
        candidates = self._scope_candidates(customer_id, legacy_customer_ids)

        record = (
            self.db.query(CredentialRecord)
            .filter(
                CredentialRecord.customer_id.in_(candidates),
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
            record.customer_id = customer_id
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
                "organization_role_arns_count": len(CredentialValidator._csv_or_list_values(credentials.get("organization_role_arns"))),
            }

        if provider == "azure":
            return {
                "subscription_id": str(credentials.get("subscription_id") or ""),
                "subscription_ids_count": len(CredentialValidator._csv_or_list_values(credentials.get("subscription_ids"))),
                "management_group_id": str(credentials.get("management_group_id") or ""),
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
                "project_ids_count": len(CredentialValidator._csv_or_list_values(credentials.get("project_ids"))),
                "billing_export_project_ids_count": len(CredentialValidator._csv_or_list_values(credentials.get("billing_export_project_ids"))),
                "billing_export_dataset": str(credentials.get("billing_export_dataset") or ""),
                "billing_export_table_prefix": str(credentials.get("billing_export_table_prefix") or ""),
                "organization_id": str(credentials.get("organization_id") or ""),
                "folder_id": str(credentials.get("folder_id") or ""),
                "service_account_email": email,
                "has_service_account_json": bool(credentials.get("service_account_json")),
            }

        if provider == "oci":
            return {
                "config_file": str(credentials.get("config_file") or ""),
                "profile": str(credentials.get("profile") or "DEFAULT"),
                "region": str(credentials.get("region") or ""),
                "compartment_ids_count": len(CredentialValidator._csv_or_list_values(credentials.get("compartment_ids"))),
            }

        return {"provider": provider, "stored_fields": sorted(credentials.keys())}

    def list_credentials(self, customer_id: str) -> Dict[str, Any]:
        return self.list_credentials_with_aliases(customer_id, legacy_customer_ids=None)

    def list_credentials_with_aliases(
        self,
        customer_id: str,
        legacy_customer_ids: Optional[Iterable[str]] = None,
    ) -> Dict[str, Any]:
        candidates = self._scope_candidates(customer_id, legacy_customer_ids)
        records = (
            self.db.query(CredentialRecord)
            .filter(CredentialRecord.customer_id.in_(candidates))
            .order_by(CredentialRecord.provider.asc())
            .all()
        )
        changed = False
        normalized_records: dict[str, CredentialRecord] = {}
        for row in records:
            if row.provider not in normalized_records:
                normalized_records[row.provider] = row
            if row.customer_id != customer_id:
                row.customer_id = customer_id
                changed = True
        if changed:
            self.db.commit()

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
                for row in normalized_records.values()
            ],
        }

    def delete_credentials(
        self,
        customer_id: str,
        provider: str,
        legacy_customer_ids: Optional[Iterable[str]] = None,
    ) -> bool:
        candidates = self._scope_candidates(customer_id, legacy_customer_ids)
        record = (
            self.db.query(CredentialRecord)
            .filter(
                CredentialRecord.customer_id.in_(candidates),
                CredentialRecord.provider == provider.lower(),
            )
            .first()
        )
        if not record:
            return False

        self.db.delete(record)
        self.db.commit()
        return True
