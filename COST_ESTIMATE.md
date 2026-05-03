# Cost Estimate (Monthly, Full Capability)

Current as of **May 3, 2026**.

This estimate reflects the current OptiOra architecture and behavior:
- OCI-hosted application plane (API + Dashboard).
- Multi-cloud provider connectivity (AWS, Azure, GCP, OCI).
- Real-time telemetry query paths for Cost Advisor (including cross-provider top-N operational queries).
- GenAI + RAG style responses for advisory and narrative outputs.

## Assumptions

- Primary deployment region: `uk-london-1`.
- Runtime: one VM running API + dashboard continuously (~730 hours/month).
- Feature set enabled:
  - FinOps analytics, rightsizing, forecasting, tagging, scorecards, exports.
  - Scheduler + policy controls.
  - Cost Advisor with provider refresh fallbacks and hybrid deterministic + GenAI flow.
- Data model:
  - `Small`: SQLite on VM.
  - `Default` / `High Throughput`: PostgreSQL on OCI.
- Cloud provider API access is enabled for connected accounts.

## Cost Drivers

```text
Compute + memory (VM)                 : baseline runtime cost
Persistent storage (boot + data)      : DB files, exports, historical snapshots
DB platform                            : SQLite / PostgreSQL / optional ADB BYOL
Provider telemetry collection          : scan cadence and account count dependent
Logging and retention                  : alert/events/history growth dependent
GenAI + RAG inference                  : prompt volume and response size dependent
Network egress                         : export/report/API payload dependent
```

## Deployment Profiles (USD / month)

| Profile | Shape guidance | Database | Core infra* | Telemetry/ops | GenAI + RAG | Estimated total |
|---|---|---|---:|---:|---:|---:|
| Small | `1 OCPU / 4 GB` | SQLite on VM | 60-100 | 10-40 | 20-90 | **90-230** |
| Default | `2 OCPU / 8 GB` | PostgreSQL | 90-150 | 40-120 | 100-320 | **230-590** |
| High Throughput | `4 OCPU / 16 GB` | PostgreSQL | 180-340 | 120-320 | 350-1400+ | **650-2060+** |

\* Core infra includes VM, base storage, baseline logs, scheduler overhead, and normal operational services.

## Real-Time Telemetry Multiplier

Cost changes materially with scan/refresh frequency and account count:

- Light cadence (scheduled, few manual refreshes): add ~`1.0x` telemetry baseline.
- Medium cadence (hourly-ish operational checks): add ~`1.3x` telemetry baseline.
- Heavy cadence (frequent manual “real-time” requests across many accounts): add ~`1.8x` to `2.5x` telemetry baseline.

Practical effect:
- Teams that use many live operational questions (for example, repeated top-N CPU/memory queries across providers) should budget closer to the **upper half** of each profile range.

## Optional Add-Ons

- Redis-backed rate limiting/session controls: **+$15 to +$60** / month.
- Increased archive/export growth: **+$5 to +$35** / month.
- Notification-heavy webhook/email patterns: usually low, but can add egress/log volume.

## Autonomous Database BYOL Note

If using Autonomous Database with BYOL:
- Typical runtime delta vs small PostgreSQL footprint: **+$120 to +$280** / month.
- Oracle DB license entitlement remains external to this estimate.

## Planning Baselines

- Default production (PostgreSQL + medium telemetry + medium GenAI): **$230-$590 / month**.
- Default with heavier real-time cross-provider usage: **$350-$850 / month**.
- Small cost-conscious profile (SQLite + light telemetry): **$90-$230 / month**.

## Cost Control Recommendations

1. Start with `2 OCPU / 8 GB`, then tune using actual scan duration, API p95 latency, and dashboard responsiveness.
2. Cap manual live-refresh bursts in production workflows and rely on scheduler cadence where possible.
3. Track GenAI request volume separately from deterministic analytics volume.
4. Keep retention windows intentional (alerts, snapshots, exports) to avoid silent storage creep.
5. Use proxy-based operational rankings only when native monitoring is unavailable, then connect provider monitoring to improve precision.
