# OptiOra UIX Review

Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot

Current review date: May 10, 2026.

## Review Lens

This review treats OptiOra as a working FinOps operations product, not a marketing site. The UI should help an operator answer three questions quickly on every page:

```text
Where am I?
What matters first?
What should I do next?
```

The strongest project-wide improvement made in this pass is the dashboard shell:

- richer sidebar search using screen names, descriptions, and synonyms
- active-page descriptions in the sticky header
- active/search-result navigation items show page purpose, reducing guesswork
- clearer page grouping through Workspace, Intelligence, FinOps, and Operations context
- Advanced FinOps now acts as a control tower so forecast risk, waste, commitment, governance, decision-frontier, RAG, and GenAI advisory signals are reviewed in one place before the operator drills into specialized pages

## Consolidation Review

```text
Keep separate pages when the workflow/persona is different:
  Billing & Allocation  -> finance, chargeback, exports
  Cloud Resources       -> resource-level investigation
  Kubernetes            -> container/cluster/OpenCost workflow
  Cost Advisor          -> conversational advisory and prompts

Unify dense intelligence signals inside Advanced FinOps:
  forecast risk + waste + commitments + tagging/governance
        + decision frontier + RAG evidence + GenAI prompt
        -> /dashboard/advanced-finops control tower
```

No duplicate dashboard route remains for Kubernetes, containers, Docker,
namespaces, or OpenCost. The only remaining route for that journey is
`/dashboard/kubernetes`. The better reduction path is not deleting specialized
operator pages; it is consolidating executive intelligence into a control tower
and keeping specialist drill-down pages for real work.

## Page-By-Page Review

| Page | Current Experience | Improvements Applied / Preserved | Next UX Enhancements |
|---|---|---|---|
| Overview | Strong command-center page with health, source, waste, commitments, anomalies, allocation, and operating signals. Dense but useful for operators. | Added shell-level page purpose: executive readiness, live data, waste, commitments, and allocation. Search synonyms now find it with `home`, `summary`, `command center`, and `health`. | Add a compact “today’s action queue” above secondary analytics so first-time users know the next move. Keep detailed cards behind expanders. |
| My Dashboards | Useful personalized rollups, but the name can sound generic without context. | Added shell context explaining these are personalized operating views built from backend data. Search supports `personal`, `custom`, and `workspace`. | Let users pin 3-5 favorite cards or saved filters so this page becomes a true daily cockpit. |
| Billing & Allocation | Deep, finance-heavy page with provider buckets, services, recommendations, trends, chargeback, and mapping. It is intentionally separate from resource investigation. | Renamed from Cloud Costs to Billing & Allocation so billing, chargeback, mapping, and exports are not confused with the Cloud Resources explorer. Search still supports `billing`, `spend`, `chargeback`, `mapping`, and `cloud costs`. | Add a persistent mini-summary for total spend, mapped spend, and export status before the detailed expanders. |
| Account Hierarchy | Good operational value for account/subscription/project/compartment rollups. Mostly technical language. | Added shell context for account hierarchy and regional rollups. Search supports provider-specific hierarchy terms. | Add a small glossary tooltip for account type differences across AWS, Azure, GCP, and OCI. |
| Customer Portfolio | Useful MSP/partner view, but its audience differs from internal FinOps users. | Added shell context identifying MSP/partner health, spend, savings, and alert posture. Search supports `customers`, `msp`, `partner`, and `white label`. | Add persona-specific empty states for “single organization” versus “partner portfolio” use. |
| AI Insights | Good positioning as deterministic analytics plus GenAI explanation. Needs clear trust boundaries. | Added shell context that the page is deterministic analytics with GenAI explanation and prioritization. Search supports `genai`, `analysis`, `insights`, and `rag`. | Add a visible “numbers are deterministic, narrative is advisory” note inside the top data-source area. |
| Cost Advisor | Strong conversational experience with evidence and prompt shortcuts. Risk is users asking broad questions before data is ready. | Added shell context for focused FinOps questions and evidence comparison. Search supports `chat`, `copilot`, `advisor`, and `assistant`. | Add prompt chips based on the current page context, such as rightsizing, scorecards, or anomalies. |
| Forecasting | Good analytical depth with scenarios and diagnostics. Can overwhelm non-finance users. | Added shell context for budget risk, forecast bands, scenarios, and diagnostics. Search supports `forecast`, `budget`, `risk`, and `scenario`. | Add a simple “budget risk verdict” first, then keep bands, diagnostics, and scenario detail in expanders. |
| Unit Economics | High-value business view, especially for FOCUS and cost-per-unit. Needs strong business-language framing. | Added shell context for business-unit cost, waste rate, provider efficiency, and FOCUS exports. Search supports `unit`, `economics`, `kpi`, and `focus`. | Add guided examples for cost-per-transaction, cost-per-customer, and cost-per-environment metrics. |
| Scorecards | Previously team maturity oriented; now also carries finance follow-through. | Added realized savings scorecards by provider, owner, business unit, and realized month. Kept details in expanders to avoid flooding the page. Shell search supports `maturity`, `realized savings`, `finance`, and `owner`. | Add direct links from each scorecard row to the filtered recommendation ledger once ledger row filtering is available in UI. |
| Advanced FinOps | Powerful but abstract page with tagging, decision intelligence, and federation. | Added the FinOps Control Tower, unifying forecast risk, waste, commitments, governance, decision frontier, RAG evidence, and GenAI advisory prompts before the deeper panels. Search supports `advanced`, `decision`, `federation`, and `tagging`. | Add drill-through filters from each control-tower lane into Forecasting, Recommendations, Virtual Tags, and Rightsizing. |
| Cloud Resources | Canonical resource-cost explorer for provider, account, region, service type, tag, monthly cost, and waste investigation. | Added the Cloud Resources & Costs cockpit, provider cost share, resource type/region/account/top-resource breakdowns, local search/sort, expandable rows, and the details drawer. Search supports `resources`, `inventory`, `assets`, `tags`, and `costs`. | Add saved filter presets such as “high cost,” “waste flagged,” “untagged,” and “owner unknown.” |
| Kubernetes | Consolidated Kubernetes page is now canonical. It owns Kubernetes, containers, Docker, namespaces, and OpenCost instead of splitting the journey. | Removed the legacy Kubernetes namespace route wiring and kept all Kubernetes/container/Docker inventory, cost, and allocation flows on `/dashboard/kubernetes`. Search supports `k8s`, `opencost`, `namespace`, `cluster`, `docker`, and `container`. | Add a quick “cluster readiness” checklist for OpenCost status, namespace allocation, and stale workload signals. |
| Virtual Tags | Good governance workflow because it avoids changing cloud resources. | Added shell context for virtual tag rules and preview. Search supports `tags`, `rules`, `allocation`, and `governance`. | Add a before/after preview summary showing affected cost share and unmapped spend reduction. |
| Rightsizing | One of the most important pages. It already uses strong expanders and live scan controls. | Added shell context for stored/live provider rightsizing, execution detail, and ledger creation. Search supports `resize`, `savings`, `recommendations`, and `ledger`. | Add a “recommended next 3 actions” strip sorted by savings, confidence, and effort. |
| Operations | Very comprehensive operations hub with scans, alerts, exports, scheduler, freshness, and evidence. | Added shell context for scans, alerts, exports, scheduler policy, freshness, and evidence timeline. Search supports `ops`, `scan`, `exports`, and `scheduler`. | Add a runbook-style checklist at the top when there are provider/data freshness issues. |
| Admin Diagnostics | Useful support page but should feel different from day-to-day FinOps screens. | Added shell context for runtime health, scheduler status, data freshness, and notification telemetry. Search supports `admin`, `diagnostics`, `health`, and `runtime`. | Add copy-to-clipboard diagnostic bundle details for support handoff. |
| Anomalies | Clear intent: unusual cost patterns and spend spikes. Needs fast triage. | Added shell context for anomaly feed, severity, and investigation context. Search supports `alerts`, `spikes`, `anomaly`, and `triage`. | Add severity tabs and “acknowledged/dismissed/open” filters if alert volume grows. |
| Recommendations | Important page that brings provider-native, rightsizing, and decision scoring together. | Added shell context for unified provider, rightsizing, cost-context, and decision-grade recommendations. Search supports `optimization`, `actions`, `savings`, and `provider`. | Add a finance/operator split: “approve savings,” “execute action,” and “monitor result.” |
| Settings | Operationally dense, but it uses expanders well. Contains credentials, CSV, approvals, destinations, routing, and exports. | Added shell context for credentials, CSV imports, approvals, notifications, routing, and export jobs. Search supports `config`, `credentials`, `imports`, and `notifications`. | Add setup progress at the top: data source, credentials, scan permission, exports, notifications. |

## Cross-Page Standards

Use these standards for future UI work:

- Keep the first viewport focused on status, risk, and next action.
- Use expanders for supporting evidence, configuration, and detailed tables.
- Keep page titles literal and searchable.
- Use badges for state, not for long instructions.
- Keep dense tables horizontally scrollable and preserve stable column widths.
- Do not split one user journey across two pages unless the personas are truly different; canonical routes should replace legacy redirects once the UI is consolidated.
- Prefer “what changed / what to do next” language over raw telemetry labels.

## Priority Backlog

| Priority | Item | Pages |
|---|---|---|
| P1 | Add a global action queue fed by provider readiness, anomalies, rightsizing, and ledger variance. | Overview, Operations, Recommendations, Rightsizing, Scorecards |
| P1 | Add ledger drill-through filters from realized savings scorecards. | Scorecards, Recommendations |
| P2 | Add setup progress checklist. | Settings, Overview, Operations |
| P2 | Add saved filter presets. | Billing & Allocation, Cloud Resources, Rightsizing, Recommendations |
| P2 | Add glossary/help microcopy for provider hierarchy and FinOps terms. | Accounts, Unit Economics, Advanced FinOps |
| P3 | Add shareable saved views. | My Dashboards, Billing & Allocation, Cloud Resources, Rightsizing |

## Verification Notes

This review is paired with the existing operator walkthrough in `dashboard/e2e/operator-walkthrough.spec.ts`, which loads every dashboard page and validates that `/dashboard/kubernetes` remains the only Kubernetes/container/Docker route.
