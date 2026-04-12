"""Test anomaly detection and recommendations engines."""

import pytest
import json
from finops_mcp.tools import anomalies, recommendations


@pytest.mark.asyncio
async def test_detect_anomalies_basic():
    """Test anomaly detection returns expected structure."""
    result = await anomalies.detect_anomalies({
        "cloud_provider": "aws",
        "window_days": 30,
        "sensitivity": 5
    })
    
    data = json.loads(result)
    
    assert "cloud_provider" in data
    assert data["cloud_provider"] == "aws"
    assert "anomalies_found" in data
    assert "anomalies" in data
    assert isinstance(data["anomalies"], list)
    assert "estimated_impact_usd" in data


@pytest.mark.asyncio
async def test_detect_anomalies_all_providers():
    """Test anomaly detection for all cloud providers."""
    providers = ["aws", "azure", "gcp", "oci", "all"]
    
    for provider in providers:
        result = await anomalies.detect_anomalies({
            "cloud_provider": provider
        })
        
        data = json.loads(result)
        assert data["cloud_provider"] == provider
        assert "anomalies" in data


@pytest.mark.asyncio
async def test_detect_anomalies_sensitivity_levels():
    """Test different anomaly sensitivity levels."""
    for sensitivity in range(1, 11):
        result = await anomalies.detect_anomalies({
            "cloud_provider": "aws",
            "sensitivity": sensitivity
        })
        
        data = json.loads(result)
        assert data["sensitivity_level"] == sensitivity


@pytest.mark.asyncio
async def test_get_recommendations_basic():
    """Test recommendations engine returns expected structure."""
    result = await recommendations.get_recommendations({
        "cloud_provider": "aws"
    })
    
    data = json.loads(result)
    
    assert "cloud_provider" in data
    assert data["cloud_provider"] == "aws"
    assert "recommendations" in data
    assert isinstance(data["recommendations"], list)
    assert "total_potential_savings_annual_usd" in data


@pytest.mark.asyncio
async def test_get_recommendations_by_type():
    """Test filtering recommendations by type."""
    rec_types = [
        "reserved-instances",
        "spot-instances",
        "idle-resources",
        "storage-optimization",
        "network-optimization",
        "all"
    ]
    
    for rec_type in rec_types:
        result = await recommendations.get_recommendations({
            "cloud_provider": "aws",
            "recommendation_type": rec_type
        })
        
        data = json.loads(result)
        assert "recommendations" in data


@pytest.mark.asyncio
async def test_get_recommendations_min_savings_filter():
    """Test filtering recommendations by minimum savings threshold."""
    result = await recommendations.get_recommendations({
        "cloud_provider": "aws",
        "min_savings_usd": 1000
    })
    
    data = json.loads(result)
    
    # All recommendations should have savings >= 1000
    for rec in data["recommendations"]:
        assert rec["savings_annual_usd"] >= 1000


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
