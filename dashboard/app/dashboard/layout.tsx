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

interface NavItem {
  href: string
  label: string
  icon: typeof BarChart3
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
      { href: '/dashboard', label: 'Overview', icon: BarChart3 },
      { href: '/dashboard/my-dashboards', label: 'My Dashboards', icon: Grid },
      { href: '/dashboard/costs', label: 'Cloud Costs', icon: Cloud },
      { href: '/dashboard/accounts', label: 'Account Hierarchy', icon: Building2 },
      { href: '/dashboard/portfolio', label: 'Customer Portfolio', icon: Grid },
    ],
  },
  {
    label: 'Intelligence',
    tone: 'purple',
    items: [
      { href: '/dashboard/ai-insights', label: 'AI Insights', icon: Brain },
      { href: '/dashboard/cost-advisor', label: 'Cost Advisor', icon: MessageCircle },
      { href: '/dashboard/forecasting', label: 'Forecasting', icon: TrendingUp },
    ],
  },
  {
    label: 'FinOps',
    tone: 'emerald',
    items: [
      { href: '/dashboard/unit-economics', label: 'Unit Economics', icon: TrendingUp },
      { href: '/dashboard/scorecards', label: 'Scorecards', icon: Award },
      { href: '/dashboard/advanced-finops', label: 'Advanced FinOps', icon: ShieldCheck },
      { href: '/dashboard/inventory', label: 'Cloud Resources', icon: Server },
      { href: '/dashboard/kubernetes', label: 'Kubernetes', icon: Box },
      { href: '/dashboard/k8s-namespaces', label: 'K8s Namespaces', icon: Box },
      { href: '/dashboard/virtual-tags', label: 'Virtual Tags', icon: Tag },
      { href: '/dashboard/rightsizing', label: 'Rightsizing', icon: BarChart2 },
    ],
  },
  {
    label: 'Operations',
    tone: 'slate',
    items: [
      { href: '/dashboard/operations', label: 'Operations', icon: Activity },
      { href: '/dashboard/admin', label: 'Admin Diagnostics', icon: ShieldCheck },
      { href: '/dashboard/anomalies', label: 'Anomalies', icon: AlertTriangle },
      { href: '/dashboard/recommendations', label: 'Recommendations', icon: Lightbulb },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
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
  section.items.map((item) => ({ ...item, tone: section.tone })),
)

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function DashboardNav({
  pathname,
  onNavigate,
}: {
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <nav className="space-y-6" aria-label="Dashboard navigation">
      {navSections.map((section) => (
        <section key={section.label} className="space-y-2">
          <div className="px-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            {section.label}
          </div>
          <div className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon
              const active = isActivePath(pathname, item.href)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group flex min-h-9 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
                    active && `shadow-sm ring-1 ${activeToneClasses[section.tone]}`,
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-current',
                      active && 'text-current',
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {active && (
                    <span
                      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', activeDotClasses[section.tone])}
                    />
                  )}
                </Link>
              )
            })}
          </div>
        </section>
      ))}
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

  const activeItem = useMemo(() => {
    return [...flatNavItems]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => isActivePath(pathname, item.href))
  }, [pathname])

  const pageTitle = activeItem?.label || 'Dashboard'
  const userLabel = user?.full_name || user?.email || 'OptiOra user'
  const userInitial = userLabel.trim().charAt(0).toUpperCase() || 'O'

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
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
          <DashboardNav pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
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
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
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
                {pageTitle !== 'Overview' && <span className="truncate">{pageTitle}</span>}
              </div>
              <h1 className="truncate text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
                {pageTitle}
              </h1>
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

        <main className="min-h-[calc(100vh-4rem)]">
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
