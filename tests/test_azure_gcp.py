"""Tests for Azure and GCP cloud cost integrations."""

import pytest
import json
from unittest.mock import patch, MagicMock
from finops_mcp.tools import azure_costs, gcp_costs


# ==================== Azure Tests ====================

@pytest.mark.asyncio
async def test_azure_cost_summary_no_credentials():
    """Test Azure cost summary with no credentials configured."""
    with patch("finops_mcp.tools.azure_costs.config") as mock_config:
        mock_config.azure_subscription_id = ""
        
        result = await azure_costs.get_cost_summary({
            "period": "month",
            "cloud_provider": "azure"
        })
        
        data = json.loads(result)
        assert "error" in data
        assert "AZURE_SUBSCRIPTION_ID" in data["error"]


@pytest.mark.asyncio
async def test_azure_cost_summary_structure():
    """Test Azure cost summary structure with mock data."""
    from finops_mcp.tools.azure_costs import _mock_cost_summary
    
    result = _mock_cost_summary("month")
    data = json.loads(result)
    
    assert data["cloud_provider"] == "azure"
    assert "total_cost_usd" in data
    assert "top_services" in data
    assert len(data["top_services"]) > 0


@pytest.mark.asyncio
async def test_azure_all_periods():
    """Test Azure costs for all time periods."""
    periods = ["day", "week", "month", "year"]
    
    with patch("finops_mcp.tools.azure_costs.config") as mock_config:
        mock_config.azure_subscription_id = ""
        
        for period in periods:
            result = await azure_costs.get_cost_summary({"period": period})
            data = json.loads(result)
            
            assert "error" in data or data.get("cloud_provider") == "azure"


@pytest.mark.asyncio
async def test_azure_forecast():
    """Test Azure cost forecasting."""
    result = await azure_costs.get_forecast({
        "months": 6,
        "growth_percent": 10
    })
    
    data = json.loads(result)
    
    assert data["cloud_provider"] == "azure"
    assert data["forecast_months"] == 6
    assert data["growth_adjustment_percent"] == 10
    assert "forecast" in data
    assert "total_projected_cost_usd" in data
    assert len(data["forecast"]) == 6


@pytest.mark.asyncio
async def test_azure_mock_data_structure():
    """Test Azure mock data has required structure."""
    from finops_mcp.tools.azure_costs import _mock_cost_summary
    
    result = _mock_cost_summary("month")
    data = json.loads(result)
    
    assert "period" in data
    assert "start_date" in data
    assert "end_date" in data
    assert "total_cost_usd" in data
    assert "top_services" in data
    assert data["cloud_provider"] == "azure"
    assert "note" in data


# ==================== GCP Tests ====================

@pytest.mark.asyncio
async def test_gcp_cost_summary_no_credentials():
    """Test GCP cost summary with no credentials configured."""
    with patch("finops_mcp.tools.gcp_costs.config") as mock_config:
        mock_config.google_application_credentials = ""
        
        result = await gcp_costs.get_cost_summary({
            "period": "month",
            "cloud_provider": "gcp"
        })
        
        data = json.loads(result)
        assert "error" in data
        assert "GOOGLE_APPLICATION_CREDENTIALS" in data["error"]


@pytest.mark.asyncio
async def test_gcp_cost_summary_structure():
    """Test GCP cost summary structure with mock data."""
    from finops_mcp.tools.gcp_costs import _mock_cost_summary
    
    result = _mock_cost_summary("month")
    data = json.loads(result)
    
    assert data["cloud_provider"] == "gcp"
    assert "total_cost_usd" in data
    assert "top_services" in data
    assert len(data["top_services"]) > 0


@pytest.mark.asyncio
async def test_gcp_all_periods():
    """Test GCP costs for all time periods."""
    periods = ["day", "week", "month", "year"]
    
    with patch("finops_mcp.tools.gcp_costs.config") as mock_config:
        mock_config.google_application_credentials = ""
        
        for period in periods:
            result = await gcp_costs.get_cost_summary({"period": period})
            data = json.loads(result)
            
            assert "error" in data or data.get("cloud_provider") == "gcp"


@pytest.mark.asyncio
async def test_gcp_forecast():
    """Test GCP cost forecasting."""
    result = await gcp_costs.get_forecast({
        "months": 6,
        "growth_percent": 8
    })
    
    data = json.loads(result)
    
    assert data["cloud_provider"] == "gcp"
    assert data["forecast_months"] == 6
    assert data["growth_adjustment_percent"] == 8
    assert "forecast" in data
    assert "total_projected_cost_usd" in data
    assert len(data["forecast"]) == 6


@pytest.mark.asyncio
async def test_gcp_mock_data_structure():
    """Test GCP mock data has required structure."""
    from finops_mcp.tools.gcp_costs import _mock_cost_summary
    
    result = _mock_cost_summary("month")
    data = json.loads(result)
    
    assert "period" in data
    assert "start_date" in data
    assert "end_date" in data
    assert "total_cost_usd" in data
    assert "top_services" in data
    assert data["cloud_provider"] == "gcp"
    assert "note" in data


# ==================== Comparison Tests ====================

@pytest.mark.asyncio
async def test_multi_cloud_forecast_comparison():
    """Test that all clouds support consistent forecast interface."""
    from finops_mcp.tools import oci_costs
    
    params = {"months": 3, "growth_percent": 5}
    
    azure_result = await azure_costs.get_forecast(params)
    gcp_result = await gcp_costs.get_forecast(params)
    oci_result = await oci_costs.get_forecast(params)
    
    azure_data = json.loads(azure_result)
    gcp_data = json.loads(gcp_result)
    oci_data = json.loads(oci_result)
    
    # All should have consistent structure
    for data in [azure_data, gcp_data, oci_data]:
        assert "cloud_provider" in data
        assert "forecast_months" in data
        assert "forecast" in data
        assert "total_projected_cost_usd" in data
        assert len(data["forecast"]) == 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
