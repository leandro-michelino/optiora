# Cost Estimate (High-Level)

## Baseline OCI Deployment

Assumes single compute instance hosting both services:

- FastAPI backend (`optiora-api.service`)
- Next.js dashboard (`optiora-dashboard.service`)

## Monthly Cost Buckets

```text
Compute VM (E4 Flex)     : variable by OCPU/RAM selection
Storage / boot volume    : low-to-moderate
Network egress           : workload-dependent
Optional DB service      : optional (SQLite local by default, PostgreSQL optional)
Observability/logging    : depends on retention and tooling
```

## Practical Sizing Guidance

- Small/test: `1 OCPU / 4 GB`
- Default: `2 OCPU / 8 GB`
- Higher throughput: `4 OCPU / 16 GB`

## Cost Control Recommendations

1. Start with default size and measure API p95 latency + dashboard response times.
2. Enable budget alerts in OCI for compartment and instance-level spend.
3. Schedule non-production environments to stop during off-hours.
4. Move to managed DB only when multi-user/concurrency needs justify it.
