"""Tests for FinOps MCP tools."""

import pytest
import json
from finops_mcp.tools import recommendations, anomalies, actions


@pytest.mark.asyncio
async def test_get_recommendations():
    """Test cost optimization recommendations generation."""
    params = {
        "cloud_provider": "aws",
        "min_savings_usd": 100,
        "recommendation_type": "all",
    }
    result = await recommendations.get_recommendations(params)
    data = json.loads(result)

    assert "recommendations" in data
    assert data["cloud_provider"] == "aws"
    assert data["total_potential_savings_annual_usd"] > 0
    assert len(data["recommendations"]) > 0


@pytest.mark.asyncio
async def test_detect_anomalies():
    """Test anomaly detection."""
    params = {
        "cloud_provider": "aws",
        "window_days": 30,
        "sensitivity": 5,
    }
    result = await anomalies.detect_anomalies(params)
    data = json.loads(result)

    assert "anomalies" in data
    assert data["window_days"] == 30
    assert data["anomalies_found"] >= 0


@pytest.mark.asyncio
async def test_forecast_costs():
    """Test cost forecasting."""
    params = {
        "months": 3,
        "adjust_for_growth": 10,
        "cloud_provider": "aws",
    }
    result = await recommendations.forecast_costs(params)
    data = json.loads(result)

    assert "forecast" in data
    assert len(data["forecast"]) == 3
    assert data["total_projected_cost_usd"] > 0


@pytest.mark.asyncio
async def test_execute_action_dry_run():
    """Test DRY RUN cost action execution."""
    params = {
        "action_type": "delete-unattached-volume",
        "resource_ids": ["vol-123", "vol-456"],
        "dry_run": True,
    }
    result = await actions.execute_action(params)
    data = json.loads(result)

    assert data["status"] == "simulation"
    assert data["dry_run"] is True
    assert len(data["results"]) == 2


@pytest.mark.asyncio
async def test_create_ticket():
    """Test ticket creation."""
    params = {
        "title": "Optimize EC2 Reserved Instances",
        "description": "Purchase 1-year RIs for m5.xlarge to save $4,500/year",
        "estimated_savings": 4500,
        "priority": "high",
        "ticket_system": "jira",
    }
    result = await actions.create_ticket(params)
    data = json.loads(result)

    assert "id" in data
    assert data["system"] == "jira"
    assert data["priority"] == "high"
    assert data["estimated_savings_annual_usd"] == 4500


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
