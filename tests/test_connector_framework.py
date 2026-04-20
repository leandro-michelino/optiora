"""
Tests for connector framework supporting CloudHealth, Spot, and OpenCost.
"""

import unittest
from datetime import datetime, timedelta
from finops_mcp.connectors import (
    ConnectorManager,
    ConnectorType,
    CloudHealthConnector,
    SpotConnector,
    OpenCostConnector,
    CostDataPoint,
    ConnectorStatus,
)


class ConnectorFrameworkTest(unittest.TestCase):
    """Test the connector framework."""

    def test_01_connector_types_defined(self):
        """Verify all connector types are available."""
        supported = ConnectorManager.list_supported_connectors()
        self.assertIn(ConnectorType.CLOUDHEALTH, supported)
        self.assertIn(ConnectorType.SPOT, supported)
        self.assertIn(ConnectorType.OPENCOST, supported)
        self.assertEqual(len(supported), 3)

    def test_02_cloudhealth_connector_instantiation(self):
        """Test CloudHealth connector can be instantiated."""
        config = {"api_key": "test-key", "api_url": "https://test.api"}
        connector = ConnectorManager.get_connector(
            ConnectorType.CLOUDHEALTH,
            config,
        )
        self.assertIsInstance(connector, CloudHealthConnector)
        self.assertEqual(connector.api_key, "test-key")

    def test_03_spot_connector_instantiation(self):
        """Test Spot connector can be instantiated."""
        config = {"api_token": "test-token", "account_id": "test-account"}
        connector = ConnectorManager.get_connector(
            ConnectorType.SPOT,
            config,
        )
        self.assertIsInstance(connector, SpotConnector)
        self.assertEqual(connector.api_token, "test-token")

    def test_04_opencost_connector_instantiation(self):
        """Test OpenCost connector can be instantiated."""
        config = {"api_url": "http://localhost:9090", "cluster_name": "prod"}
        connector = ConnectorManager.get_connector(
            ConnectorType.OPENCOST,
            config,
        )
        self.assertIsInstance(connector, OpenCostConnector)
        self.assertEqual(connector.cluster_name, "prod")

    def test_05_cost_data_point_creation(self):
        """Test CostDataPoint model."""
        now = datetime.utcnow()
        point = CostDataPoint(
            connector="cloudhealth",
            amount_usd=123.45,
            resource_id="res-123",
            service="compute",
            account_id="acc-456",
            region="us-east-1",
            period_start=now,
            tags={"env": "prod"},
            metadata={"source": "api"},
        )
        self.assertEqual(point.amount_usd, 123.45)
        self.assertEqual(point.service, "compute")
        self.assertEqual(point.tags["env"], "prod")
        self.assertIn("connector", point.to_dict())
        self.assertIn("amount_usd", point.to_dict())

    def test_06_connector_status_enum(self):
        """Test connector status enum."""
        self.assertEqual(ConnectorStatus.HEALTHY.value, "healthy")
        self.assertEqual(ConnectorStatus.DEGRADED.value, "degraded")
        self.assertEqual(ConnectorStatus.FAILING.value, "failing")
        self.assertEqual(ConnectorStatus.UNKNOWN.value, "unknown")

    def test_07_connector_manager_get_invalid_type(self):
        """Test error handling for unknown connector type."""
        with self.assertRaises(ValueError):
            ConnectorManager.get_connector(
                ConnectorType("invalid"),
                {},
            )

    def test_08_connector_init(self):
        """Test base connector properties."""
        config = {"api_key": "test"}
        connector = CloudHealthConnector(config)
        self.assertEqual(connector.connector_type, ConnectorType.CLOUDHEALTH)
        self.assertIsNone(connector.last_sync)
        self.assertEqual(connector.status, ConnectorStatus.UNKNOWN)

    def test_09_cost_data_point_dict_conversion(self):
        """Test CostDataPoint serialization."""
        now = datetime.utcnow()
        point = CostDataPoint(
            connector="opencost",
            amount_usd=99.99,
            period_start=now,
            period_end=now + timedelta(hours=1),
        )
        data_dict = point.to_dict()
        self.assertEqual(data_dict["connector"], "opencost")
        self.assertEqual(data_dict["amount_usd"], 99.99)
        self.assertIsNotNone(data_dict["period_start"])
        self.assertIsNotNone(data_dict["period_end"])


if __name__ == "__main__":
    unittest.main()
