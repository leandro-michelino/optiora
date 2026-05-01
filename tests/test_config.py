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
                "REQUIRE_LIVE_PROVIDER_DATA": "false",
            },
            clear=False,
        ):
            cfg = Config()

        self.assertTrue(cfg.auth_enabled)
        self.assertEqual(cfg.api_port, 9001)
        self.assertFalse(cfg.require_live_provider_data)

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
