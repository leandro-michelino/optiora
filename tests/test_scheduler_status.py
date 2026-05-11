"""Unit tests for extracted scheduler status helpers."""

import json
import unittest
from datetime import datetime
from types import SimpleNamespace

from optiora_backend.scheduler_status import (
    build_scheduler_timeline,
    compute_next_run,
    scan_interval_seconds,
    scheduler_runtime_snapshot,
    scheduler_settings,
    summarize_scheduler_runs,
)


class SchedulerStatusHelperTest(unittest.TestCase):
    def test_scan_interval_seconds_supports_expected_frequencies(self) -> None:
        self.assertEqual(scan_interval_seconds("hourly"), 3600)
        self.assertEqual(scan_interval_seconds("weekly"), 604800)
        self.assertEqual(scan_interval_seconds("daily"), 86400)
        self.assertEqual(scan_interval_seconds("other"), 86400)

    def test_compute_next_run_advances_until_future(self) -> None:
        now = datetime(2026, 5, 1, 12, 0, 0)
        anchor = datetime(2026, 4, 29, 12, 0, 0)
        self.assertEqual(compute_next_run(now, "daily", anchor), datetime(2026, 5, 1, 12, 0, 0))

    def test_scheduler_settings_applies_override_and_limits(self) -> None:
        permission = SimpleNamespace(
            state="approved",
            scan_frequency="weekly",
            scheduler_override_enabled=True,
            scheduler_override_frequency="hourly",
            scheduler_retry_max_attempts=0,
            scheduler_retry_backoff_seconds=5,
            scheduler_overdue_alert_hours=0,
        )
        settings = scheduler_settings(permission, "initialized")
        self.assertEqual(settings["effective_scan_frequency"], "hourly")
        self.assertEqual(settings["retry_max_attempts"], 1)
        self.assertEqual(settings["retry_backoff_seconds"], 15)
        self.assertEqual(settings["overdue_alert_hours"], 24)

    def test_summarize_scheduler_runs_and_timeline(self) -> None:
        runs = [
            SimpleNamespace(
                scan_id="1",
                state="completed",
                providers_json=json.dumps(["aws"]),
                started_at=datetime(2026, 5, 1, 8, 0, 0),
                completed_at=datetime(2026, 5, 1, 8, 5, 0),
            ),
            SimpleNamespace(
                scan_id="2",
                state="failed",
                providers_json=json.dumps(["oci"]),
                started_at=datetime(2026, 5, 1, 9, 0, 0),
                completed_at=datetime(2026, 5, 1, 9, 3, 0),
            ),
        ]
        summary = summarize_scheduler_runs(runs, "completed", "failed")
        self.assertEqual(summary["total"], 2)
        self.assertEqual(summary["success"], 1)
        self.assertEqual(summary["failure"], 1)

        audit_rows = [
            SimpleNamespace(
                id=7,
                metadata_json=json.dumps({"frequency": "hourly", "providers": ["aws", "oci"]}),
                created_at=datetime(2026, 5, 1, 10, 0, 0),
            )
        ]
        timeline = build_scheduler_timeline(runs, audit_rows, safe_json_load=lambda raw, default: json.loads(raw))
        self.assertEqual(timeline[0]["id"], "audit-7")
        self.assertIn("Providers: aws, oci", timeline[0]["detail"])

    def test_scheduler_runtime_snapshot_builds_eta_and_overdue(self) -> None:
        now = datetime(2026, 5, 1, 12, 0, 0)
        permission = SimpleNamespace(
            state="approved",
            scan_frequency="daily",
            scheduler_override_enabled=False,
            scheduler_override_frequency=None,
            scheduler_retry_max_attempts=3,
            scheduler_retry_backoff_seconds=45,
            scheduler_overdue_alert_hours=12,
            approved_at=datetime(2026, 4, 28, 12, 0, 0),
            created_at=datetime(2026, 4, 27, 12, 0, 0),
        )
        runs = [
            SimpleNamespace(
                scan_id="1",
                state="completed",
                providers_json=json.dumps(["aws"]),
                started_at=datetime(2026, 4, 29, 12, 0, 0),
                completed_at=datetime(2026, 4, 29, 12, 5, 0),
            )
        ]
        snapshot = scheduler_runtime_snapshot(
            now=now,
            permission=permission,
            runs=runs,
            audit_rows=[],
            initialized_state="initialized",
            approved_state="approved",
            running_state="running",
            completed_state="completed",
            failed_state="failed",
            safe_json_load=lambda raw, default: json.loads(raw),
        )
        self.assertEqual(snapshot["counters"]["success"], 1)
        self.assertTrue(snapshot["overdue"])
        self.assertEqual(snapshot["retry_max_attempts"], 3)
        self.assertIsNotNone(snapshot["next_run_at"])
        self.assertGreaterEqual(snapshot["next_run_eta_seconds"], 0)