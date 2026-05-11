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

  const activeItem = useMemo(() => {
    return [...flatNavItems]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => isActivePath(pathname, item.href))
  }, [pathname])

  const pageTitle = activeItem?.label || 'Dashboard'
  const pageDescription = activeItem?.description || 'Review FinOps signals, actions, and operating status.'
  const pageSection = activeItem?.section || 'Workspace'
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
            <ThemeToggle className="hidden md:inline-flex lg:hidden" />
          </div>
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
