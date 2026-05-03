"""Provider-facing support models and helpers shared by API routes.

This module centralizes supported-provider metadata, credential payload parsing,
validation dispatch, and readiness requirements so those concerns don't live as
inline logic inside the main route module.
"""

from __future__ import annotations

import json
from typing import Any, Dict, Literal, Optional, Union

from pydantic import BaseModel

from .config import Config
from .credentials import CredentialStatus, CredentialValidator

SUPPORTED_CLOUD_PROVIDERS = ("aws", "azure", "gcp", "oci")
SUPPORTED_COST_IMPORT_PROVIDERS = set(SUPPORTED_CLOUD_PROVIDERS)


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
    config_file: Optional[str] = "~/.oci/config"
    profile: Optional[str] = "DEFAULT"


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


def provider_diagnostic_requirements(config: Config) -> Dict[str, Dict[str, list[str] | list[Any]]]:
    azure_scope_value = (
        config.azure_subscription_id
        or config.azure_subscription_ids
        or config.azure_management_group_id
    )
    gcp_project_scope_value = config.gcp_project_id or config.gcp_project_ids

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
                "GCP_PROJECT_ID|GCP_PROJECT_IDS",
            ],
            "values": [config.google_application_credentials, gcp_project_scope_value],
        },
        "oci": {
            "settings": ["OCI_CONFIG_FILE", "OCI_PROFILE", "OCI_REGION"],
            "values": [config.oci_config_file, config.oci_profile, config.oci_region],
        },
    }
