# OptiOra Data Policy

## Real Data Only

OptiOra uses only real cost and utilization inputs.

Allowed sources:
- Cloud provider APIs (AWS, Azure, GCP, OCI)
- Persisted scan snapshots derived from cloud provider APIs
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

## Recommendation Sources

Optimization recommendations are collected from provider APIs and live inventory where available:

- AWS: Cost Explorer rightsizing, Savings Plans purchase recommendations, Reserved Instance purchase recommendations, and CloudWatch-backed utilization.
- Azure: Azure Advisor cost recommendations and Azure Monitor utilization enrichment.
- GCP: Recommender cost recommendations and Cloud Monitoring utilization/inventory signals.
- OCI: Optimizer recommendations/resource actions plus live compute, boot volume, and block volume inventory.

If a provider API or permission is unavailable, the system returns the remaining live/snapshot/imported signals and records the gap in logs or diagnostics. It must not create synthetic recommendation rows to fill missing provider data.

## Configuration

Key runtime controls:

```env
REQUIRE_LIVE_PROVIDER_DATA=false
```

Meaning:
- `true`: only live provider API paths are allowed.
- `false`: provider APIs, stored live-scan snapshots, and CSV imports are allowed.

In both modes, synthetic/demo fallbacks are not allowed.

## Data Quality Guardrails

- Validate provider identity, region, and currency fields on ingestion.
- Reject malformed or negative cost rows from CSV imports.
- Keep audit logs for ingestion, scan snapshots, and recommendation generation.
- Preserve tenant isolation by `organization_id` on all reads/writes.

## Operational Expectation

For production and development alike, workflows must be grounded in real cloud telemetry or real CSV billing data. Missing data is surfaced as missing data; it is never replaced with fabricated records.

## Contact / Pilot

Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot
