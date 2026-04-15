# Competitive Integrations Backlog

This backlog captures competitor-proven capabilities that can be integrated into OptiOra quickly, with a focus on practical execution order.

## Priority Bands

## P0 (Start now)

1. Budget alerts to collaboration tools (Slack + Teams) and email
   - Why: common baseline in FinOps tools and already aligned with existing `alert_events`.
   - Status: **Started** (budget alert pipeline now emits channel delivery metadata for email/Slack/Teams).
   - Next technical slice:
     - expose notification destination test endpoint
     - add UI toggles and destination status in Operations/Settings

2. Scheduler operations dashboard quality-of-life
   - Why: competitors expose clear scheduled-run visibility and history.
   - Status: Planned.
   - Technical slice:
     - next-run ETA in API
     - scheduler success/failure counters
     - operations timeline card

3. External anomaly ingestion (AWS Cost Anomaly Detection first)
   - Why: accelerates anomaly signal quality with native cloud detections.
   - Status: Planned.
   - Technical slice:
     - endpoint/worker to ingest AWS anomaly events
     - normalize into `alert_events`

## P1 (Near-term)

1. Export jobs (scheduled CSV/Excel digest with execution history)
2. GCP budget Pub/Sub ingestion
3. Hierarchical budgets on provider-account rollups
4. Connector framework for external cost/usage tools (start with 1–2 connectors)

## P2 (Expansion)

1. OpenCost/Kubernetes layer integration
2. Multi-destination alert routing policies (severity/channel matrix)
3. Finance-ready report packs with business mapping dimensions

## Implementation Notes

- Favor incremental API additions over broad refactors.
- Keep all new records organization-scoped.
- Reuse `scan_runs`, `alert_events`, `audit_logs`, and `provider_account_snapshots` as canonical operational history.
