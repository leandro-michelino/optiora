from finops_mcp.provider_support import (
    SUPPORTED_CLOUD_PROVIDERS,
    provider_api_capabilities,
    provider_bounded_limit,
)


def test_provider_capability_matrix_covers_every_supported_provider() -> None:
    capabilities = provider_api_capabilities()

    assert set(capabilities) == set(SUPPORTED_CLOUD_PROVIDERS)
    for provider, capability in capabilities.items():
        assert capability.provider == provider
        assert capability.primary_apis
        assert capability.optimization_apis
        assert capability.telemetry_apis
        assert capability.default_page_size > 0
        assert capability.max_page_size >= capability.default_page_size
        assert capability.max_parallel_requests > 0
        assert capability.request_timeout_seconds > 0
        assert 429 in capability.retryable_statuses
        assert capability.throttling_signals


def test_provider_bounded_limit_respects_capability_envelope() -> None:
    assert provider_bounded_limit("oci", 10) == 10
    assert provider_bounded_limit("oci", 1000) == 200
    assert provider_bounded_limit("aws", 0, floor=0) == 0
