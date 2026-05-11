"""Unit tests for extracted external anomaly helpers."""

import unittest
from datetime import datetime

from optiora_backend.external_anomalies import (
    aws_anomaly_severity,
    coerce_aws_anomaly_impact_usd,
    derive_aws_anomaly_alert,
)


class ExternalAnomaliesHelperTest(unittest.TestCase):
    def test_coerce_aws_anomaly_impact_usd_prefers_nested_impact(self) -> None:
        payload = {"impact": {"totalImpact": "345.67"}}
        self.assertEqual(coerce_aws_anomaly_impact_usd(payload), 345.67)

    def test_aws_anomaly_severity_normalizes_source_levels(self) -> None:
        self.assertEqual(aws_anomaly_severity(10.0, "critical"), "high")
        self.assertEqual(aws_anomaly_severity(10.0, "warning"), "medium")
        self.assertEqual(aws_anomaly_severity(10.0, "low"), "low")

    def test_aws_anomaly_severity_falls_back_to_impact_thresholds(self) -> None:
        self.assertEqual(aws_anomaly_severity(1500.0, None), "high")
        self.assertEqual(aws_anomaly_severity(300.0, None), "medium")
        self.assertEqual(aws_anomaly_severity(25.0, None), "low")

    def test_derive_aws_anomaly_alert_shapes_message(self) -> None:
        now = datetime(2026, 5, 1, 12, 0, 0)
        event = {
            "detail": {
                "anomalyId": "anomaly-123",
                "monitorName": "prod-billing-monitor",
                "impact": {"totalImpact": 345.67},
                "rootCauses": ["spike in compute"],
            }
        }
        anomaly = derive_aws_anomaly_alert(event, now)
        self.assertEqual(anomaly["anomaly_id"], "anomaly-123")
        self.assertEqual(anomaly["severity"], "medium")
        self.assertIn("prod-billing-monitor", anomaly["title"])
        self.assertIn("$345.67", anomaly["message"])

    def test_derive_aws_anomaly_alert_uses_timestamp_fallback_id(self) -> None:
        now = datetime(2026, 5, 1, 12, 0, 5)
        anomaly = derive_aws_anomaly_alert({}, now)
        self.assertEqual(anomaly["anomaly_id"], "aws-anomaly-1777636805")