# OptiOra Data Policy

## Real Data Only

OptiOra uses only real cost and utilization inputs.

Allowed sources:
- Cloud provider APIs (AWS, Azure, GCP, OCI)
- Customer-provided CSV imports

Disallowed sources:
- Hardcoded demo datasets
- Fabricated or synthetic cost records
- Mocked production payloads
- Demo loaders in runtime workflows

## Enforcement Rules

1. Runtime endpoints must return only API- or CSV-derived results.
2. If no real source data exists, endpoints return an empty state (`no_data_available`) instead of fabricated recommendations.
3. Forecasting must not backfill invented historical points.
4. Virtual-tag previews must use observed resources only.

## Configuration

Key runtime controls:

```env
REQUIRE_LIVE_PROVIDER_DATA=false
```

Meaning:
- `true`: only live provider API paths are allowed.
- `false`: provider APIs plus CSV imports are allowed.

In both modes, synthetic/demo fallbacks are not allowed.

## Data Quality Guardrails

- Validate provider identity, region, and currency fields on ingestion.
- Reject malformed or negative cost rows from CSV imports.
- Keep audit logs for ingestion and recommendation generation.
- Preserve tenant isolation by `organization_id` on all reads/writes.

## Operational Expectation

For production and development alike, workflows must be grounded in real cloud telemetry or real CSV billing data. Missing data is surfaced as missing data; it is never replaced with fabricated records.
