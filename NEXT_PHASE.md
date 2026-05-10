# Next Phase Checklist

This file defines the path from the current `0.9.1` dashboard-wiring maintenance release to the `1.0` go-live gate, then the immediate post-`1.0` focus.

## Current Go-Live Position (May 2026)

Release `0.9.0` is the packaged readiness baseline for core FinOps workflows, analytics depth, rightsizing, virtual tags, exports, and hybrid advisor behavior. Release `0.9.1` keeps that baseline and adds dashboard wiring, friendly error-state, cleanup, advisor UIX, live Rightsizing scan timeout correction, and documentation hygiene. Release `1.0` is now gated less on basic live evidence and more on repeatability, evidence packaging, and customer-like workflow proof.

Local validation snapshot recorded on **May 10, 2026**:

- Backend regression suite passing.
- Targeted rightsizing/ledger and deep analytics tests passing (`35` via pytest).
- Frontend production build, type-check, and lint passing.
- Animated route integrity gate passing.
- Tracked Terraform format/validation and Ansible syntax gates passing.
- Workspace cleanup gate passing with dependency/runtime state preserved.
- Live OCI deployment evidence passing: `deploy-oci.sh verify` (`48` passed, `0` failed, `3` skipped).
- Live Rightsizing provider scan evidence passing: broad OCI refresh returned about `730` recommendations in roughly `50s`.
- Realized savings scorecards implemented in `GET /api/v1/analytics/scorecards` and surfaced in the Scorecards dashboard.
- Page-by-page UIX review documented in `UIX_REVIEW.md`, with shell-level navigation and context improvements implemented.

## Release 1.0 Exit Criteria

Work should move into post-`1.0` only after these are true:

- all dashboard routes required for `1.0` render without runtime errors in a deployed environment
- virtual tag CRUD roundtrip passes in live deployment
- rightsizing endpoint returns valid payloads (recommendations or correct empty state)
- at least one deployed environment has passed full smoke validation (passed)
- at least one real customer-like data path has been validated end to end
- deployment/migration runbook steps have been validated for repeatable redeploys
- Alembic migrations apply cleanly on a fresh database

## Go-Live Gate Execution

Use canonical docs for execution details so commands are maintained in one place:

1. Local verification and regression suite: [TESTING.md](TESTING.md)
2. OCI deployment workflow, env vars, and troubleshooting: [DEPLOYMENT.md](DEPLOYMENT.md)
3. Strategic sequencing and release framing: [ROADMAP.md](ROADMAP.md)
4. Release deltas and upgrade notes: [RELEASE_NOTES.md](RELEASE_NOTES.md)

## Next In Line To Implement

**Recommendation Lifecycle Dashboard Experience** is the next product implementation slice.

Reason: OptiOra now persists generated rightsizing recommendations into an organization-scoped ledger with planned, realized, and variance savings fields, and finance can view realized savings scorecards by provider, owner, business unit, and month. The next step is to turn that ledger into a guided execution board for owners, approvals, evidence, drill-through, and realization reviews.

Implemented backend slice:

1. Added `recommendation_ledger`, keyed by organization, provider, resource, recommendation source, and recommendation fingerprint.
2. Rightsizing recommendations are upserted into the ledger when `GET /api/v1/recommendations/rightsizing` returns real recommendation rows.
3. Ledger rows store planned monthly/annual savings, realized monthly/annual savings, variance, status, owner, evidence, source, and console URL context.
4. Added `GET /api/v1/recommendations/ledger`, `PATCH /api/v1/recommendations/ledger/{ledger_id}`, and `GET /api/v1/recommendations/ledger.csv`.
5. Finance workbook exports now include a `Recommendation Ledger` sheet with planned, realized, and variance fields.
6. Scorecards now expose realized savings by provider, owner, business unit, and realized month.

Remaining MVP scope:

1. Add a dashboard execution-board experience with expanders for evidence, approval notes, and realized savings.
2. Add richer state-transition audit events and optional approval policies.
3. Add owner assignment workflows and realization evidence upload/linking in the UI.
4. Add drill-through from realized savings scorecards to filtered ledger rows.

Suggested first files/modules to touch:

- `dashboard/lib/types.ts` and `dashboard/lib/api.ts` for typed frontend contracts.
- `dashboard/app/dashboard/recommendations/page.tsx` for the execution-board UI.
- `dashboard/app/dashboard/rightsizing/page.tsx` for links from discovered recommendations to ledger realization.
- `dashboard/app/dashboard/scorecards/page.tsx` for scorecard-to-ledger drill-through.
- `tests/` for UI-facing ledger state transitions, org isolation, and realized-savings calculations.

Definition of done:

- A recommendation can be reviewed from generated insight through tracked execution item in the dashboard.
- State transitions are organization-scoped and visible to operators.
- The recommendations dashboard shows expected savings, owner, next action, and realization status.
- Reports and exports include realized-vs-expected savings.
- Empty states remain explicit when no real recommendation data exists.

## Post-1.0 Focus

Recommended near-term order:

1. SMTP notification integration with production-grade templates.
2. Scheduled report delivery (weekly/monthly).
3. FOCUS 1.0 export certification.
4. Real cloud utilization signals for rightsizing (CloudWatch, Azure Monitor, Cloud Monitoring). Implemented in `GET /api/v1/recommendations/rightsizing`.
5. Deeper deterministic + RAG-guided intelligence layer. Implemented in:
   - `GET /api/v1/analytics/finops-intelligence`
   - `POST /api/v1/genai/rag-guidance`
   - RAG-enriched GenAI prompts across forecasting, budget risk, commitment, tagging, sustainability, and operating reviews.
6. SSO path (SAML/OIDC) and enterprise auth hardening.

Additional backlog:

- vault-backed secret orchestration for credential storage
- deeper Kubernetes metrics integration (Prometheus/cost-model)
- stronger SaaS multi-tenancy isolation hardening
- dashboard execution board for recommendation realization tracking

## Deferred Optional Hardening

These items remain intentionally outside the default public-dashboard deployment posture:

- mandatory login wall
- mandatory RBAC enforcement
- secure cookie session hardening as a required baseline
- SSO-required access patterns
- vault-required secret-management path

When a hardened deployment is explicitly requested:

```env
ENABLE_AUTH=true
NEXT_PUBLIC_ENABLE_AUTH=true
```

## Contact / Pilot

Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot
