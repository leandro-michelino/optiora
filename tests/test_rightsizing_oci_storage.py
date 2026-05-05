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


class _FakeOptimizerClient:
    def __init__(self, config, timeout=None):
        self.config = config

    def list_recommendations(self, **kwargs):
        return SimpleNamespace(data=[
            SimpleNamespace(
                id="ocid1.optimizerrecommendation.delete-volumes",
                name="Delete unattached block volumes",
                description="Delete unattached block volumes to reduce storage cost.",
                estimated_cost_saving=25.0,
                category_id="cost",
                importance="HIGH",
            ),
        ])

    def list_resource_actions(self, **kwargs):
        return SimpleNamespace(data=[
            SimpleNamespace(
                id="ocid1.optimizeraction.delete-volume",
                resource_id="ocid1.volume.optimizer-orphan",
                resource_type="Block Volume",
                name="Delete unattached volume",
                action="DELETE",
                estimated_cost_saving=12.5,
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

    def test_provider_recommendation_rows_are_normalized_for_rightsizing(self) -> None:
        recs = api_module._rightsizing_from_provider_recommendation_rows(
            [
                {
                    "id": "oci-rec-002",
                    "type": "idle-resources",
                    "service": "Block Volume",
                    "description": "OCI: Clean unattached volumes and expired backups.",
                    "current_annual_spend": 1200,
                    "savings_annual_usd": 480,
                    "payback_months": 1,
                    "confidence": "high",
                },
                {
                    "id": "oci-rec-003",
                    "type": "storage-optimization",
                    "service": "Object Storage",
                    "description": "OCI: Move infrequently accessed data to archive storage.",
                    "current_annual_spend": 1200,
                    "savings_annual_usd": 360,
                    "payback_months": 1,
                    "confidence": "high",
                },
            ],
            provider="oci",
            region="uk-london-1",
            account_id="org-1",
            min_savings=0,
        )

        self.assertEqual(len(recs), 2)
        self.assertEqual(recs[0].action, "terminate")
        self.assertEqual(recs[0].resource_type, "OCI Block Volume service opportunity")
        self.assertEqual(recs[0].evidence_source, "live_provider_recommendations")
        self.assertEqual(recs[1].action, "modernize")
        self.assertIn("Object Storage", recs[1].resource_type)

    def test_oci_optimizer_rows_are_collected_as_live_provider_recommendations(self) -> None:
        fake_oci = SimpleNamespace(
            config=SimpleNamespace(from_file=lambda config_file, profile: {
                "tenancy": "ocid1.tenancy.test",
                "region": "uk-london-1",
            }),
            optimizer=SimpleNamespace(OptimizerClient=_FakeOptimizerClient),
            pagination=_FakePagination,
        )

        with patch.dict(sys.modules, {"oci": fake_oci}), patch.object(
            api_module.CredentialValidator,
            "_normalize_oci_inputs",
            return_value=("/tmp/oci-config", "DEFAULT"),
        ):
            rows = api_module._oci_optimizer_recommendation_rows(
                {"config_file": "/tmp/oci-config", "profile": "DEFAULT"},
                min_monthly_savings=0,
                limit=10,
            )

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["provider"], "oci")
        self.assertEqual(rows[0]["source"], "oci_optimizer")
        self.assertEqual(rows[0]["monthly_savings_usd"], 25.0)
        self.assertEqual(rows[1]["source"], "oci_optimizer_resource_action")
        self.assertEqual(rows[1]["resource_id"], "ocid1.volume.optimizer-orphan")

        recs = api_module._rightsizing_from_provider_recommendation_rows(
            rows,
            provider="oci",
            region="uk-london-1",
            account_id="org-1",
            min_savings=0,
        )
        self.assertEqual(len(recs), 2)
        self.assertEqual(recs[0].evidence_source, "oci_optimizer")
        self.assertEqual(recs[1].resource_id, "ocid1.volume.optimizer-orphan")
        self.assertEqual(recs[1].action, "terminate")


if __name__ == "__main__":
    unittest.main()
