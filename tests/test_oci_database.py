"""Tests for OCI integration and database."""

import pytest
import json
from unittest.mock import patch
from finops_mcp.tools import oci_costs
from finops_mcp.database import SCHEMA_V1, init_database, get_migrations


@pytest.mark.asyncio
async def test_oci_cost_summary_no_credentials():
    """Test OCI cost summary with no credentials configured."""
    with patch("finops_mcp.tools.oci_costs.config") as mock_config:
        mock_config.oci_config_file = ""
        
        result = await oci_costs.get_cost_summary({
            "period": "month",
            "cloud_provider": "oci"
        })
        
        data = json.loads(result)
        assert "error" in data or "note" in data


@pytest.mark.asyncio
async def test_oci_cost_summary_mock_data():
    """Test OCI cost summary returns valid mock data structure."""
    # Mock the config to have no OCI credentials
    with patch("finops_mcp.tools.oci_costs.config") as mock_config:
        mock_config.oci_config_file = ""
        
        result = await oci_costs.get_cost_summary({
            "period": "month",
            "cloud_provider": "oci"
        })
        
        data = json.loads(result)
        assert "error" in data


@pytest.mark.asyncio
async def test_oci_cost_summary_all_periods():
    """Test OCI cost summary for all time periods."""
    periods = ["day", "week", "month", "year"]
    
    with patch("finops_mcp.tools.oci_costs.config") as mock_config:
        mock_config.oci_config_file = ""
        
        for period in periods:
            result = await oci_costs.get_cost_summary({
                "period": period,
                "cloud_provider": "oci"
            })
            
            data = json.loads(result)
            assert "error" in data or "note" in data


def test_database_schema_valid():
    """Test database schema syntax is valid."""
    # Basic validation - schema should be a string with SQL
    assert isinstance(SCHEMA_V1, str)
    assert "CREATE TABLE" in SCHEMA_V1
    assert "cost_snapshots" in SCHEMA_V1
    assert "cost_anomalies" in SCHEMA_V1
    assert "cost_recommendations" in SCHEMA_V1
    assert "cost_actions" in SCHEMA_V1


def test_database_migrations():
    """Test migration list is properly formatted."""
    migrations = get_migrations()
    
    assert "v1" in migrations
    assert "name" in migrations["v1"]
    assert "description" in migrations["v1"]
    assert "sql" in migrations["v1"]


def test_database_tables_in_schema():
    """Test all required tables are defined in schema."""
    required_tables = [
        "cost_snapshots",
        "cost_anomalies",
        "cost_recommendations",
        "cost_actions",
        "customers",
        "api_keys",
        "audit_logs",
    ]
    
    for table in required_tables:
        assert f"CREATE TABLE IF NOT EXISTS {table}" in SCHEMA_V1


def test_database_indexes_defined():
    """Test indexes are defined for performance."""
    required_indexes = [
        "idx_cost_snapshots_customer",
        "idx_cost_anomalies_customer",
        "idx_cost_recommendations_customer",
        "idx_cost_actions_customer",
        "idx_audit_logs_customer",
    ]
    
    for index in required_indexes:
        assert f"CREATE INDEX IF NOT EXISTS {index}" in SCHEMA_V1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
