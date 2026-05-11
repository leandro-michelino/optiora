# Cost Estimate (Monthly, Full Capability)

Current as of **May 11, 2026**.

This estimate reflects the current OptiOra architecture and behavior:
- OCI-hosted application plane (API + Dashboard).
- Multi-cloud provider connectivity (AWS, Azure, GCP, OCI).
- Billing and cost reads prefer live provider APIs, then stored live scan snapshots, then optional CSV imports for manual backfill or reconciliation.
- Stored scan snapshots for most default dashboard/recommendation reads, with explicit live refresh when requested.
- Real-time telemetry query paths for Cost Advisor and operator-triggered refreshes. Advisor Conversation over-provisioning/right-sizing questions are scoped to provider-backed AWS, Azure, GCP, and OCI resource evidence rather than broad service/account aggregates.
- Optimization Advisor live refresh uses a provider-native request budget of up to `120s` in the dashboard because OCI live advisor scans have been observed at roughly `50s`; the page defaults to live provider advisor mode so Cloud Advisor rows are current.
- Kubernetes/container visibility now includes live OCI resource inventory for OKE clusters, OCI Container Instances, and OCIR repositories. New resources can show before billing rows arrive; active Container Instances use a conservative run-rate estimate until metered cost data catches up.
- Real OCI GenAI + RAG responses for advisory and narrative outputs when configured, with deterministic prompt/RAG fallback when unavailable.
- Realized savings scorecards and UIX navigation improvements run on existing API/dashboard capacity and do not add a separate infrastructure service.

## Assumptions

- Primary deployment region: `uk-london-1`.
- Runtime: one VM running API + dashboard continuously (~730 hours/month).
- Compute shape pricing is modeled as OCPU-hours plus memory GB-hours for
  flexible OCI VM shapes. Use the OCI cost estimator for purchase decisions.
- Extra block volume baseline: optional balanced block volume with `10 VPUs/GB`.
  The current live `terraform/terraform.tfvars` deployment keeps the extra
  block volume disabled, so the running OCI VM uses its boot volume unless an
  external database or data volume is enabled later.
- OCI Generative AI costs are driven by request/response character volume and
  selected serving mode. Treat the GenAI bands below as workload envelopes, not
  committed spend.
- Feature set enabled:
  - FinOps analytics, rightsizing, forecasting, tagging, scorecards, exports.
  - Scheduler + policy controls.
  - Cost Advisor with provider refresh fallbacks, stored-snapshot reuse, and hybrid deterministic + GenAI flow.
- Data model:
  - `Small`: SQLite on VM.
  - `Default` / `High Throughput`: PostgreSQL on OCI.
- Cloud provider API access is enabled for connected accounts.

## Current OCI VM Deployment Estimate

The currently deployed production VM is the live reference for the planning
bands below:

```text
Region       : uk-london-1
Shape        : VM.Standard.E4.Flex
Runtime      : 2 OCPU / 8 GiB x 730h
Extra volume : disabled in terraform/terraform.tfvars
Database     : SQLite on VM unless OCI/PostgreSQL env vars are supplied
Shape basis  : (2 x $0.0255 + 8 x $0.0015) x 730 ~= $46/month
```

For the current VM-only footprint, before GenAI request volume, external
database services, optional block volumes, export growth, and unusually heavy
live telemetry, use a **$60-$120/month** infrastructure planning band. For
full production usage with medium telemetry and GenAI/RAG activity, keep using
the **Default** profile below because inference volume and data services can
outweigh the VM shape itself.

## Cost Drivers

```text
Compute + memory (VM)                 : baseline runtime cost
Persistent storage (boot + data)      : DB files, exports, historical snapshots
DB platform                            : SQLite / PostgreSQL / optional ADB BYOL
Provider telemetry collection          : scan cadence, refresh behavior, and account count dependent
Logging and retention                  : alert/events/history growth dependent
GenAI + RAG inference                  : prompt volume and response size dependent
Finance scorecard aggregation          : existing database/API CPU; normally negligible vs provider telemetry
Kubernetes live inventory              : OCI control-plane/API calls plus container runtime run-rate estimates
Network egress                         : export/report/API payload dependent
```

## Current Shape-Only Compute Basis

The table below isolates VM shape cost before storage, database, telemetry,
logging, exports, and GenAI. It is useful for checking that the wider monthly
profile bands stay grounded in the actual runtime shape.

```text
Small     1 OCPU /  4 GiB x 730h ~= $23/month shape-only
Default   2 OCPU /  8 GiB x 730h ~= $46/month shape-only
High      4 OCPU / 16 GiB x 730h ~= $92/month shape-only
```

The profile totals below remain higher because they include storage, runtime
services, snapshot/export growth, provider telemetry, logging, database choice,
and GenAI usage.

## Deployment Profiles (USD / month)

| Profile | Shape guidance | Database | Core infra* | Telemetry/ops | GenAI + RAG | Estimated total |
|---|---|---|---:|---:|---:|---:|
| Small | `1 OCPU / 4 GB` | SQLite on VM | 55-115 | 10-35 | 20-90 | **85-240** |
| Default | `2 OCPU / 8 GB` | PostgreSQL | 105-190 | 35-110 | 100-320 | **240-620** |
| High Throughput | `4 OCPU / 16 GB` | PostgreSQL | 215-420 | 110-300 | 350-1400+ | **675-2120+** |

\* Core infra includes VM, base storage, nginx front door, baseline logs, scheduler overhead, and normal operational services. Ranges are planning estimates; verify region-specific list prices in the OCI cost estimator before purchase.

## Real-Time Telemetry Multiplier

Cost changes materially with scan/refresh frequency and account count. Most dashboard pages still use stored scan/import signals by default, while Optimization Advisor defaults to live provider advisor mode to keep Cloud Advisor findings current.

- Light cadence (scheduled scans, stored-snapshot dashboard reads): add ~`0.8x` to `1.0x` telemetry baseline.
- Medium cadence (hourly-ish operational checks plus periodic manual live refresh): add ~`1.2x` to `1.6x` telemetry baseline.
- Heavy cadence (frequent manual live rightsizing scans, real-time top-N questions, or many accounts/regions): add ~`1.8x` to `2.7x` telemetry baseline.

Practical effect:
- Teams that use many live operational questions (for example, repeated top-N CPU/memory queries across providers) should budget closer to the **upper half** of each profile range.
- Teams that rely on scheduled scans and stored snapshots for most dashboard usage should budget closer to the **lower half** of each profile range.
- Live Optimization Advisor scans can be comparatively long-running provider calls. Budget for the provider API request volume and VM CPU time when operators repeatedly run `refresh_live=true` across broad provider scopes.

## Optional Add-Ons

- Redis-backed rate limiting/session controls: **+$15 to +$60** / month.
- Increased archive/export growth: **+$5 to +$35** / month.
- Notification-heavy webhook/email patterns: usually low, but can add egress/log volume.
- Longer scan snapshot retention: storage growth is usually modest at small scale, but high-account environments should model retention by account count, scan cadence, and export volume.
- Temporary Kubernetes/container E2E resources: an OKE Basic control plane with no node pool is modeled as **$0 incremental control-plane run rate** here, while one `CI.Standard.E4.Flex` OCI Container Instance at `1 OCPU / 1 GiB` is estimated as `(1 x $0.0255 + 1 x $0.0015) x 730`, or about **$19.71/month**, before image storage, logs, and network traffic. Deleted E2E resources add **$0/month** ongoing run rate. Confirm current regional list pricing before leaving E2E resources running.

## Autonomous Database BYOL Note

If using Autonomous Database with BYOL:
- Typical runtime delta vs small PostgreSQL footprint: **+$120 to +$280** / month.
- Oracle DB license entitlement remains external to this estimate.

## Planning Baselines

- Default production (PostgreSQL + medium telemetry + medium GenAI): **$240-$620 / month**.
- Default with heavier real-time cross-provider usage: **$375-$900 / month**.
- Small cost-conscious profile (SQLite + light telemetry): **$85-$240 / month**.

## Cost Control Recommendations

1. Start with `2 OCPU / 8 GB`, then tune using actual scan duration, API p95 latency, and dashboard responsiveness.
2. Cap manual live-refresh bursts in production workflows and rely on scheduler cadence where possible.
3. Track GenAI request volume separately from deterministic analytics volume.
4. Keep retention windows intentional (alerts, snapshots, exports) to avoid silent storage creep.
5. Use proxy-based operational rankings only when native monitoring is unavailable, then connect provider monitoring to improve precision.
6. Keep `refresh_live=false` for normal dashboard browsing and reserve live refresh for operational decision points.
7. Run broad live rightsizing refreshes by provider scope first, then use dashboard filters/search to inspect the returned cards instead of re-running the provider scan repeatedly.
8. Use realized savings scorecards to prioritize follow-up on high-variance owners/providers before running more live scans.
9. For Kubernetes tests, keep OKE node pools optional unless workload-level OpenCost validation is required; a control-plane-only OKE cluster plus one small Container Instance is enough to validate live inventory wiring.

## Contact / Pilot

Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot
