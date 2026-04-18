# Competitive Integrations Backlog

This backlog captures competitor-proven capabilities that can be integrated into OptiOra quickly, with a focus on practical execution order.

## Priority Bands

## P0 (Start now)

1. Budget alerts to collaboration tools (Slack + Teams) and email
   - Why: common baseline in FinOps tools and already aligned with existing `alert_events`.
   - Status: **Concluded (MVP)** (budget alert pipeline emits channel delivery metadata and includes destination status/toggle/test controls).

2. Scheduler operations dashboard quality-of-life
   - Why: competitors expose clear scheduled-run visibility and history.
   - Status: **Concluded** (scheduler status API + operations timeline now live).
   - Technical slice:
     - ✅ next-run ETA in API (`GET /api/v1/scanning/scheduler/status`)
     - ✅ scheduler success/failure counters
     - ✅ operations timeline card

3. External anomaly ingestion (AWS Cost Anomaly Detection first)
   - Why: accelerates anomaly signal quality with native cloud detections.
   - Status: **Concluded** (AWS external anomaly ingestion endpoint now persists normalized alerts).
   - Technical slice:
     - ✅ endpoint to ingest AWS anomaly events (`POST /api/v1/anomalies/external/aws`)
     - ✅ normalize into `alert_events`

## P1 (Near-term)

1. Export jobs (scheduled CSV/Excel digest with execution history)
   - Status: **Planned** (not yet implemented in the active backend route set).
2. GCP budget Pub/Sub ingestion
   - Status: **Planned** (not yet implemented in the active backend route set).
3. Hierarchical budgets on provider-account rollups
   - Status: **In progress** (hierarchy rollups exist; budget roll-up fields are pending).
4. Connector framework for external cost/usage tools (start with 1–2 connectors)
   - Status: **Planned** (not yet implemented in the active backend route set).

## P2 (Expansion)

1. OpenCost/Kubernetes layer integration
   - Status: **Planned** (depends on connector framework implementation).
2. Multi-destination alert routing policies (severity/channel matrix)
   - Status: **Concluded (MVP)** via `/api/v1/alerts/routing-policies` and policy-aware delivery filtering.
3. Finance-ready report packs with business mapping dimensions
   - Status: **Planned** (current reporting provides executive summary CSV/XLS exports).

## Implementation Notes

- Favor incremental API additions over broad refactors.
- Keep all new records organization-scoped.
- Reuse `scan_runs`, `alert_events`, `audit_logs`, and `provider_account_snapshots` as canonical operational history.
