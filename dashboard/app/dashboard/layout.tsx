'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart2,
  BarChart3,
  Box,
  Brain,
  Building2,
  ChevronDown,
  Cloud,
  Grid,
  Info,
  Lightbulb,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Tag,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import ProtectedRoute from '@/components/ProtectedRoute'
import { ThemeToggle } from '@/components/ThemeToggle'
import { cn } from '@/lib/utils'

type NavTone = 'blue' | 'purple' | 'emerald' | 'slate'
type NavProminence = 'primary' | 'secondary'

interface NavItem {
  href: string
  label: string
  icon: typeof BarChart3
  description: string
  keywords: string[]
  prominence?: NavProminence
}

interface NavSection {
  label: string
  tone: NavTone
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    label: 'Workspace',
    tone: 'blue',
    items: [
      { href: '/dashboard', label: 'Overview', icon: BarChart3, description: 'Executive readiness, live data, waste, commitments, and allocation at a glance.', keywords: ['home', 'summary', 'command center', 'health'] },
      { href: '/dashboard/costs', label: 'Billing & Allocation', icon: Cloud, description: 'Provider spend, services, chargeback, business mapping, and exports.', keywords: ['billing', 'spend', 'chargeback', 'mapping', 'cloud costs'] },
      { href: '/dashboard/accounts', label: 'Account Hierarchy', icon: Building2, description: 'Provider accounts, subscriptions, projects, compartments, and regional rollups.', keywords: ['accounts', 'subscriptions', 'projects', 'compartments'] },
      { href: '/dashboard/my-dashboards', label: 'Saved Views', icon: Grid, description: 'Personalized operating views built from backend data.', keywords: ['personal', 'custom', 'workspace', 'my dashboards'], prominence: 'secondary' },
      { href: '/dashboard/portfolio', label: 'Customer Portfolio', icon: Grid, description: 'MSP and partner customer health, spend, savings, and alert posture.', keywords: ['customers', 'msp', 'partner', 'white label'], prominence: 'secondary' },
    ],
  },
  {
    label: 'Intelligence',
    tone: 'purple',
    items: [
      { href: '/dashboard/cost-advisor', label: 'Cost Advisor', icon: MessageCircle, description: 'Ask focused FinOps questions and compare narrative guidance with evidence.', keywords: ['chat', 'copilot', 'advisor', 'assistant'] },
      { href: '/dashboard/forecasting', label: 'Forecasting', icon: TrendingUp, description: 'Budget risk, forecast bands, scenarios, and model diagnostics.', keywords: ['forecast', 'budget', 'risk', 'scenario'] },
      { href: '/dashboard/ai-insights', label: 'AI Insights', icon: Brain, description: 'Deterministic analytics with GenAI explanation and prioritization.', keywords: ['genai', 'analysis', 'insights', 'rag'], prominence: 'secondary' },
      { href: '/dashboard/advanced-finops', label: 'FinOps Control Tower', icon: ShieldCheck, description: 'Consolidated posture across forecast risk, waste, commitments, governance, decision intelligence, and RAG evidence.', keywords: ['advanced', 'decision', 'federation', 'tagging', 'control tower', 'rag'], prominence: 'secondary' },
    ],
  },
  {
    label: 'Optimize',
    tone: 'emerald',
    items: [
      { href: '/dashboard/rightsizing', label: 'Optimization Advisor', icon: BarChart2, description: 'Provider-native Cloud Advisor findings, storage cleanup, rightsizing, and execution detail.', keywords: ['resize', 'rightsizing', 'cloud advisor', 'savings', 'recommendations', 'ledger', 'unattached volumes'] },
      { href: '/dashboard/inventory', label: 'Inventory Explorer', icon: Server, description: 'Provider inventory and real resource action explorer by account, region, type, tag, and waste signal.', keywords: ['resources', 'inventory', 'assets', 'tags', 'costs', 'cloud resources'] },
      { href: '/dashboard/unit-economics', label: 'Unit Economics', icon: TrendingUp, description: 'Business-unit cost, waste rate, provider efficiency, and FOCUS exports.', keywords: ['unit', 'economics', 'kpi', 'focus'] },
      { href: '/dashboard/scorecards', label: 'Scorecards', icon: Award, description: 'Team maturity and realized savings scorecards for finance follow-through.', keywords: ['maturity', 'realized savings', 'finance', 'owner'], prominence: 'secondary' },
      { href: '/dashboard/kubernetes', label: 'Kubernetes', icon: Box, description: 'Cluster cost allocation, namespaces, OpenCost sync, and workload optimization.', keywords: ['k8s', 'opencost', 'namespace', 'cluster'], prominence: 'secondary' },
      { href: '/dashboard/virtual-tags', label: 'Virtual Tags', icon: Tag, description: 'Virtual tag rules and previews without changing cloud resources.', keywords: ['tags', 'rules', 'allocation', 'governance'], prominence: 'secondary' },
    ],
  },
  {
    label: 'Operate',
    tone: 'slate',
    items: [
      { href: '/dashboard/operations', label: 'Operations', icon: Activity, description: 'Scans, alerts, exports, scheduler policy, freshness, and evidence timeline.', keywords: ['ops', 'scan', 'exports', 'scheduler'] },
      { href: '/dashboard/anomalies', label: 'Anomalies', icon: AlertTriangle, description: 'Cost anomaly feed, severity, and investigation context.', keywords: ['alerts', 'spikes', 'anomaly', 'triage'] },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings, description: 'Credentials, CSV imports, approvals, notifications, routing, and export jobs.', keywords: ['config', 'credentials', 'imports', 'notifications'] },
      { href: '/dashboard/recommendations', label: 'Action Ledger', icon: Lightbulb, description: 'Ranked provider, rightsizing, cost-context, and decision-grade recommendations ready for owner follow-through.', keywords: ['optimization', 'actions', 'savings', 'provider', 'recommendations'], prominence: 'secondary' },
      { href: '/dashboard/admin', label: 'Admin Diagnostics', icon: ShieldCheck, description: 'Runtime health, scheduler status, data freshness, and notification telemetry.', keywords: ['admin', 'diagnostics', 'health', 'runtime'], prominence: 'secondary' },
    ],
  },
]

const activeToneClasses: Record<NavTone, string> = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/35 dark:text-blue-300 dark:ring-blue-900/70',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/35 dark:text-violet-300 dark:ring-violet-900/70',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-300 dark:ring-emerald-900/70',
  slate: 'bg-slate-100 text-slate-900 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-slate-700',
}

const activeDotClasses: Record<NavTone, string> = {
  blue: 'bg-blue-600 dark:bg-blue-300',
  purple: 'bg-violet-600 dark:bg-violet-300',
  emerald: 'bg-emerald-600 dark:bg-emerald-300',
  slate: 'bg-slate-600 dark:bg-slate-300',
}

const flatNavItems = navSections.flatMap((section) =>
  section.items.map((item) => ({ ...item, tone: section.tone, section: section.label })),
)

interface PageExplanation {
  purpose: string
  read: string[]
  verify: string
}

const pageExplanations: Record<string, PageExplanation> = {
  '/dashboard': {
    purpose: 'This is the operating summary for the workspace. It blends readiness, spend, waste, commitments, allocation, anomalies, and next actions so an operator can decide where to drill in first.',
    read: [
      'Start with data freshness and readiness before trusting savings or risk numbers.',
      'Treat provider totals as directional when a provider is disconnected, imported only, or still warming live data.',
      'Use the action and anomaly areas as triage, then open the specialist page for execution detail.',
    ],
    verify: 'If a number looks surprising, check Operations for scan freshness and Billing & Allocation for the underlying provider or imported source.',
  },
  '/dashboard/costs': {
    purpose: 'Billing & Allocation explains where cloud spend is coming from and how much is mapped to accounts, services, teams, and chargeback dimensions.',
    read: [
      'Provider and service totals answer where money is going.',
      'Chargeback and business mapping rows explain who owns that spend.',
      'Exports are finance outputs; use them after validating mapping coverage.',
    ],
    verify: 'Compare the data-source banner with the provider labels so AWS, Azure, GCP, and OCI costs are interpreted from the right source.',
  },
  '/dashboard/accounts': {
    purpose: 'Account Hierarchy normalizes AWS accounts, Azure subscriptions, GCP projects, and OCI compartments/tenancies into one operating view.',
    read: [
      'Use hierarchy rows to understand scope before comparing teams or regions.',
      'Regional rollups show where spend is landing inside each provider.',
      'Missing names usually mean the provider returned an identifier but not a friendly display name.',
    ],
    verify: 'Confirm the provider label before acting because each cloud uses different hierarchy names and permissions.',
  },
  '/dashboard/my-dashboards': {
    purpose: 'Saved Views collects personalized operating views so repeated analysis does not require rebuilding filters every time.',
    read: [
      'Pinned or saved views are shortcuts into the same backend data used by the main dashboard pages.',
      'Use this page for recurring checks rather than one-off investigation.',
      'Empty states usually mean no saved filters or personalized rollups exist yet.',
    ],
    verify: 'When a saved view looks stale, refresh the source page or check Operations for scan freshness.',
  },
  '/dashboard/portfolio': {
    purpose: 'Customer Portfolio is for MSP or partner views across multiple customer workspaces, with customer health, spend, savings, and alert posture.',
    read: [
      'Customer-level totals are meant for comparison and triage.',
      'Drill into the customer workspace before making resource-level decisions.',
      'Alert posture shows where support attention is needed first.',
    ],
    verify: 'For a single internal organization, this page may be less useful than Overview, Billing & Allocation, and Operations.',
  },
  '/dashboard/cost-advisor': {
    purpose: 'Cost Advisor turns deterministic FinOps evidence into focused advisory answers and planning narratives.',
    read: [
      'Use evidence-backed sections for numbers; use narrative text as advisory context.',
      'Prompt shortcuts are starting points for investigation, not automatic approvals.',
      'Compare answer claims with the cited provider, forecast, rightsizing, or ledger data nearby.',
    ],
    verify: 'If the backend or GenAI service is unavailable, rely on deterministic dashboard pages until advisory text is healthy again.',
  },
  '/dashboard/forecasting': {
    purpose: 'Forecasting projects future spend using current cost, history coverage, trend, seasonality, volatility, budget guardrails, scenarios, and model diagnostics.',
    read: [
      'Current monthly spend is the baseline; growth rate shows the modeled monthly direction.',
      'Volatility and fan bands describe uncertainty, not guaranteed spend.',
      'Scenario rows compare possible futures, while backtesting shows how well the model performed against prior known periods.',
    ],
    verify: 'Check history source, coverage months, MAPE/WMAPE, and budget guardrails before using the forecast for commitments or executive targets.',
  },
  '/dashboard/ai-insights': {
    purpose: 'AI Insights combines deterministic analytics with OCI GenAI explanation so operators can understand patterns and prioritize next actions.',
    read: [
      'Metrics and rankings come from backend analytics.',
      'Generated explanations help summarize and prioritize, but they do not replace the source data.',
      'Use evidence sections to trace the reason behind each recommendation.',
    ],
    verify: 'When the narrative feels too broad, cross-check the referenced numbers in Forecasting, Optimization Advisor, Billing & Allocation, or Action Ledger.',
  },
  '/dashboard/advanced-finops': {
    purpose: 'FinOps Control Tower is the consolidated posture view for forecast risk, waste, commitments, governance, decision intelligence, RAG evidence, and GenAI prompts.',
    read: [
      'The posture score is an executive signal, not a single root cause.',
      'Lane status shows which operating area needs attention first.',
      'Action queues should be drilled into before assigning owners.',
    ],
    verify: 'Use the specialist pages to validate the specific forecast, waste, commitment, governance, or recommendation evidence behind each lane.',
  },
  '/dashboard/rightsizing': {
    purpose: 'Optimization Advisor shows provider-native findings, rightsizing signals, storage cleanup candidates, and execution detail.',
    read: [
      'Scan status tells you whether results are stored, imported, or live provider data.',
      'Savings should be read with confidence, evidence source, and rollback plan.',
      'OCI storage cleanup and VM rightsizing are separate action types and should not be mixed.',
    ],
    verify: 'For OCI VM work, confirm the row is an OCI Compute instance and use the console link or OCID before changing anything.',
  },
  '/dashboard/inventory': {
    purpose: 'Inventory Explorer is the resource investigation surface for provider assets, cost attribution, action rows, tags, regions, and account context.',
    read: [
      'Provider share shows where the visible inventory is concentrated.',
      'Resource rows are better for investigation than finance approval.',
      'Expand a row to see identifiers, source, tags, and action context before assigning work.',
    ],
    verify: 'Make sure AWS, Azure, GCP, and OCI resource names are read in their own provider context because account and region semantics differ.',
  },
  '/dashboard/unit-economics': {
    purpose: 'Unit Economics translates cloud spend into business metrics such as cost per customer, transaction, request, team, or service unit.',
    read: [
      'Cost per unit is only meaningful when the unit count is current and business-relevant.',
      'Waste rate highlights efficiency drag inside the selected business dimension.',
      'FOCUS exports support standardized finance analysis outside the dashboard.',
    ],
    verify: 'Validate the numerator from Billing & Allocation and the denominator from the business metric owner before using this for KPIs.',
  },
  '/dashboard/scorecards': {
    purpose: 'Scorecards measure FinOps maturity and realized savings follow-through by provider, owner, business unit, and month.',
    read: [
      'Maturity scores show operating discipline; realized savings shows finance outcome.',
      'Planned savings is the expected impact, realized savings is the verified result.',
      'Variance explains whether execution met, missed, or exceeded the plan.',
    ],
    verify: 'Use Action Ledger to inspect the recommendation rows behind realized savings before presenting results to finance.',
  },
  '/dashboard/kubernetes': {
    purpose: 'Kubernetes explains cluster, namespace, workload, container, OpenCost, and live OCI container inventory cost signals.',
    read: [
      'Cluster and namespace allocation estimate where shared compute cost belongs.',
      'Live resource inventory can appear before billing data catches up.',
      'OpenCost details are more precise when the cluster integration is healthy.',
    ],
    verify: 'Check whether each row is live resource inventory, billing data, or imported cost before comparing Kubernetes and non-Kubernetes spend.',
  },
  '/dashboard/virtual-tags': {
    purpose: 'Virtual Tags lets teams assign governance and allocation metadata in OptiOra without changing cloud resources directly.',
    read: [
      'Rules match resources and preview the resulting virtual tag assignment.',
      'Virtual tags improve reporting and ownership even when cloud tags are missing.',
      'Previews should be reviewed before using the tags in chargeback or scorecards.',
    ],
    verify: 'Confirm the rule scope and match conditions so a broad rule does not accidentally classify unrelated resources.',
  },
  '/dashboard/operations': {
    purpose: 'Operations is the runtime control room for scans, alerts, exports, scheduler policy, data freshness, evidence, and system activity.',
    read: [
      'Scan status and freshness explain whether dashboard data is current.',
      'Alerts and exports show what needs operator attention or delivery follow-through.',
      'Scheduler settings explain recurring automation rather than one-time analysis.',
    ],
    verify: 'When any analytical page looks wrong, start here to check failed scans, stale data, or export/runtime errors.',
  },
  '/dashboard/anomalies': {
    purpose: 'Anomalies highlights unusual spend patterns and severity so teams can triage spikes before they become budget surprises.',
    read: [
      'Severity ranks urgency; it does not prove root cause by itself.',
      'Provider, service, and time context explain where to investigate.',
      'Acknowledged or dismissed states are workflow markers, not data deletion.',
    ],
    verify: 'Compare anomalies with Billing & Allocation and Operations freshness before escalating a provider incident.',
  },
  '/dashboard/settings': {
    purpose: 'Settings controls credentials, CSV imports, scan approvals, notifications, routing, and export jobs.',
    read: [
      'Credential state determines whether live provider data can be collected.',
      'CSV imports support analysis when live credentials are not connected.',
      'Approval and notification settings affect operational workflow, not historical cost math.',
    ],
    verify: 'Review credential validity and scan approval before expecting live AWS, Azure, GCP, or OCI results elsewhere.',
  },
  '/dashboard/recommendations': {
    purpose: 'Action Ledger is the owner follow-through queue for provider-native, rightsizing, cost-context, and decision-grade recommendations.',
    read: [
      'Decision score helps prioritize, but owners still need to validate resource scope.',
      'OCI VM candidates only show real OCI Compute instances, not tenancy, account, or service aggregates.',
      'Planned and realized savings fields connect execution to finance verification.',
    ],
    verify: 'Check provider, resource id, evidence source, owner, and status before assigning or closing any action.',
  },
  '/dashboard/admin': {
    purpose: 'Admin Diagnostics is for support and runtime investigation: health, scheduler state, data freshness, cache, and notification telemetry.',
    read: [
      'Health checks explain whether services are reachable.',
      'Freshness and scheduler fields show whether automation is running as expected.',
      'Diagnostics help support handoff more than daily FinOps prioritization.',
    ],
    verify: 'Use this page when Operations or a specialist page reports stale, missing, or unexpected data.',
  },
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/dashboard') {
    return pathname === href
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

function DashboardNav({
  pathname,
  onNavigate,
  navQuery,
  onNavQueryChange,
}: {
  pathname: string
  onNavigate?: () => void
  navQuery: string
  onNavQueryChange: (value: string) => void
}) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const normalizedQuery = navQuery.trim().toLowerCase()
  const itemMatchesQuery = (item: NavItem) => {
    if (!normalizedQuery) return true
    const searchable = [
      item.label,
      item.description,
      ...item.keywords,
    ].join(' ').toLowerCase()
    return searchable.includes(normalizedQuery)
  }
  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter(itemMatchesQuery),
    }))
    .filter((section) => section.items.length > 0)

  return (
    <nav className="space-y-5" aria-label="Dashboard navigation">
      <label className="block px-1">
        <span className="sr-only">Find dashboard screen</span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={navQuery}
            onChange={(event) => onNavQueryChange(event.target.value)}
            placeholder="Find screen"
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:bg-slate-900"
          />
        </span>
      </label>

      {visibleSections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          No screens match that search.
        </div>
      ) : null}

      {visibleSections.map((section) => {
        const primaryItems = section.items.filter((item) => (item.prominence ?? 'primary') === 'primary')
        const secondaryItems = section.items.filter((item) => item.prominence === 'secondary')
        const hasActiveSecondary = secondaryItems.some((item) => isActivePath(pathname, item.href))
        const secondaryExpanded = Boolean(normalizedQuery || hasActiveSecondary || expandedSections[section.label])

        return (
        <section key={section.label} className="space-y-2">
          <div className="px-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            {section.label}
          </div>
          <div className="space-y-1">
            {primaryItems.map((item) => {
              const Icon = item.icon
              const active = isActivePath(pathname, item.href)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                  title={`${item.label}: ${item.description}`}
                  className={cn(
                    'group flex min-h-10 items-start gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
                    active && `shadow-sm ring-1 ${activeToneClasses[section.tone]}`,
                  )}
                >
                  <Icon
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-current',
                      active && 'text-current',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.label}</span>
                    {active || normalizedQuery ? (
                      <span className="mt-0.5 block line-clamp-2 text-xs font-normal leading-4 text-slate-500 dark:text-slate-400">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                  {active && (
                    <span
                      className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', activeDotClasses[section.tone])}
                    />
                  )}
                </Link>
              )
            })}
            {secondaryItems.length > 0 ? (
              <div className="pt-1">
                {!normalizedQuery ? (
                  <button
                    type="button"
                    onClick={() => setExpandedSections((current) => ({
                      ...current,
                      [section.label]: !secondaryExpanded,
                    }))}
                    className="flex h-8 w-full items-center justify-between rounded-lg px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    aria-expanded={secondaryExpanded}
                  >
                    <span>More workflows</span>
                    <ChevronDown className={cn('h-4 w-4 transition', secondaryExpanded && 'rotate-180')} />
                  </button>
                ) : null}
                {secondaryExpanded ? (
                  <div className="mt-1 space-y-1 border-l border-slate-200 pl-2 dark:border-slate-800">
                    {secondaryItems.map((item) => {
                      const Icon = item.icon
                      const active = isActivePath(pathname, item.href)

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onNavigate}
                          aria-label={item.label}
                          aria-current={active ? 'page' : undefined}
                          title={`${item.label}: ${item.description}`}
                          className={cn(
                            'group flex min-h-9 items-start gap-3 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
                            active && `shadow-sm ring-1 ${activeToneClasses[section.tone]}`,
                          )}
                        >
                          <Icon
                            className={cn(
                              'mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-current',
                              active && 'text-current',
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{item.label}</span>
                            {active || normalizedQuery ? (
                              <span className="mt-0.5 block line-clamp-2 text-xs font-normal leading-4 text-slate-500 dark:text-slate-400">
                                {item.description}
                              </span>
                            ) : null}
                          </span>
                          {active && (
                            <span
                              className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', activeDotClasses[section.tone])}
                            />
                          )}
                        </Link>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      )})}
    </nav>
  )
}

function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { user, logout, organizations, activeOrganization, switchOrganization } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [navQuery, setNavQuery] = useState('')
  const [explanationOpen, setExplanationOpen] = useState(false)

  const activeItem = useMemo(() => {
    return [...flatNavItems]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => isActivePath(pathname, item.href))
  }, [pathname])

  const pageTitle = activeItem?.label || 'Dashboard'
  const pageDescription = activeItem?.description || 'Review FinOps signals, actions, and operating status.'
  const pageSection = activeItem?.section || 'Workspace'
  const pageExplanation = activeItem ? pageExplanations[activeItem.href] : undefined
  const userLabel = user?.full_name || user?.email || 'OptiOra user'
  const userInitial = userLabel.trim().charAt(0).toUpperCase() || 'O'

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <a
        href="#dashboard-main"
        className="sr-only fixed left-4 top-4 z-[60] rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Skip to dashboard content
      </a>

      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[19rem] flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-200 dark:border-slate-800 dark:bg-slate-900 lg:translate-x-0 lg:shadow-none',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
          <Link href="/" className="flex min-w-0 items-center gap-3" onClick={() => setMobileNavOpen(false)}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 shadow-sm">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
                OptiOra
              </div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                FinOps Control Plane
              </div>
            </div>
          </Link>
          <button
            type="button"
            aria-label="Close navigation"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-5">
          <DashboardNav
            pathname={pathname}
            navQuery={navQuery}
            onNavQueryChange={setNavQuery}
            onNavigate={() => setMobileNavOpen(false)}
          />
        </div>

        <div className="space-y-3 border-t border-slate-200 p-3 dark:border-slate-800">
          {organizations.length > 0 && (
            <label className="block">
              <span className="mb-1 block px-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Organization
              </span>
              <div className="relative">
                <select
                  value={activeOrganization?.id ?? ''}
                  onChange={(event) => {
                    const nextId = Number(event.target.value)
                    if (Number.isFinite(nextId) && nextId > 0) {
                      void switchOrganization(nextId)
                    }
                  }}
                  className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-3 pr-8 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </label>
          )}

          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{userLabel}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user?.email || activeOrganization?.name}</p>
            </div>
            <ThemeToggle className="h-8 w-8 shrink-0" />
            <button
              type="button"
              onClick={logout}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[19rem]">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800/90 dark:bg-slate-950/85">
          <div className="flex min-h-16 items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
            <button
              type="button"
              aria-label="Open navigation"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white lg:hidden"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Link href="/dashboard" className="hover:text-slate-900 dark:hover:text-white">
                  Dashboard
                </Link>
                {pageTitle !== 'Overview' && <span>/</span>}
                {pageTitle !== 'Overview' && <span className="truncate">{pageSection}</span>}
              </div>
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="truncate text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
                  {pageTitle}
                </h1>
                <p className="hidden max-w-3xl truncate text-sm text-slate-500 dark:text-slate-400 md:block">
                  {pageDescription}
                </p>
              </div>
            </div>

            <div className="hidden min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900 md:flex">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              <span className="truncate text-slate-600 dark:text-slate-300">
                {activeOrganization?.name || 'Public workspace'}
              </span>
            </div>
            {pageExplanation ? (
              <button
                type="button"
                onClick={() => setExplanationOpen((open) => !open)}
                aria-expanded={explanationOpen}
                aria-controls="page-explanation-panel"
                title={`Explain ${pageTitle}`}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  explanationOpen
                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
                )}
              >
                <Info className="h-4 w-4" />
                <span className="hidden sm:inline">Explain page</span>
              </button>
            ) : null}
            <ThemeToggle className="hidden md:inline-flex lg:hidden" />
          </div>
          {pageExplanation && explanationOpen ? (
            <div
              id="page-explanation-panel"
              className="border-t border-slate-200/80 bg-slate-50/95 px-4 py-4 dark:border-slate-800/90 dark:bg-slate-900/95 sm:px-6 lg:px-8"
            >
              <div className="mx-auto grid w-full max-w-[1800px] gap-4 text-sm lg:grid-cols-[1.1fr_1.4fr_1fr]">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">
                    What this page means
                  </p>
                  <p className="mt-2 leading-6 text-slate-700 dark:text-slate-300">
                    {pageExplanation.purpose}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-400">
                    How to read it
                  </p>
                  <ul className="mt-2 grid gap-2 text-slate-700 dark:text-slate-300">
                    {pageExplanation.read.map((item) => (
                      <li key={item} className="flex gap-2 leading-6">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-400">
                    What to verify
                  </p>
                  <p className="mt-2 leading-6 text-slate-700 dark:text-slate-300">
                    {pageExplanation.verify}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </header>

        <main id="dashboard-main" className="min-h-[calc(100vh-4rem)]" tabIndex={-1}>
          <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </ProtectedRoute>
  )
}
