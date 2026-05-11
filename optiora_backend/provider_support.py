"""Provider-facing support models and helpers shared by API routes.

This module centralizes supported-provider metadata, credential payload parsing,
validation dispatch, and readiness requirements so those concerns don't live as
inline logic inside the main route module.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel

from .config import Config
from .credentials import CredentialStatus, CredentialValidator

SUPPORTED_CLOUD_PROVIDERS = ("aws", "azure", "gcp", "oci")
SUPPORTED_COST_IMPORT_PROVIDERS = set(SUPPORTED_CLOUD_PROVIDERS)


class ProviderApiCapability(BaseModel):
    provider: Literal["aws", "azure", "gcp", "oci"]
    scope_model: str
    primary_apis: List[str]
    optimization_apis: List[str]
    telemetry_apis: List[str]
    default_page_size: int
    max_page_size: int
    max_parallel_requests: int
    request_timeout_seconds: int
    retryable_statuses: List[int]
    throttling_signals: List[str]
    scan_notes: List[str]


_PROVIDER_API_CAPABILITIES: Dict[str, ProviderApiCapability] = {
    "aws": ProviderApiCapability(
        provider="aws",
        scope_model="payer or linked account, per region for inventory/metrics",
        primary_apis=["Cost Explorer", "EC2", "CloudWatch"],
        optimization_apis=["Cost Explorer rightsizing", "Savings Plans", "Reserved Instance recommendations"],
        telemetry_apis=["CloudWatch GetMetricData", "EC2 DescribeInstances"],
        default_page_size=100,
        max_page_size=200,
        max_parallel_requests=4,
        request_timeout_seconds=30,
        retryable_statuses=[429, 500, 502, 503, 504],
        throttling_signals=["ThrottlingException", "TooManyRequestsException", "LimitExceededException"],
        scan_notes=[
            "Cost Explorer is account-level and regional inventory is collected separately.",
            "CloudWatch metrics are queried in bounded batches to avoid API throttling.",
        ],
    ),
    "azure": ProviderApiCapability(
        provider="azure",
        scope_model="management group, subscription, or resource group",
        primary_apis=["Cost Management", "Advisor", "Resource Graph", "Azure Monitor"],
        optimization_apis=["Advisor cost recommendations", "Reservation recommendations"],
        telemetry_apis=["Azure Monitor metrics", "Resource Graph inventory"],
        default_page_size=100,
        max_page_size=200,
        max_parallel_requests=3,
        request_timeout_seconds=30,
        retryable_statuses=[408, 429, 500, 502, 503, 504],
        throttling_signals=["Retry-After", "x-ms-ratelimit-remaining", "TooManyRequests"],
        scan_notes=[
            "Management-group scans fan out by subscription and honor ARM throttling headers.",
            "Advisor recommendations and Monitor metrics are optional per subscription capability.",
        ],
    ),
    "gcp": ProviderApiCapability(
        provider="gcp",
        scope_model="organization, folder, billing account, or project",
        primary_apis=["Cloud Billing", "Cloud Asset Inventory", "Recommender", "Cloud Monitoring"],
        optimization_apis=["Recommender cost, idle resource, commitment, and machine-type recommendations"],
        telemetry_apis=["Cloud Monitoring timeSeries", "Compute aggregated instances"],
        default_page_size=100,
        max_page_size=200,
        max_parallel_requests=3,
        request_timeout_seconds=30,
        retryable_statuses=[429, 500, 502, 503, 504],
        throttling_signals=["RESOURCE_EXHAUSTED", "quotaExceeded", "rateLimitExceeded"],
        scan_notes=[
            "Project-level APIs are paged and aggregated across configured projects.",
            "Monitoring metrics use compact hourly alignment windows for responsive scans.",
        ],
    ),
    "oci": ProviderApiCapability(
        provider="oci",
        scope_model="tenancy, compartments in subtree, subscribed regions, home region for Optimizer",
        primary_apis=["Usage API", "Cloud Advisor/Optimizer", "Identity", "Compute", "Block Volume"],
        optimization_apis=["Optimizer recommendations", "Optimizer resource actions"],
        telemetry_apis=["Monitoring metrics", "Compute and Block Volume inventory"],
        default_page_size=120,
        max_page_size=200,
        max_parallel_requests=3,
        request_timeout_seconds=30,
        retryable_statuses=[429, 500, 502, 503, 504],
        throttling_signals=["TooManyRequests", "LimitExceeded", "Retry-After"],
        scan_notes=[
            "Tenancy scans start from the tenancy root and include the compartment subtree.",
            "Optimizer calls are forced to the tenancy home region before region fan-out.",
        ],
    ),
}


def provider_api_capabilities() -> Dict[str, ProviderApiCapability]:
    return dict(_PROVIDER_API_CAPABILITIES)


def provider_api_capability(provider: str) -> ProviderApiCapability:
    normalized = str(provider or "").strip().lower()
    if normalized not in _PROVIDER_API_CAPABILITIES:
        raise ValueError(f"Unsupported provider: {provider}")
    return _PROVIDER_API_CAPABILITIES[normalized]


def provider_bounded_limit(provider: str, requested: int, *, floor: int = 1) -> int:
    capability = provider_api_capability(provider)
    raw_requested = capability.default_page_size if requested is None else int(requested)
    bounded = max(int(floor), raw_requested)
    if bounded <= 0:
        return 0
    return min(bounded, capability.max_page_size)


class AWSCredentialInput(BaseModel):
    provider: Literal["aws"]
    access_key_id: str
    secret_access_key: str
    region: Optional[str] = "us-east-1"
    organization_role_arns: Optional[Union[List[str], str]] = None


class AzureCredentialInput(BaseModel):
    provider: Literal["azure"]
    subscription_id: Optional[str] = ""
    subscription_ids: Optional[Union[List[str], str]] = None
    management_group_id: Optional[str] = ""
    tenant_id: str
    client_id: str
    client_secret: str


class GCPCredentialInput(BaseModel):
    provider: Literal["gcp"]
    project_id: str
    project_ids: Optional[Union[List[str], str]] = None
    billing_export_project_ids: Optional[Union[List[str], str]] = None
    billing_export_dataset: Optional[str] = None
    billing_export_table_prefix: Optional[str] = None
    organization_id: Optional[str] = None
    folder_id: Optional[str] = None
    service_account_json: Union[Dict[str, Any], str]


class OCICredentialInput(BaseModel):
    provider: Literal["oci"]
    config_file: Optional[str] = "~/.oci/config"
    profile: Optional[str] = "DEFAULT"
    region: Optional[str] = None
    compartment_ids: Optional[Union[List[str], str]] = None


CredentialInput = Union[
    AWSCredentialInput,
    AzureCredentialInput,
    GCPCredentialInput,
    OCICredentialInput,
]


def parse_credential_payload(raw: Dict[str, Any]) -> CredentialInput:
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
        payload = dict(raw)
        profile = str(payload.get("profile") or "DEFAULT").strip()
        if profile.startswith("[") and profile.endswith("]") and len(profile) > 2:
            profile = profile[1:-1].strip()
        payload["profile"] = profile or "DEFAULT"
        config_file = str(payload.get("config_file") or "").strip()
        payload["config_file"] = config_file or "~/.oci/config"
        return OCICredentialInput(**payload)
    raise ValueError(f"Unsupported provider: {provider}")


def run_credential_validation(credential: CredentialInput) -> CredentialStatus:
    validator = CredentialValidator()
    if isinstance(credential, AWSCredentialInput):
        return validator.validate_aws(
            credential.access_key_id,
            credential.secret_access_key,
            credential.region or "us-east-1",
        )
    if isinstance(credential, AzureCredentialInput):
        return validator.validate_azure(
            credential.subscription_id or "",
            credential.tenant_id,
            credential.client_id,
            credential.client_secret,
            subscription_ids=credential.subscription_ids,
            management_group_id=credential.management_group_id,
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


def provider_diagnostic_requirements(config: Config) -> Dict[str, Dict[str, list[str] | list[Any]]]:
    azure_scope_value = (
        config.azure_subscription_id
        or config.azure_subscription_ids
        or config.azure_management_group_id
    )
    gcp_project_scope_value = (
        config.gcp_project_id
        or config.gcp_project_ids
        or config.gcp_billing_export_project_ids
    )

    return {
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
                "AZURE_SUBSCRIPTION_ID|AZURE_SUBSCRIPTION_IDS|AZURE_MANAGEMENT_GROUP_ID",
                "AZURE_TENANT_ID",
                "AZURE_CLIENT_ID",
                "AZURE_CLIENT_SECRET",
            ],
            "values": [
                azure_scope_value,
                config.azure_tenant_id,
                config.azure_client_id,
                config.azure_client_secret,
            ],
        },
        "gcp": {
            "settings": [
                "GOOGLE_APPLICATION_CREDENTIALS",
                "GCP_PROJECT_ID|GCP_PROJECT_IDS|GCP_BILLING_EXPORT_PROJECT_IDS",
            ],
            "values": [config.google_application_credentials, gcp_project_scope_value],
        },
        "oci": {
            "settings": ["OCI_CONFIG_FILE", "OCI_PROFILE", "OCI_REGION"],
            "values": [config.oci_config_file, config.oci_profile, config.oci_region],
        },
    }
