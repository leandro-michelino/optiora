"""Test AWS Cost Explorer integration."""

import pytest
import json
from unittest.mock import patch, MagicMock
from finops_mcp.tools import aws_costs


@pytest.mark.asyncio
async def test_get_cost_summary_no_credentials():
    """Test get_cost_summary with no AWS credentials configured."""
    with patch("finops_mcp.tools.aws_costs.config") as mock_config:
        mock_config.aws_access_key_id = ""
        
        result = await aws_costs.get_cost_summary({"period": "month", "cloud_provider": "aws"})
        data = json.loads(result)
        
        assert "error" in data
        assert data["error"] == "AWS not configured"


@pytest.mark.asyncio
async def test_get_cost_summary_with_mock_boto3():
    """Test get_cost_summary with mocked AWS API."""
    mock_response = {
        "ResultsByTime": [
            {
                "TimePeriod": {"Start": "2026-03-12", "End": "2026-04-12"},
                "Groups": [
                    {
                        "Keys": ["Amazon EC2"],
                        "Metrics": {"UnblendedCost": {"Amount": "500.00", "Unit": "USD"}}
                    },
                    {
                        "Keys": ["Amazon S3"],
                        "Metrics": {"UnblendedCost": {"Amount": "100.00", "Unit": "USD"}}
                    },
                ]
            }
        ]
    }
    
    with patch("finops_mcp.tools.aws_costs.boto3") as mock_boto3:
        mock_boto3.client.return_value.get_cost_and_usage.return_value = mock_response
        
        with patch("finops_mcp.tools.aws_costs.config") as mock_config:
            mock_config.aws_access_key_id = "test_key"
            mock_config.aws_secret_access_key = "test_secret"
            mock_config.aws_region = "us-east-1"
            
            result = await aws_costs.get_cost_summary({"period": "month", "cloud_provider": "aws"})
            data = json.loads(result)
            
            assert "total_cost_usd" in data
            assert data["total_cost_usd"] >= 0
            assert "top_services" in data
            assert len(data["top_services"]) > 0


@pytest.mark.asyncio
async def test_get_cost_summary_period_calculation():
    """Test period calculation for different time windows."""
    periods = ["day", "week", "month", "year"]
    
    mock_response = {
        "ResultsByTime": [
            {
                "TimePeriod": {"Start": "2026-03-12", "End": "2026-04-12"},
                "Groups": [
                    {
                        "Keys": ["Amazon EC2"],
                        "Metrics": {"UnblendedCost": {"Amount": "1000.00", "Unit": "USD"}}
                    }
                ]
            }
        ]
    }
    
    with patch("finops_mcp.tools.aws_costs.boto3") as mock_boto3:
        mock_boto3.client.return_value.get_cost_and_usage.return_value = mock_response
        
        with patch("finops_mcp.tools.aws_costs.config") as mock_config:
            mock_config.aws_access_key_id = "test_key"
            mock_config.aws_secret_access_key = "test_secret"
            mock_config.aws_region = "us-east-1"
            
            for period in periods:
                result = await aws_costs.get_cost_summary({"period": period, "cloud_provider": "aws"})
                data = json.loads(result)
                
                assert data["period"] == period
                assert "start_date" in data
                assert "end_date" in data


def test_config_validation():
    """Test configuration validation."""
    from finops_mcp.config import Config
    
    # Test valid config with AWS
    config = Config()
    # Should not raise if at least one provider is configured
    try:
        config.validate()
        # If we get here, validation passed (expected)
        assert True
    except ValueError:
        pytest.fail("Configuration validation failed when it should have passed")
    
    # Test that config has at least one provider
    has_provider = (
        config.aws_access_key_id or 
        config.azure_subscription_id or 
        config.google_application_credentials or 
        config.oci_config_file
    )
    assert has_provider, "No cloud providers configured"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
