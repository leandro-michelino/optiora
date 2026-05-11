#!/usr/bin/env python3
"""Check cloud provider connectivity from the backend runtime host.

This script performs safe connectivity checks using configured runtime values.
It never prints raw secret values.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict

from optiora_backend.config import Config
from optiora_backend.credentials import CredentialValidator


def _result_dict(provider: str, configured: bool, status: Any | None, note: str = "") -> Dict[str, Any]:
    return {
        "provider": provider,
        "configured": configured,
        "is_valid": bool(status.is_valid) if status else False,
        "message": status.message if status else note,
        "tested_at": status.tested_at if status else None,
        "error_details": status.error_details if status else None,
        "test_cost_usd": status.test_cost_usd if status else None,
    }


def main() -> None:
    cfg = Config()
    validator = CredentialValidator()
    results: list[Dict[str, Any]] = []

    aws_ready = bool(cfg.aws_access_key_id and cfg.aws_secret_access_key)
    if aws_ready:
        status = validator.validate_aws(
            access_key_id=cfg.aws_access_key_id,
            secret_access_key=cfg.aws_secret_access_key,
            region=cfg.aws_region or "us-east-1",
        )
        results.append(_result_dict("aws", True, status))
    else:
        results.append(
            _result_dict(
                "aws",
                False,
                None,
                "Missing AWS_ACCESS_KEY_ID and/or AWS_SECRET_ACCESS_KEY.",
            )
        )

    azure_ready = bool(
        cfg.azure_subscription_id and cfg.azure_tenant_id and cfg.azure_client_id and cfg.azure_client_secret
    )
    if azure_ready:
        status = validator.validate_azure(
            subscription_id=cfg.azure_subscription_id,
            tenant_id=cfg.azure_tenant_id,
            client_id=cfg.azure_client_id,
            client_secret=cfg.azure_client_secret,
        )
        results.append(_result_dict("azure", True, status))
    else:
        results.append(
            _result_dict(
                "azure",
                False,
                None,
                "Missing one or more Azure settings: AZURE_SUBSCRIPTION_ID, AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET.",
            )
        )

    gcp_credentials_path = cfg.google_application_credentials
    gcp_ready = bool(gcp_credentials_path and cfg.gcp_project_id and os.path.isfile(gcp_credentials_path))
    if gcp_ready:
        with open(gcp_credentials_path, "r", encoding="utf-8") as fh:
            service_account = json.load(fh)
        status = validator.validate_gcp(project_id=cfg.gcp_project_id, service_account_json=service_account)
        results.append(_result_dict("gcp", True, status))
    else:
        results.append(
            _result_dict(
                "gcp",
                False,
                None,
                "Missing GCP_PROJECT_ID and/or GOOGLE_APPLICATION_CREDENTIALS file on backend host.",
            )
        )

    oci_ready = bool(cfg.oci_config_file and cfg.oci_profile)
    if oci_ready:
        status = validator.validate_oci(
            config_file=cfg.oci_config_file,
            profile=cfg.oci_profile or "DEFAULT",
        )
        results.append(_result_dict("oci", True, status))
    else:
        results.append(
            _result_dict(
                "oci",
                False,
                None,
                "Missing OCI_CONFIG_FILE and/or OCI_PROFILE.",
            )
        )

    print(json.dumps({"results": results}, indent=2))


if __name__ == "__main__":
    main()
