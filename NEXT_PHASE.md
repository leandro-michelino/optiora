# Next Phase Checklist

This file defines the path from the current `0.9.1` dashboard-wiring maintenance release to the `1.0` go-live gate, then the immediate post-`1.0` focus.

## Current Go-Live Position (May 2026)

Release `0.9.0` is the packaged readiness baseline for core FinOps workflows, analytics depth, rightsizing, virtual tags, exports, and hybrid advisor behavior. Release `0.9.1` keeps that baseline and adds dashboard wiring, friendly error-state, cleanup, and documentation hygiene. Release `1.0` remains gated on live OCI evidence.

Local validation snapshot recorded on **May 10, 2026**:

- Backend regression suite passing (`278` test cases, `2` skipped).
- Frontend audit, production build, type-check, and lint passing.
- Animated route integrity gate passing.
- Tracked Terraform format/validation and Ansible syntax gates passing.
- Workspace cleanup gate passing with dependency/runtime state preserved.
- Remaining gate: live OCI environment evidence run.

## Release 1.0 Exit Criteria

Work should move into post-`1.0` only after these are true:

- all dashboard routes required for `1.0` render without runtime errors in a deployed environment
- virtual tag CRUD roundtrip passes in live deployment
- rightsizing endpoint returns valid payloads (recommendations or correct empty state)
- at least one deployed environment has passed full smoke validation
- at least one real customer-like data path has been validated end to end
- deployment/migration runbook steps have been validated for repeatable redeploys
- Alembic migrations apply cleanly on a fresh database

## Go-Live Gate Execution

Use canonical docs for execution details so commands are maintained in one place:

1. Local verification and regression suite: [TESTING.md](TESTING.md)
2. OCI deployment workflow, env vars, and troubleshooting: [DEPLOYMENT.md](DEPLOYMENT.md)
3. Strategic sequencing and release framing: [ROADMAP.md](ROADMAP.md)
4. Release deltas and upgrade notes: [RELEASE_NOTES.md](RELEASE_NOTES.md)

## Post-1.0 Focus

Recommended near-term order:

1. SMTP notification integration with production-grade templates.
2. Scheduled report delivery (weekly/monthly).
3. FOCUS 1.0 export certification.
4. Real cloud utilization signals for rightsizing (CloudWatch, Azure Monitor, Cloud Monitoring). ✅ implemented in `GET /api/v1/recommendations/rightsizing`.
5. Deeper deterministic + RAG-guided intelligence layer. ✅ implemented in:
   - `GET /api/v1/analytics/finops-intelligence`
   - `POST /api/v1/genai/rag-guidance`
   - RAG-enriched GenAI prompts across forecasting, budget risk, commitment, tagging, sustainability, and operating reviews.
6. SSO path (SAML/OIDC) and enterprise auth hardening.

Additional backlog:

- vault-backed secret orchestration for credential storage
- deeper Kubernetes metrics integration (Prometheus/cost-model)
- stronger SaaS multi-tenancy isolation hardening
- recommendation realization tracking (planned vs realized savings)

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
