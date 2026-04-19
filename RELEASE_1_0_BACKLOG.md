# Release 1.0 Backlog

This document turns the `1.0` direction into an implementation backlog that maps to the current repository structure.

## Already Implemented (Release 1.0 Feature-Complete — April 2026)

The following features are fully implemented and shipped. They are tracked here for release documentation purposes.

| Feature | Backend endpoints | Frontend page | Migration |
|---|---|---|---|
| Multi-account hierarchy + rollups | `/api/v1/provider-accounts/*` | accounts/ | 0003 |
| CSV cost import (10 MB, UTF-8) | `/api/v1/imports/costs/*` | settings/ | 0004, 0005 |
| Business mapping + chargeback | `/api/v1/business-mapping/*` | — | 0009 |
| Cost allocation snapshots | internal | — | 0006 |
| Alert routing policies | `/api/v1/alerts/*` | operations/ | 0007 |
| Export jobs (FOCUS, CSV, XLS) | `/api/v1/exports/*` | — | 0008 |
| Cost period summaries | internal | forecasting/ | 0010 |
| Unit Economics | `/api/v1/analytics/unit-economics` | unit-economics/ | — |
| Scorecards | `/api/v1/analytics/scorecards` | scorecards/ | — |
| Resource Inventory | `/api/v1/inventory` | inventory/ | — |
| Kubernetes Cost Allocation | `/api/v1/kubernetes/cost-allocation` | kubernetes/ | — |
| Virtual Tag Engine (CRUD + preview) | `/api/v1/virtual-tags/*` | virtual-tags/ | 0011 |
| Resource-Level Rightsizing | `/api/v1/recommendations/rightsizing` | rightsizing/ | — |
| Hybrid Advisor (deterministic + GenAI) | `/api/v1/advisor/hybrid` | cost-advisor/ | — |
| Cloud waste / efficiency / commitment gap | `/api/v1/analytics/cloud-waste` etc. | — | — |



Deliver a marketable FinOps core by expanding the current public-dashboard deployment into a stronger multi-account, reporting, and finance-facing product.

## Release Principles

- keep direct dashboard access as the default deployment mode
- prioritize product depth over access-control expansion
- keep cost logic deterministic and explainable
- improve test coverage alongside product features
- prefer incremental delivery through small epics that can be deployed and validated independently

## Proposed Delivery Order

1. Test and platform hardening for current flows
2. Multi-account and hierarchy data model
3. Reporting and business mapping
4. Executive dashboards and export depth

## Epic 1: Test and Platform Hardening

Purpose: reduce implementation risk before deeper product expansion.

### Deliverables

- backend tests for credential CRUD
- backend tests for scan approval, scan start, and scan progress
- backend tests for history, diff, alerts, and export endpoints
- backend tests for CSV cost import and role enforcement
- public-mode dashboard regression coverage
- migration upgrade coverage for current Alembic path
- deployment smoke checklist automation

### Likely files

- `tests/test_auth_flow.py`
- `backend API module`
- `backend scanning module`
- `alembic/versions/*`
- `TESTING.md`
- `NEXT_PHASE.md`

### Acceptance criteria

- core backend flows, including CSV import and live credential paths, are covered by automated tests
- public dashboard mode is explicitly tested
- migration failures are caught before deployment
- docs describe one repeatable verification path for local and OCI environments

## Epic 2: Multi-Account and Hierarchy Support

Purpose: move from one credential or one CSV upload per workspace toward real customer hierarchy coverage.

### Deliverables

- account/subscription/project/compartment inventory model
- grouping of scan results by provider-specific hierarchy node
- hierarchy-aware scan orchestration inputs
- dashboard views for provider account rollups
- persisted region-level breakdowns where source data supports them

### Proposed schema additions

- `provider_accounts`
- `provider_account_links`
- `cost_allocation_snapshots`
- optional `business_mappings`

### Likely files

- `backend ORM models module`
- `alembic/versions/*`
- `backend API module`
- `backend scanning module`
- `backend credentials module`
- `backend cost tool modules (aws/azure/gcp/oci)`
- `dashboard/lib/types.ts`
- `dashboard/lib/api.ts`
- `dashboard/app/dashboard/page.tsx`
- `dashboard/app/dashboard/operations/page.tsx`

### Acceptance criteria

- a scan can produce grouped results by account-like hierarchy unit
- dashboard can show rollups by provider account and region
- data model supports AWS accounts, Azure subscriptions, GCP projects, and OCI compartments
- organization-scoped storage still works in public mode

## Epic 3: Business Mapping and Chargeback Foundations

Purpose: make the platform useful for finance and cost allocation workflows.

### Deliverables

- business mapping rules by tag/label/key
- normalized dimensions such as `team`, `environment`, `application`, and `cost_center`
- chargeback/showback aggregation endpoints
- tagging or allocation coverage report
- dashboard sections for mapped vs unmapped spend

### Likely files

- `backend ORM models module`
- `backend API module`
- `backend recommendation tooling module`
- `backend analytics tooling module`
- `dashboard/lib/types.ts`
- `dashboard/lib/api.ts`
- `dashboard/app/dashboard/costs/page.tsx`
- `dashboard/app/dashboard/ai-insights/page.tsx`
- `dashboard/app/dashboard/my-dashboards/page.tsx`

### Acceptance criteria

- users can define at least one mapping rule set
- costs can be grouped by normalized business dimensions
- dashboard shows mapped vs unmapped allocation quality
- exports include business dimensions when available

## Epic 4: Reporting and Executive Outputs

Purpose: improve the customer-facing value of the product for finance, leadership, and external reporting.

### Deliverables

- richer CSV exports with hierarchy and business dimensions
- multi-sheet Excel workbooks for finance-friendly reports
- executive dashboard cards and summary views
- trend views by provider, region, service, and account
- weekly/monthly summary data structure for future scheduled reporting

### Likely files

- `backend API module`
- `backend analytics tooling module`
- `dashboard/lib/types.ts`
- `dashboard/lib/api.ts`
- `dashboard/app/dashboard/page.tsx`
- `dashboard/app/dashboard/costs/page.tsx`
- `dashboard/app/dashboard/forecasting/page.tsx`
- `dashboard/app/dashboard/operations/page.tsx`

### Acceptance criteria

- exports are useful to finance users without manual restructuring
- overview dashboard includes executive summary metrics
- users can drill down by provider, account, region, and mapped business dimension
- generated report structure is stable enough for future scheduled delivery

## Suggested Milestones

### Milestone 1

- complete Epic 1
- harden the existing provider hierarchy foundation
- broaden account rollups to cover both imported and scanned cost paths

### Milestone 2

- complete Epic 2
- add first hierarchy-aware dashboard views
- add region/account trend reporting

### Milestone 3

- complete Epic 3
- add business mapping UI and chargeback aggregates

### Milestone 4

- complete Epic 4
- finalize 1.0 dashboards and exports

## Out of Scope for 1.0

These should stay out unless a customer requirement forces reprioritization.

- mandatory RBAC rollout
- secure cookie session migration
- SAML / OIDC / SSO
- vault-backed secret orchestration
- Kubernetes economics
- auto-remediation workflows

## First Sprint Recommendation

If work starts immediately, the strongest first sprint is:

1. finish Epic 1 gaps around public-mode dashboard regression and migration verification
2. extend CSV import handling to preserve richer hierarchy fields such as account and region
3. expose account-level grouping consistently for imported and scanned datasets
4. add one dashboard card or table showing grouped account spend with imported-data fallback

That sequence reduces risk while producing visible `1.0` progress early.
