# Cost Estimate (Monthly, Full Capability)

Current as of May 2026. Estimates are for OCI deployment with full OptiOra capabilities, including OCI Generative AI. Small deployments stay lean on a single VM with SQLite; medium and enterprise deployments use PostgreSQL on OCI.

## Assumptions

- Region: `uk-london-1`
- Runtime: one VM running both backend and dashboard
- Availability: 24x7 (~730 hours/month)
- Features enabled: analytics, rightsizing, virtual tags, exports, hybrid advisor, GenAI narratives/chat
- Database policy: `Small` uses SQLite on the VM; `Default` and `High Throughput` use PostgreSQL on OCI

## Cost Components

```text
Compute VM (E4 Flex)      : OCPU + RAM-driven
Boot / block storage      : baseline persistent disk
Network egress            : workload-dependent
SQLite on VM              : lowest-cost path for small deployments
PostgreSQL on OCI         : recommended for medium and enterprise reliability
Logging / monitoring      : low-to-moderate, retention dependent
GenAI inference usage     : highly variable by prompt volume and model choice
```

## Deployment Sizes (USD / month)

| Size | Infra shape guidance | Database approach | Core infra* | DB / PaaS | GenAI usage | Estimated total |
|---|---|---:|---:|---:|---:|
| Small | `1 OCPU / 4 GB` | SQLite on VM | 60-100 | 0 | 15-80 (light) | **75-180** |
| Default | `2 OCPU / 8 GB` | PostgreSQL on OCI | 90-140 | 70-140 | 80-250 (medium) | **240-530** |
| High Throughput | `4 OCPU / 16 GB` | PostgreSQL on OCI | 180-320 | 150-260 | 300-1200+ (heavy) | **630-1780+** |

\* Core infra includes VM, storage, baseline logging, and normal operational overhead.

## Practical Planning Number

For most production deployments with active usage and GenAI enabled, plan for:

- **$240-$530 / month** for the default production shape using PostgreSQL on OCI
- **$75-$180 / month** for a lean small deployment that stays on-VM without a PaaS database

## Notes

- GenAI is the largest cost variable; token/request volume drives the biggest monthly swings.
- Small deployments intentionally avoid a PaaS database to keep cost and operational complexity low.
- Egress-heavy use cases (large exports, frequent downloads) can materially increase totals.

## Cost Control Recommendations

1. Start with `2 OCPU / 8 GB` and tune after observing p95 API latency and dashboard performance.
2. Track GenAI request volume and set OCI budget alerts specifically for GenAI spend.
3. Keep non-production environments scheduled off-hours.
4. Move from SQLite to PostgreSQL on OCI only when concurrency, audit retention, or operational isolation justify it.
5. Keep the PostgreSQL service tier aligned with actual write volume and retention needs instead of defaulting to a larger database footprint.
