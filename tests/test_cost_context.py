"""Unit tests for extracted provider cost context helpers."""

import unittest
from datetime import datetime
from types import SimpleNamespace

from optiora_backend.cost_context import (
    LiveDataPolicyError,
    build_imported_cost_context,
    build_live_cost_context,
    fetch_provider_cost_summary,
)


class CostContextHelperTest(unittest.IsolatedAsyncioTestCase):
    async def test_fetch_provider_cost_summary_handles_supported_and_unsupported_provider(self) -> None:
        async def _aws_fetcher(params):
            self.assertEqual(params["cloud_provider"], "aws")
            return '{"total_cost_usd": 12.5, "region_breakdown": []}'

        summary = await fetch_provider_cost_summary(
            "aws",
            "month",
            fetchers={"aws": _aws_fetcher},
            safe_json_load=lambda raw, default: __import__("json").loads(raw),
        )
        self.assertEqual(summary["total_cost_usd"], 12.5)

        unsupported = await fetch_provider_cost_summary(
            "digitalocean",
            "month",
            fetchers={"aws": _aws_fetcher},
            safe_json_load=lambda raw, default: default,
        )
        self.assertEqual(unsupported["error"], "Unsupported provider: digitalocean")

    def test_build_imported_cost_context_aggregates_rows(self) -> None:
        membership = SimpleNamespace(organization_id=7)
        rows = [
            SimpleNamespace(provider="aws", cost_usd=10.0, region="us-east-1"),
            SimpleNamespace(provider="aws", cost_usd=5.0, region="us-east-1"),
            SimpleNamespace(provider="oci", cost_usd=20.0, region="uk-london-1"),
        ]

        context = build_imported_cost_context(
            membership,
            object(),
            organization_id_for_membership=lambda current: current.organization_id,
            customer_id_for_org=lambda current: f"org-{current.organization_id}",
            get_imported_cost_rows=lambda db, org_id, customer_id, provider: rows,
            imported_cost_summary=lambda current_rows: {
                "rows_imported": len(current_rows),
                "last_imported_at": datetime(2026, 5, 1, 10, 30, 0),
            },
        )

        self.assertIsNotNone(context)
        assert context is not None
        self.assertEqual(context["source"], "csv_import")
        self.assertEqual(context["total_cost"], 35.0)
        self.assertEqual(context["rows_imported"], 3)
        self.assertEqual(context["breakdown"]["aws"]["percentage"], 42.9)
        self.assertEqual(context["region_breakdown"][0]["region"], "uk-london-1")

    async def test_build_live_cost_context_falls_back_to_imported_rows(self) -> None:
        imported_context = {"source": "csv_import", "total_cost": 9.0}

        context = await build_live_cost_context(
            SimpleNamespace(),
            object(),
            provider_diagnostics=lambda: [SimpleNamespace(provider="aws", configured=False)],
            imported_cost_context_builder=lambda membership, db, cloud_provider: imported_context,
            cost_summary_for_provider=self._unused_cost_summary,
        )

        self.assertEqual(context, imported_context)

    async def test_build_live_cost_context_returns_no_data_without_live_or_imported_rows(self) -> None:
        context = await build_live_cost_context(
            SimpleNamespace(),
            object(),
            provider_diagnostics=lambda: [SimpleNamespace(provider="aws", configured=False)],
            imported_cost_context_builder=lambda membership, db, cloud_provider: None,
            cost_summary_for_provider=self._unused_cost_summary,
        )

        self.assertEqual(context["source"], "no_data_available")
        self.assertTrue(context["no_data"])
        self.assertEqual(context["breakdown"], {})

    async def test_build_live_cost_context_aggregates_live_provider_results(self) -> None:
        async def _summary(provider: str, period: str):
            self.assertEqual(period, "month")
            if provider == "aws":
                return {
                    "total_cost_usd": 25.0,
                    "region_breakdown": [{"region": "us-east-1", "cost_usd": 25.0}],
                }
            return {
                "total_cost_usd": 0.0,
                "region_breakdown": [],
            }

        context = await build_live_cost_context(
            SimpleNamespace(),
            object(),
            cloud_provider="all",
            provider_diagnostics=lambda: [
                SimpleNamespace(provider="aws", configured=True),
                SimpleNamespace(provider="oci", configured=True),
            ],
            imported_cost_context_builder=lambda membership, db, cloud_provider: None,
            cost_summary_for_provider=_summary,
        )

        self.assertEqual(context["source"], "live_provider_api")
        self.assertEqual(context["total_cost"], 25.0)
        self.assertEqual(context["breakdown"]["aws"]["percentage"], 100.0)
        self.assertEqual(len(context["region_breakdown"]), 1)

    async def test_build_live_cost_context_enforces_live_provider_mode_when_not_configured(self) -> None:
        with self.assertRaises(LiveDataPolicyError):
            await build_live_cost_context(
                SimpleNamespace(),
                object(),
                cloud_provider="aws",
                require_live_provider_data=True,
                provider_diagnostics=lambda: [SimpleNamespace(provider="aws", configured=False)],
                imported_cost_context_builder=lambda membership, db, cloud_provider: {"source": "csv_import"},
                cost_summary_for_provider=self._unused_cost_summary,
            )

    async def test_build_live_cost_context_enforces_live_provider_mode_on_provider_failures(self) -> None:
        async def _failing_summary(provider: str, period: str):
            return {"error": f"{provider} unavailable"}

        with self.assertRaises(LiveDataPolicyError):
            await build_live_cost_context(
                SimpleNamespace(),
                object(),
                cloud_provider="aws",
                require_live_provider_data=True,
                provider_diagnostics=lambda: [SimpleNamespace(provider="aws", configured=True)],
                imported_cost_context_builder=lambda membership, db, cloud_provider: None,
                cost_summary_for_provider=_failing_summary,
            )

    async def _unused_cost_summary(self, provider: str, period: str):
        self.fail(f"cost summary should not be called for {provider} {period}")
