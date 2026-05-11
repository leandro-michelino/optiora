"""OCI credential input normalization tests."""

import unittest

from optiora_backend.credentials import CredentialValidator
from optiora_backend.provider_support import OCICredentialInput, parse_credential_payload


class OciCredentialInputTest(unittest.TestCase):
    def test_parse_oci_profile_strips_brackets(self) -> None:
        credential = parse_credential_payload(
            {
                "provider": "oci",
                "config_file": "~/.oci/config",
                "profile": "[JNB]",
            }
        )
        self.assertIsInstance(credential, OCICredentialInput)
        self.assertEqual(credential.profile, "JNB")

    def test_parse_oci_defaults_config_file_when_blank(self) -> None:
        credential = parse_credential_payload(
            {
                "provider": "oci",
                "config_file": "  ",
                "profile": "DEFAULT",
            }
        )
        self.assertIsInstance(credential, OCICredentialInput)
        self.assertEqual(credential.config_file, "~/.oci/config")

    def test_validator_normalizes_profile_and_expands_path(self) -> None:
        config_path, profile = CredentialValidator._normalize_oci_inputs(
            config_file="~/.oci/config",
            profile="[JNB]",
        )
        self.assertTrue(config_path.endswith("/.oci/config"))
        self.assertEqual(profile, "JNB")


if __name__ == "__main__":
    unittest.main()
