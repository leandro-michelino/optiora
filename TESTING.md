# Testing Guide for OptiOra

## Test Suite Overview

OptiOra includes **33 comprehensive tests** covering all backend components.

```
tests/
├── test_aws_integration.py          (4 tests)
│   ├─ test_get_cost_summary_no_credentials
│   ├─ test_get_cost_summary_with_mock_boto3
│   ├─ test_get_cost_summary_period_calculation
│   └─ test_config_validation
│
├── test_azure_gcp.py                (12 tests)
│   ├─ test_azure_cost_summary_no_credentials
│   ├─ test_azure_cost_summary_structure
│   ├─ test_azure_all_periods
│   ├─ test_azure_forecast
│   ├─ test_azure_mock_data_structure
│   ├─ test_gcp_cost_summary_no_credentials
│   ├─ test_gcp_cost_summary_structure
│   ├─ test_gcp_all_periods
│   ├─ test_gcp_forecast
│   ├─ test_gcp_mock_data_structure
│   └─ test_multi_cloud_forecast_comparison
│
├── test_anomaly_recommendations.py  (6 tests)
│   ├─ test_detect_anomalies_basic
│   ├─ test_detect_anomalies_all_providers
│   ├─ test_detect_anomalies_sensitivity_levels
│   ├─ test_get_recommendations_basic
│   ├─ test_get_recommendations_by_type
│   └─ test_get_recommendations_min_savings_filter
│
├── test_oci_database.py             (7 tests)
│   ├─ test_oci_cost_summary_no_credentials
│   ├─ test_oci_cost_summary_mock_data
│   ├─ test_oci_cost_summary_all_periods
│   ├─ test_database_schema_valid
│   ├─ test_database_migrations
│   ├─ test_database_tables_in_schema
│   └─ test_database_indexes_defined
│
└── test_tools.py                    (4 tests)
    ├─ test_get_recommendations
    ├─ test_detect_anomalies
    ├─ test_forecast_costs
    └─ test_execute_action_dry_run
```

## Running Tests

### Prerequisites

```bash
# Activate virtual environment
source .venv/bin/activate

# Install dependencies (if not done)
pip install -r requirements.txt
```

### Run All Tests

```bash
# Basic test run
pytest tests/ -v

# With coverage reporting
pytest tests/ -v --cov=finops_mcp --cov-report=html

# Watch mode (requires pytest-watch)
ptw tests/
```

### Run Specific Test File

```bash
# Test AWS integration
pytest tests/test_aws_integration.py -v

# Test Azure & GCP
pytest tests/test_azure_gcp.py -v

# Test anomalies and recommendations
pytest tests/test_anomaly_recommendations.py -v

# Test OCI and database
pytest tests/test_oci_database.py -v
```

### Run Specific Test

```bash
# Run a single test
pytest tests/test_aws_integration.py::test_config_validation -v

# Run tests matching pattern
pytest tests/ -k "anomaly" -v

# Run with detailed output
pytest tests/ -vv --tb=long
```

## Test Categories

### 1. Integration Tests (No Credentials Required)

These tests verify behavior when cloud credentials are not available:

```bash
pytest tests/ -k "no_credentials" -v
```

**What They Test:**
- Mock data generation works correctly
- Cost structure is valid JSON
- All required fields present

### 2. Mock Data Tests

Verify that fallback mock data is structurally correct:

```bash
pytest tests/ -k "mock_data" -v
```

### 3. Database Tests

Test PostgreSQL schema, migrations, and table definitions:

```bash
pytest tests/test_oci_database.py -v
```

### 4. Multi-Cloud Tests

Test cost comparison and aggregation across clouds:

```bash
pytest tests/test_azure_gcp.py::test_multi_cloud_forecast_comparison -v
```

## Writing New Tests

### Test Template

```python
import pytest
from finops_mcp.tools import your_module

class TestYourFeature:
    """Test suite for your feature."""
    
    @pytest.fixture
    def setup(self):
        """Set up test fixtures."""
        return {"test_data": "value"}
    
    def test_something(self, setup):
        """Test description."""
        result = your_module.your_function(setup["test_data"])
        assert result is not None
        assert result["status"] == "success"
    
    def test_error_handling(self):
        """Test error path."""
        with pytest.raises(ValueError):
            your_module.your_function(None)
```

### Running Your Test

```bash
pytest tests/test_your_file.py::TestYourFeature::test_something -v
```

## Continuous Integration

GitHub Actions automatically runs tests on:
- Every push to `main` branch
- Pull requests
- Manual workflow dispatch

### CI Configuration

See `.github/workflows/deploy-oci.yml`:

```yaml
- name: Run tests
  run: |
    docker run --rm \
      ${{ env.IMAGE_NAME }}:${{ github.sha }} \
      python -m pytest tests/ -v
```

Tests must pass before deployment to OCI.

## Test Coverage

### Current Coverage

```
test_aws_integration.py       ██████░░░░ 60%
test_azure_gcp.py             ████████░░ 80%
test_anomaly_recommendations  ██████████ 100%
test_oci_database.py          ████████░░ 80%
test_tools.py                 ██████░░░░ 60%

Total Coverage:               ~74%
Target Coverage:              >80%
```

### Increasing Coverage

1. Add tests for error paths
2. Test edge cases (empty data, extreme values)
3. Test multi-threaded scenarios
4. Test database transaction rollback

## Debugging Tests

### Enable Debug Output

```bash
# Show print statements
pytest tests/ -v -s

# Show variables in assertions
pytest tests/ -vv --tb=short
```

### Debug Single Test

```bash
# Run with Python debugger
pytest tests/test_file.py::test_name --pdb

# Drop into debugger on failure
pytest tests/test_file.py::test_name --pdb --pdbcls=IPython.terminal.debugger:TerminalPdb
```

### Verbose Error Output

```bash
pytest tests/ --tb=long --showlocals
```

## Performance Testing

(Optional) Benchmark slow operations:

```bash
# Pytest benchmark plugin
pip install pytest-benchmark

# Run benchmarks
pytest tests/ --benchmark-only
```

## Test Maintenance

- **Update Tests**: When changing API contracts
- **Remove Tests**: When removing features
- **Add Tests**: When fixing bugs (regression test first)
- **Refactor Tests**: Keep DRY (don't repeat yourself)

---

**All 33 tests should pass before committing code!**

```bash
# Pre-commit hook suggestion
pytest tests/ -v || exit 1
```
