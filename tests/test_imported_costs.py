"""Unit tests for extracted imported cost reporting helpers."""

import unittest
from datetime import datetime
from types import SimpleNamespace

from finops_mcp.imported_costs import summarize_imported_cost_rows


class ImportedCostsHelperTest(unittest.TestCase):
    def test_summarize_imported_cost_rows_aggregates_and_normalizes(self) -> None:
        rows = [
            SimpleNamespace(
                provider="AWS",
                cost_usd=12.5,
                created_at=datetime(2026, 4, 20, 10, 0, 0),
                upload_id="upload-1",
                source_filename="costs-1.csv",
            ),
            SimpleNamespace(
                provider="oci",
                cost_usd=7.25,
                created_at=datetime(2026, 4, 21, 12, 30, 0),
                upload_id="upload-1",
                source_filename="costs-1.csv",
            ),
            SimpleNamespace(
                provider="aws",
                cost_usd=0,
                created_at=datetime(2026, 4, 19, 8, 15, 0),
                upload_id="upload-1",
                source_filename="costs-1.csv",
            ),
        ]

        summary = summarize_imported_cost_rows(rows)

        self.assertEqual(summary["rows_imported"], 3)
        self.assertEqual(summary["total_cost_usd"], 19.75)
        self.assertEqual(summary["providers"], ["aws", "oci"])
        self.assertEqual(summary["last_imported_at"], datetime(2026, 4, 21, 12, 30, 0))
        self.assertEqual(summary["upload_id"], "upload-1")
        self.assertEqual(summary["source_filename"], "costs-1.csv")

    def test_summarize_imported_cost_rows_handles_empty_input(self) -> None:
        summary = summarize_imported_cost_rows([])

        self.assertEqual(summary["rows_imported"], 0)
        self.assertEqual(summary["total_cost_usd"], 0.0)
        self.assertEqual(summary["providers"], [])
        self.assertIsNone(summary["last_imported_at"])
        self.assertIsNone(summary["upload_id"])
        self.assertIsNone(summary["source_filename"])