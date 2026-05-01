# Cost Estimate (Monthly, Full Capability)

Current as of May 2026. Estimates assume OCI hosting with OptiOra's current feature set, including forecasting, deep analytics, operations policy controls, scheduler policy controls, admin diagnostics, export jobs, and OCI Generative AI.

## Assumptions

- Region: `uk-london-1`
- Runtime: one VM running backend + dashboard
- Availability baseline: 24x7 (~730 hours/month)
- Features enabled: analytics, rightsizing, virtual tags, operations lifecycle controls, executive reports, hybrid advisor, GenAI narratives/chat
- Database policy:
  - `Small`: SQLite on VM
  - `Default` / `High Throughput`: PostgreSQL on OCI
  - Optional enterprise path: Autonomous Database **BYOL** (license cost not included below)

## Cost Components

```text
Compute VM (E4 Flex)         : OCPU + RAM-driven
Boot / block storage         : baseline persistent disk
Network egress               : workload-dependent
Database                     : SQLite (small) or PostgreSQL (default/high)
Operations controls          : low compute overhead (scheduler + policies)
Logging / diagnostics        : low-to-moderate, retention dependent
GenAI inference usage        : highly variable by prompt volume and model choice
Optional Redis               : for distributed auth rate limiting at scale
```

## Deployment Sizes (USD / month)

| Size | Infra shape guidance | Database approach | Core infra* | DB / PaaS | GenAI usage | Estimated total |
|---|---|---:|---:|---:|---:|
| Small | `1 OCPU / 4 GB` | SQLite on VM | 60-100 | 0 | 15-80 (light) | **75-180** |
| Default | `2 OCPU / 8 GB` | PostgreSQL on OCI | 90-140 | 70-140 | 80-250 (medium) | **240-530** |
| High Throughput | `4 OCPU / 16 GB` | PostgreSQL on OCI | 180-320 | 150-260 | 300-1200+ (heavy) | **630-1780+** |

\* Core infra includes VM, storage, baseline logging, exports, scheduler policy execution overhead, and normal operational overhead.

## Operations Add-Ons (Optional)

- Redis-backed auth rate limiting (`REDIS_URL`): **+$15 to +$60** / month depending on tier and HA.
- Increased archive/report volume (Object Storage + exports): **+$3 to +$25** / month for typical growth.
- Notification-heavy workflows (email/webhook traffic): usually low, but can add modest egress/logging cost at high volume.

## Autonomous Database BYOL Note

For enterprise deployments using Autonomous Database with **BYOL**:

- Runtime infrastructure delta is typically **+$120 to +$280** / month versus small PostgreSQL footprints (usage dependent).
- Oracle database license entitlement is external to this estimate and must be budgeted separately.

## Practical Planning Numbers

- Default production profile (PostgreSQL + medium GenAI usage): **$240-$530 / month**.
- Default + operations hardening add-ons (Redis + higher export volume): **$260-$615 / month**.
- Small low-cost profile (SQLite on VM): **$75-$180 / month**.

## Cost Control Recommendations

1. Start at `2 OCPU / 8 GB` and tune after observing p95 API latency, scan duration, and dashboard response time.
2. Track GenAI token/request volume closely; it remains the largest monthly cost swing.
3. Use scheduler policies to power down non-production environments off-hours and reduce compute spend.
4. Keep retention/archive windows aligned to compliance needs instead of defaulting to long high-volume history.
5. Use Autonomous Database BYOL only when workload scale, HA, and governance requirements justify the uplift.
