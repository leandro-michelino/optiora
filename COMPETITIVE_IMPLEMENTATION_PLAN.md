# Competitive Parity and Beyond Plan (April 2026)

This plan translates competitor and standards research into an execution roadmap so OptiOra is at parity or better in practical FinOps workflows.

## Scope and Goal

- Goal: match core capabilities offered by leading CFM tools and exceed them in speed-to-action, explainability, and automation safety.
- Scope: backend APIs, dashboard UX, operational controls, and integration surfaces.
- Success definition:
  - Parity: OptiOra supports equivalent workflows for alerts, forecasting, attribution, allocation, and optimization loops.
  - Better: OptiOra adds lower-friction automation and clearer, role-targeted decisioning with measurable outcomes.

## External Research Summary

Sources reviewed:

- Google Cloud Billing docs: programmatic budget/anomaly notifications via Pub/Sub, delivery semantics (at-least-once, out-of-order), notification schema, and automation patterns.
- Microsoft Azure Cost Management docs: budget alerts, credit/quota alerts, scope-based permissions, and alert lifecycle handling.
- Datadog Cloud Cost Management docs: tagging/allocation controls, cost monitors, data history/freshness controls, and multi-cloud setup.
- IBM Cloudability product pages: maturity-oriented FinOps workflow, commitment optimization, business mapping, and unit economics emphasis.
- FinOps Foundation capabilities: capability model covering ingestion, anomaly management, budgeting, forecasting, reporting, unit economics, and governance.

## Current OptiOra Position (Observed)

Strong today:

- Multi-cloud core APIs and dashboard pages for costs, anomalies, recommendations, forecasting, operations, settings, and AI insights.
- Export jobs with run history and downloadable artifacts.
- External ingestion: AWS anomalies, GCP budget Pub/Sub webhook, connector framework (`cloudhealth`, `spotio`, `opencost`).
- Alert routing policies with severity/channel matrix.
- Finance pack report dimensions (`business_unit`, `cost_center`, `owner`).

Known parity gaps:

- No critical Phase 0/1 parity gaps remain open in the local codebase.
- Focus should now move to Phase 2 differentiation and live OCI evidence runs.

## Capability Gap Matrix

1. Programmatic alert reliability and idempotency visibility
- Competitor baseline: explicit delivery semantics and failure handling guidance (Pub/Sub at-least-once/out-of-order).
- OptiOra status: ✅ implemented (idempotency, dedupe trail, replay endpoints, and operations telemetry).
- Next: improve visualization depth, not core parity.

2. Alert operations lifecycle depth
- Competitor baseline: active/dismissed/reactivated workflows and role-aware alert actions.
- OptiOra status: ✅ implemented (acknowledge/dismiss/reactivate + audit enrichment + ops policy).
- Next: add scheduled executive delivery and deeper noise reduction.

3. Data freshness observability
- Competitor baseline: explicit data history pages showing last bill received / last processed.
- OptiOra status: ✅ implemented (`/api/v1/operations/data-freshness` + Operations page exposure).
- Next: tighten SLO alerting thresholds.

4. Allocation and tag quality controls
- Competitor baseline: tag correction/enrichment rules and allocation confidence.
- OptiOra status: ✅ implemented as MVP (virtual tag rules + preview + finance mapping).
- Next: add richer confidence scoring.

5. Unit economics and KPI benchmarking
- Competitor baseline: trendable unit economics and benchmark framing.
- OptiOra status: ✅ implemented as MVP (unit economics + scorecards endpoints and dashboard views).
- Next: deepen trend/baseline benchmarking history.

## Implementation Plan

## Phase 0 (1-2 weeks): Parity Lock-In

1. Complete destination controls
- [x] Add `POST /api/v1/notifications/test-destination`.
- [x] Add destination toggles and status cards in Settings and Operations.
- [x] Add per-channel last-success/last-error timestamps.

2. Alert lifecycle upgrades
- [x] Extend alert status: `active`, `acknowledged`, `dismissed`, `reactivated`.
- [x] Add API actions and audit logging for each transition.

3. Mockup/demo consistency guardrail
- [x] Keep animated SVG aligned to real routes and only existing API paths.
- [x] Add laptop-run release-gate check that scans `dashboard/public/optiora-animated.svg` for non-existent internal API prefixes.

Exit criteria:

- Operators can test all destinations from UI.
- Alert lifecycle is fully manageable without DB access.
- Demo mockup references only real page names/endpoints.

## Phase 1 (2-4 weeks): Reliability and Operations Superiority

1. Ingestion reliability hardening
- [x] Add idempotency keys for external anomaly and connector ingestion.
- [x] Store source event IDs and dedupe result in audit logs.
- [x] Add replay endpoint for failed events with role checks.

2. Freshness observability
- [x] Add `/api/v1/operations/data-freshness` summary endpoint.
- [x] Show per-provider data age, connector lag, and scheduler lag in Operations page.

3. Routing policy simulator
- [x] Add a dry-run API to evaluate sample alert payloads against routing matrix.
- [x] Surface expected channels before policy save.

Exit criteria:

- Duplicate delivery no longer creates duplicate alerts.
- Operations page shows freshness and lag in one view.
- Routing changes can be validated before activation.

## Phase 2 (4-8 weeks): Better-than-Competitor Differentiation

1. Decision-grade recommendations
- Add confidence score and expected realization window to recommendations.
- Tie each recommendation to a measurable KPI impact.

2. Unit economics cockpit
- Add cost per workload/product metric trends.
- Add benchmark views by business unit and owner.

3. Safe automation loops
- Add policy guardrails and approval thresholds for automation actions.
- Add post-action outcome tracking (planned vs realized savings).

Exit criteria:

- Recommendation panels show confidence, risk, and realized impact.
- Unit economics and accountability are first-class in dashboard workflows.

## Delivery Governance

- Release gate checks:
  - Backend tests: `.venv/bin/python -m pytest -q`
  - Frontend checks: `npm run type-check && npm run lint && npm run build`
- Documentation gate:
  - Keep architecture and operations docs updated with each new endpoint.
- Product metrics:
  - Alert MTTA/MTTR
  - Duplicate event rate
  - Savings realization ratio
  - Forecast error (MAPE/wMAPE)

## Recommended Immediate Next Slice

Implement Phase 2 item 1 next (decision-grade recommendation confidence + realization windows), because parity is already covered and this provides the strongest differentiation lift.
