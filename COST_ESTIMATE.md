# Cost Estimate (Monthly, Full Capability)

Current as of **May 9, 2026**.

This estimate reflects the current OptiOra architecture and behavior:
- OCI-hosted application plane (API + Dashboard).
- Multi-cloud provider connectivity (AWS, Azure, GCP, OCI).
- Stored scan snapshots for default dashboard/recommendation reads, with explicit live refresh when requested.
- Real-time telemetry query paths for Cost Advisor and operator-triggered refreshes (including cross-provider top-N operational queries).
- GenAI + RAG style responses for advisory and narrative outputs.

## Assumptions

- Primary deployment region: `uk-london-1`.
- Runtime: one VM running API + dashboard continuously (~730 hours/month).
- Feature set enabled:
  - FinOps analytics, rightsizing, forecasting, tagging, scorecards, exports.
  - Scheduler + policy controls.
  - Cost Advisor with provider refresh fallbacks, stored-snapshot reuse, and hybrid deterministic + GenAI flow.
- Data model:
  - `Small`: SQLite on VM.
  - `Default` / `High Throughput`: PostgreSQL on OCI.
- Cloud provider API access is enabled for connected accounts.

## Cost Drivers

```text
Compute + memory (VM)                 : baseline runtime cost
Persistent storage (boot + data)      : DB files, exports, historical snapshots
DB platform                            : SQLite / PostgreSQL / optional ADB BYOL
Provider telemetry collection          : scan cadence, refresh behavior, and account count dependent
Logging and retention                  : alert/events/history growth dependent
GenAI + RAG inference                  : prompt volume and response size dependent
Network egress                         : export/report/API payload dependent
```

## Deployment Profiles (USD / month)

| Profile | Shape guidance | Database | Core infra* | Telemetry/ops | GenAI + RAG | Estimated total |
|---|---|---|---:|---:|---:|---:|
| Small | `1 OCPU / 4 GB` | SQLite on VM | 65-125 | 10-35 | 20-90 | **95-250** |
| Default | `2 OCPU / 8 GB` | PostgreSQL | 110-190 | 35-110 | 100-320 | **245-620** |
| High Throughput | `4 OCPU / 16 GB` | PostgreSQL | 220-420 | 110-300 | 350-1400+ | **680-2120+** |

\* Core infra includes VM, base storage, nginx front door, baseline logs, scheduler overhead, and normal operational services. Ranges are planning estimates; verify region-specific list prices in the OCI cost estimator before purchase.

## Real-Time Telemetry Multiplier

Cost changes materially with scan/refresh frequency and account count. The dashboard now defaults rightsizing reads to stored scan/import signals, so steady-state traffic should sit closer to the lower telemetry band when operators avoid repeated live refreshes.

- Light cadence (scheduled scans, stored-snapshot dashboard reads): add ~`0.8x` to `1.0x` telemetry baseline.
- Medium cadence (hourly-ish operational checks plus periodic manual live refresh): add ~`1.2x` to `1.5x` telemetry baseline.
- Heavy cadence (frequent manual “real-time” requests across many accounts): add ~`1.8x` to `2.5x` telemetry baseline.

Practical effect:
- Teams that use many live operational questions (for example, repeated top-N CPU/memory queries across providers) should budget closer to the **upper half** of each profile range.
- Teams that rely on scheduled scans and stored snapshots for most dashboard usage should budget closer to the **lower half** of each profile range.

## Optional Add-Ons

- Redis-backed rate limiting/session controls: **+$15 to +$60** / month.
- Increased archive/export growth: **+$5 to +$35** / month.
- Notification-heavy webhook/email patterns: usually low, but can add egress/log volume.
- Longer scan snapshot retention: storage growth is usually modest at small scale, but high-account environments should model retention by account count, scan cadence, and export volume.

## Autonomous Database BYOL Note

If using Autonomous Database with BYOL:
- Typical runtime delta vs small PostgreSQL footprint: **+$120 to +$280** / month.
- Oracle DB license entitlement remains external to this estimate.

## Planning Baselines

- Default production (PostgreSQL + medium telemetry + medium GenAI): **$245-$620 / month**.
- Default with heavier real-time cross-provider usage: **$375-$900 / month**.
- Small cost-conscious profile (SQLite + light telemetry): **$95-$250 / month**.

## Cost Control Recommendations

1. Start with `2 OCPU / 8 GB`, then tune using actual scan duration, API p95 latency, and dashboard responsiveness.
2. Cap manual live-refresh bursts in production workflows and rely on scheduler cadence where possible.
3. Track GenAI request volume separately from deterministic analytics volume.
4. Keep retention windows intentional (alerts, snapshots, exports) to avoid silent storage creep.
5. Use proxy-based operational rankings only when native monitoring is unavailable, then connect provider monitoring to improve precision.
6. Keep `refresh_live=false` for normal dashboard browsing and reserve live refresh for operational decision points.
