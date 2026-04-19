# Cost Estimate (Monthly, Full Capability)

Current as of April 2026. Estimates are for OCI deployment with full OptiOra capabilities, including GenAI features.

## Assumptions

- Region: `uk-london-1`
- Runtime: one VM running both backend and dashboard
- Availability: 24x7 (~730 hours/month)
- Features enabled: analytics, rightsizing, virtual tags, exports, hybrid advisor, GenAI narratives/chat
- Database: managed PostgreSQL recommended for production; SQLite only for local/dev

## Cost Components

```text
Compute VM (E4 Flex)      : OCPU + RAM-driven
Boot / block storage      : baseline persistent disk
Network egress            : workload-dependent
Managed PostgreSQL        : recommended for production reliability
Logging / monitoring      : low-to-moderate, retention dependent
GenAI inference usage     : highly variable by prompt volume and model choice
```

## Deployment Sizes (USD / month)

| Size | Infra shape guidance | Core infra* | Managed DB | GenAI usage | Estimated total |
|---|---|---:|---:|---:|---:|
| Small | `1 OCPU / 4 GB` | 60-100 | 60-120 | 15-80 (light) | **135-300** |
| Default | `2 OCPU / 8 GB` | 90-140 | 90-180 | 80-250 (medium) | **260-570** |
| High Throughput | `4 OCPU / 16 GB` | 180-320 | 180-350 | 300-1200+ (heavy) | **660-1870+** |

\* Core infra includes VM, storage, baseline logging, and normal operational overhead.

## Practical Planning Number

For most production deployments with active usage and GenAI enabled, plan for:

- **$350-$550 / month** (default size + medium GenAI usage)

## Notes

- GenAI is the largest cost variable; token/request volume drives the biggest monthly swings.
- If using SQLite on-VM instead of managed DB, reduce total by the managed DB line item.
- Egress-heavy use cases (large exports, frequent downloads) can materially increase totals.

## Cost Control Recommendations

1. Start with `2 OCPU / 8 GB` and tune after observing p95 API latency and dashboard performance.
2. Track GenAI request volume and set OCI budget alerts specifically for GenAI spend.
3. Keep non-production environments scheduled off-hours.
4. Right-size the managed DB tier quarterly as concurrency/load stabilizes.
