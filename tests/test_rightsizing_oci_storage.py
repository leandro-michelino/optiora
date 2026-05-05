import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from finops_mcp import api as api_module


class _FakeIdentityClient:
    def __init__(self, config, timeout=None):
        self.config = config

    def list_compartments(self, **kwargs):
        return SimpleNamespace(data=[])

    def list_availability_domains(self, **kwargs):
        return SimpleNamespace(data=[SimpleNamespace(name="AD-1")])


class _FakeComputeClient:
    def __init__(self, config, timeout=None):
        self.config = config

    def list_volume_attachments(self, **kwargs):
        return SimpleNamespace(data=[
            SimpleNamespace(lifecycle_state="ATTACHED", volume_id="ocid1.volume.attached"),
        ])

    def list_boot_volume_attachments(self, **kwargs):
        return SimpleNamespace(data=[
            SimpleNamespace(lifecycle_state="ATTACHED", boot_volume_id="ocid1.bootvolume.attached"),
        ])


class _FakeBlockstorageClient:
    def __init__(self, config, timeout=None):
        self.config = config

    def list_volumes(self, **kwargs):
        return SimpleNamespace(data=[
            SimpleNamespace(
                id="ocid1.volume.unattached",
                display_name="orphan-block",
                size_in_gbs=500,
                vpus_per_gb=10,
                lifecycle_state="AVAILABLE",
                time_created=None,
            ),
            SimpleNamespace(
                id="ocid1.volume.attached",
                display_name="attached-block",
                size_in_gbs=500,
                vpus_per_gb=10,
                lifecycle_state="AVAILABLE",
                time_created=None,
            ),
        ])

    def list_boot_volumes(self, **kwargs):
        return SimpleNamespace(data=[
            SimpleNamespace(
                id="ocid1.bootvolume.unattached",
                display_name="orphan-boot",
                size_in_gbs=100,
                lifecycle_state="AVAILABLE",
                time_created=None,
            ),
            SimpleNamespace(
                id="ocid1.bootvolume.attached",
                display_name="attached-boot",
                size_in_gbs=100,
                lifecycle_state="AVAILABLE",
                time_created=None,
            ),
        ])


class _FakePagination:
    @staticmethod
    def list_call_get_all_results(func, **kwargs):
        return func(**kwargs)


class RightsizingOciStorageTest(unittest.TestCase):
    def test_unattached_oci_storage_becomes_terminate_recommendation(self) -> None:
        fake_oci = SimpleNamespace(
            config=SimpleNamespace(from_file=lambda config_file, profile: {
                "tenancy": "ocid1.tenancy.test",
                "region": "uk-london-1",
            }),
            identity=SimpleNamespace(IdentityClient=_FakeIdentityClient),
            core=SimpleNamespace(
                ComputeClient=_FakeComputeClient,
                BlockstorageClient=_FakeBlockstorageClient,
            ),
            pagination=_FakePagination,
        )

        with patch.dict(sys.modules, {"oci": fake_oci}), patch.object(
            api_module.CredentialValidator,
            "_normalize_oci_inputs",
            return_value=("/tmp/oci-config", "DEFAULT"),
        ):
            recs = api_module._rightsizing_from_oci_storage_inventory(
                {"config_file": "/tmp/oci-config", "profile": "DEFAULT"},
                min_savings=0,
            )

        resource_ids = {rec.resource_id for rec in recs}
        self.assertIn("ocid1.volume.unattached", resource_ids)
        self.assertIn("ocid1.bootvolume.unattached", resource_ids)
        self.assertNotIn("ocid1.volume.attached", resource_ids)
        self.assertNotIn("ocid1.bootvolume.attached", resource_ids)
        self.assertTrue(all(rec.action == "terminate" for rec in recs))
        self.assertTrue(all(rec.evidence_source == "oci_storage_inventory" for rec in recs))


if __name__ == "__main__":
    unittest.main()
