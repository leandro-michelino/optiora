"""Configuration regression tests."""

import os
import unittest
from unittest.mock import patch

from finops_mcp.config import Config
from finops_mcp.provider_support import (
    SUPPORTED_CLOUD_PROVIDERS,
    provider_diagnostic_requirements,
)


class ConfigTest(unittest.TestCase):
    """Ensure Config reflects the current environment at instantiation time."""

    def test_config_reads_current_environment(self) -> None:
        with patch.dict(
            os.environ,
            {
                "ENABLE_AUTH": "true",
                "PORT": "9001",
                "DEPLOYMENT_TARGET": "oci",
                "OCI_RUNTIME_REQUIRED": "false",
                "REQUIRE_LIVE_PROVIDER_DATA": "false",
                "ENABLE_API_RESPONSE_CACHE": "true",
                "API_RESPONSE_CACHE_TTL_SECONDS": "123",
                "API_RESPONSE_CACHE_REFRESH_INTERVAL_SECONDS": "456",
                "API_RESPONSE_CACHE_MAX_ENTRIES": "789",
            },
            clear=False,
        ):
            cfg = Config()

        self.assertTrue(cfg.auth_enabled)
        self.assertEqual(cfg.api_port, 9001)
        self.assertEqual(cfg.deployment_target, "oci")
        self.assertFalse(cfg.oci_runtime_required)
        self.assertFalse(cfg.require_live_provider_data)
        self.assertTrue(cfg.enable_api_response_cache)
        self.assertEqual(cfg.api_response_cache_ttl_seconds, 123)
        self.assertEqual(cfg.api_response_cache_refresh_interval_seconds, 456)
        self.assertEqual(cfg.api_response_cache_max_entries, 789)

    def test_validate_rejects_non_oci_deployment_target(self) -> None:
        with patch.dict(
            os.environ,
            {
                "DEPLOYMENT_TARGET": "aws",
                "OCI_RUNTIME_REQUIRED": "false",
                "REQUIRE_LIVE_PROVIDER_DATA": "false",
            },
            clear=False,
        ):
            with self.assertRaisesRegex(ValueError, "DEPLOYMENT_TARGET"):
                Config().validate()

    def test_validate_rejects_required_oci_runtime_without_metadata(self) -> None:
        with patch.dict(
            os.environ,
            {
                "DEPLOYMENT_TARGET": "oci",
                "OCI_RUNTIME_REQUIRED": "true",
                "REQUIRE_LIVE_PROVIDER_DATA": "false",
            },
            clear=False,
        ), patch.object(Config, "is_running_on_oci", return_value=False):
            with self.assertRaisesRegex(ValueError, "outside OCI"):
                Config().validate()

    def test_validate_allows_required_oci_runtime_with_metadata(self) -> None:
        with patch.dict(
            os.environ,
            {
                "DEPLOYMENT_TARGET": "oci",
                "OCI_RUNTIME_REQUIRED": "true",
                "REQUIRE_LIVE_PROVIDER_DATA": "false",
            },
            clear=False,
        ), patch.object(Config, "is_running_on_oci", return_value=True):
            Config().validate()

    def test_genai_compartment_override_takes_precedence(self) -> None:
        with patch.dict(
            os.environ,
            {
                "OCI_COMPARTMENT_OCID": "ocid1.compartment.oc1..runtime",
                "OCI_GENAI_COMPARTMENT_ID": "ocid1.compartment.oc1..genai",
            },
            clear=False,
        ):
            self.assertEqual(
                Config().oci_genai_compartment_id,
                "ocid1.compartment.oc1..genai",
            )

    def test_genai_compartment_falls_back_to_runtime_compartment(self) -> None:
        with patch.dict(
            os.environ,
            {
                "OCI_COMPARTMENT_OCID": "ocid1.compartment.oc1..runtime",
                "OCI_GENAI_COMPARTMENT_ID": "",
            },
            clear=False,
        ):
            self.assertEqual(
                Config().oci_genai_compartment_id,
                "ocid1.compartment.oc1..runtime",
            )

    def test_oci_db_license_model_defaults_to_byol(self) -> None:
        with patch.dict(os.environ, {"OCI_DB_LICENSE_MODEL": ""}, clear=False):
            self.assertEqual(Config().oci_db_license_model, "BYOL")

    def test_oci_db_license_model_normalizes_uppercase(self) -> None:
        with patch.dict(
            os.environ, {"OCI_DB_LICENSE_MODEL": "license_included"}, clear=False
        ):
            self.assertEqual(Config().oci_db_license_model, "LICENSE_INCLUDED")

    def test_oci_max_scan_compartments_defaults_for_tenancy_inventory(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(Config().oci_max_scan_compartments, 500)

    def test_oci_max_scan_compartments_can_be_tuned_for_large_tenancies(self) -> None:
        with patch.dict(os.environ, {"OCI_MAX_SCAN_COMPARTMENTS": "1200"}, clear=False):
            self.assertEqual(Config().oci_max_scan_compartments, 1200)

    def test_provider_diagnostic_requirements_cover_all_supported_providers(self) -> None:
        requirements = provider_diagnostic_requirements(Config())
        self.assertEqual(tuple(requirements.keys()), SUPPORTED_CLOUD_PROVIDERS)

    def test_provider_diagnostic_requirements_expose_expected_fields(self) -> None:
        requirements = provider_diagnostic_requirements(Config())
        self.assertEqual(
            requirements["aws"]["settings"],
            ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
        )
        self.assertEqual(
            requirements["oci"]["settings"],
            ["OCI_CONFIG_FILE", "OCI_PROFILE", "OCI_REGION"],
        )

    def test_provider_diagnostic_requirements_support_alternative_scope_vars(self) -> None:
        with patch.dict(
            os.environ,
            {
                "AZURE_SUBSCRIPTION_ID": "",
                "AZURE_SUBSCRIPTION_IDS": "sub-a,sub-b",
                "AZURE_MANAGEMENT_GROUP_ID": "",
                "GCP_PROJECT_ID": "",
                "GCP_PROJECT_IDS": "proj-a,proj-b",
            },
            clear=False,
        ):
            requirements = provider_diagnostic_requirements(Config())

        self.assertEqual(
            requirements["azure"]["settings"][0],
            "AZURE_SUBSCRIPTION_ID|AZURE_SUBSCRIPTION_IDS|AZURE_MANAGEMENT_GROUP_ID",
        )
        self.assertEqual(requirements["azure"]["values"][0], "sub-a,sub-b")
        self.assertEqual(
            requirements["gcp"]["settings"][1], "GCP_PROJECT_ID|GCP_PROJECT_IDS"
        )
        self.assertEqual(requirements["gcp"]["values"][1], "proj-a,proj-b")

    def test_validate_allows_csv_mode_without_live_providers(self) -> None:
        with patch.dict(
            os.environ,
            {
                "REQUIRE_LIVE_PROVIDER_DATA": "false",
                "AWS_ACCESS_KEY_ID": "",
                "AWS_SECRET_ACCESS_KEY": "",
                "AWS_ORGANIZATION_ROLE_ARNS": "",
                "AZURE_SUBSCRIPTION_ID": "",
                "AZURE_SUBSCRIPTION_IDS": "",
                "AZURE_MANAGEMENT_GROUP_ID": "",
                "AZURE_TENANT_ID": "",
                "AZURE_CLIENT_ID": "",
                "AZURE_CLIENT_SECRET": "",
                "GOOGLE_APPLICATION_CREDENTIALS": "",
                "GCP_PROJECT_ID": "",
                "GCP_PROJECT_IDS": "",
                "OCI_CONFIG_FILE": "",
            },
            clear=False,
        ):
            Config().validate()

    def test_validate_rejects_no_live_providers_when_required(self) -> None:
        with patch.dict(
            os.environ,
            {
                "REQUIRE_LIVE_PROVIDER_DATA": "true",
                "AWS_ACCESS_KEY_ID": "",
                "AWS_SECRET_ACCESS_KEY": "",
                "AWS_ORGANIZATION_ROLE_ARNS": "",
                "AZURE_SUBSCRIPTION_ID": "",
                "AZURE_SUBSCRIPTION_IDS": "",
                "AZURE_MANAGEMENT_GROUP_ID": "",
                "AZURE_TENANT_ID": "",
                "AZURE_CLIENT_ID": "",
                "AZURE_CLIENT_SECRET": "",
                "GOOGLE_APPLICATION_CREDENTIALS": "",
                "GCP_PROJECT_ID": "",
                "GCP_PROJECT_IDS": "",
                "OCI_CONFIG_FILE": "",
            },
            clear=False,
        ):
            with self.assertRaises(ValueError):
                Config().validate()

    def test_validate_treats_example_provider_placeholders_as_unset(self) -> None:
        with patch.dict(
            os.environ,
            {
                "REQUIRE_LIVE_PROVIDER_DATA": "true",
                "AWS_ACCESS_KEY_ID": "your_aws_access_key",
                "AWS_SECRET_ACCESS_KEY": "your_aws_secret_key",
                "AWS_ORGANIZATION_ROLE_ARNS": "",
                "AZURE_SUBSCRIPTION_ID": "your_azure_subscription_id",
                "AZURE_SUBSCRIPTION_IDS": "",
                "AZURE_MANAGEMENT_GROUP_ID": "",
                "AZURE_TENANT_ID": "your_azure_tenant_id",
                "AZURE_CLIENT_ID": "your_azure_app_client_id",
                "AZURE_CLIENT_SECRET": "your_azure_app_secret",
                "GOOGLE_APPLICATION_CREDENTIALS": (
                    "/path/to/your/gcp-service-account.json"
                ),
                "GCP_PROJECT_ID": "your_gcp_project_id",
                "GCP_PROJECT_IDS": "",
                "OCI_CONFIG_FILE": "",
            },
            clear=False,
        ):
            with self.assertRaises(ValueError):
                Config().validate()
