'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Cloud,
  Grid,
  Layers3,
  Lightbulb,
  ShieldCheck,
  Tag,
} from 'lucide-react'
import {
  fetchAlerts,
  fetchAllocationCoverage,
  fetchApiHealth,
  fetchChargeback,
  fetchCostTrend,
  fetchCostsStrict,
  fetchImportedCostSummary,
  fetchProviderAccountRollups,
  fetchProviderDiagnostics,
  fetchRecommendationsStrict,
  fetchScanHistory,
} from '@/lib/api'
import { buildCostDataSourceStatus } from '@/lib/data-source'
import { transformApiTrend, type ChartCostTrendPoint } from '@/lib/cost-trend'
import { DataSourceBanner } from '@/components/DataSourceBanner'
import { MonthlyComparisonCard } from '@/components/MonthlyComparisonCard'
import { Expander } from '@/components/ui/expander'
import {
  AllocationCoverageResponse,
  ApiHealth,
  ChargebackResponse,
  CostResponse,
  ImportedCostSummaryResponse,
  ProviderAccountRollupResponse,
  ProviderDiagnostic,
  RecommendationResponse,
  ScanHistoryItem,
  AlertEvent,
  CostTrendResponse,
} from '@/lib/types'

interface WorkspaceView {
  id: string
  name: string
  description: string
  href: string
  metric: string
  submetric: string
  icon: React.ReactNode
}

interface MyDashboardsState {
  costs: CostResponse | null
  trend: CostTrendResponse | null
  rollups: ProviderAccountRollupResponse | null
  recommendations: RecommendationResponse[]
  history: ScanHistoryItem[]
  alerts: AlertEvent[]
  importedSummary: ImportedCostSummaryResponse | null
  health: ApiHealth | null
  diagnostics: ProviderDiagnostic[]
  coverage: AllocationCoverageResponse | null
  chargeback: ChargebackResponse | null
  loading: boolean
  error: string | null
}

const initialState: MyDashboardsState = {
  costs: null,
  trend: null,
  rollups: null,
  recommendations: [],
  history: [],
  alerts: [],
  importedSummary: null,
  health: null,
  diagnostics: [],
  coverage: null,
  chargeback: null,
  loading: true,
  error: null,
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 30_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (reason) => {
        window.clearTimeout(timer)
        reject(reason)
      },
    )
  })
}

export default function MyDashboardsPage() {
  const [state, setState] = useState<MyDashboardsState>(initialState)

  useEffect(() => {
    async function loadWorkspaceViews() {
      const [
        costs,
        trend,
        rollups,
        recommendations,
        history,
        alerts,
        importedSummary,
        health,
        diagnostics,
        coverageResult,
        chargebackResult,
      ] = await Promise.allSettled([
        withTimeout(fetchCostsStrict(), 'Workspace costs', 45_000),
        withTimeout(fetchCostTrend('monthly', 12), 'Cost trend', 25_000),
        withTimeout(fetchProviderAccountRollups(), 'Provider account rollups', 25_000),
        withTimeout(fetchRecommendationsStrict({ limit: 6, offset: 0 }), 'Recommendations', 25_000),
        withTimeout(fetchScanHistory(6), 'Scan history', 20_000),
        withTimeout(fetchAlerts(6), 'Alerts', 20_000),
        withTimeout(fetchImportedCostSummary(), 'Imported cost summary', 20_000),
        withTimeout(fetchApiHealth(), 'API health', 15_000),
        withTimeout(fetchProviderDiagnostics(), 'Provider diagnostics', 20_000),
        withTimeout(fetchAllocationCoverage(), 'Allocation coverage', 25_000),
        withTimeout(fetchChargeback('team'), 'Chargeback', 25_000),
      ])

      setState({
        costs: costs.status === 'fulfilled' ? costs.value : null,
        trend: trend.status === 'fulfilled' ? trend.value : null,
        rollups: rollups.status === 'fulfilled' ? rollups.value : null,
        recommendations:
          recommendations.status === 'fulfilled' ? recommendations.value.items : [],
        history: history.status === 'fulfilled' ? history.value : [],
        alerts: alerts.status === 'fulfilled' ? alerts.value : [],
        importedSummary: importedSummary.status === 'fulfilled' ? importedSummary.value : null,
        health: health.status === 'fulfilled' ? health.value : null,
        diagnostics: diagnostics.status === 'fulfilled' ? diagnostics.value : [],
        coverage: coverageResult.status === 'fulfilled' ? coverageResult.value : null,
        chargeback: chargebackResult.status === 'fulfilled' ? chargebackResult.value : null,
        loading: false,
        error:
          costs.status === 'rejected'
            ? costs.reason instanceof Error
              ? costs.reason.message
              : 'Unable to load workspace dashboard views.'
            : null,
      })
    }

    void loadWorkspaceViews()
  }, [])

  const dataSourceStatus = buildCostDataSourceStatus({
    health: state.health,
    importedSummary: state.importedSummary,
    diagnostics: state.diagnostics,
    primaryLoaded: Boolean(state.costs),
    pageName: 'Saved Views',
    isLoading: state.loading,
  })

  const workspaceViews = useMemo<WorkspaceView[]>(() => {
    const topProvider = Object.entries(state.costs?.breakdown || {}).sort(
      (left, right) => right[1].cost - left[1].cost,
    )[0]
    const openAlerts = state.alerts.filter((item) => !item.acknowledged_at)
    const totalRecommendationSavings = state.recommendations.reduce(
      (sum, item) => sum + item.savings,
      0,
    )

    return [
      {
        id: 'overview',
        name: 'Executive Overview',
        description: 'Current workspace spend, source status, and provider distribution.',
        href: '/dashboard',
        metric: formatCurrency(state.costs?.totalCost || 0),
        submetric: topProvider ? `Top provider ${topProvider[0].toUpperCase()}` : 'Waiting for provider totals',
        icon: <BarChart3 className="w-6 h-6" />,
      },
      {
        id: 'costs',
        name: 'Account Rollups',
        description: 'Hierarchy views built from imported CSVs or completed scan snapshots.',
        href: '/dashboard/costs',
        metric: String(state.rollups?.items.length || 0),
        submetric: state.rollups?.items.length ? 'rollup node(s) ready for drill-down' : 'No hierarchy nodes yet',
        icon: <Layers3 className="w-6 h-6" />,
      },
      {
        id: 'recommendations',
        name: 'Optimization Queue',
        description: 'Backend-ranked savings opportunities and ROI signals.',
        href: '/dashboard/recommendations',
        metric: String(state.recommendations.length),
        submetric:
          state.recommendations.length > 0
            ? `${formatCurrency(totalRecommendationSavings)} monthly opportunity`
            : 'No recommendations available yet',
        icon: <Lightbulb className="w-6 h-6" />,
      },
      {
        id: 'operations',
        name: 'Operations Readiness',
        description: 'Recent scan runs, alerting state, and backend runtime readiness.',
        href: '/dashboard/operations',
        metric: String(state.history.length),
        submetric:
          openAlerts.length > 0
            ? `${openAlerts.length} open alert(s)`
            : 'No open alerts right now',
        icon: <Activity className="w-6 h-6" />,
      },
      {
        id: 'chargeback',
        name: 'Chargeback & Allocation',
        description: 'Business mapping coverage and team-level cost attribution.',
        href: '/dashboard/costs',
        metric: state.coverage ? `${state.coverage.coverage_percent.toFixed(0)}%` : '—',
        submetric: state.coverage
          ? `${formatCurrency(state.coverage.mapped_cost_usd)} mapped of ${formatCurrency(state.coverage.total_cost_usd)}`
          : 'No allocation data yet — define mapping rules',
        icon: <Tag className="w-6 h-6" />,
      },
      {
        id: 'advanced-finops',
        name: 'FinOps Control Tower',
        description: 'Tag quality scoring, decision-grade recommendations, federation, and remediation guardrails.',
        href: '/dashboard/advanced-finops',
        metric: state.coverage ? `${state.coverage.coverage_percent.toFixed(0)}%` : '—',
        submetric: `${state.rollups?.items.length || 0} hierarchy node(s) available`,
        icon: <ShieldCheck className="w-6 h-6" />,
      },
    ]
  }, [state.alerts, state.costs, state.coverage, state.history, state.recommendations, state.rollups])

  const trendData = useMemo<ChartCostTrendPoint[]>(
    () => (state.trend ? transformApiTrend(state.trend) : []),
    [state.trend],
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
          <Grid className="w-10 h-10 text-indigo-600" />
          Saved Views
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Real workspace views generated from backend data instead of static mock dashboards.
        </p>
      </div>

      {state.error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {state.error}
        </div>
      )}

      <DataSourceBanner status={dataSourceStatus} />

      <Expander
        title="Saved Views Reading Guide"
        description="Open for how workspace spend, saved launchers, scans, alerts, and chargeback coverage are assembled."
        icon={<Grid className="w-5 h-5 text-indigo-600" />}
      >
        <div className="grid gap-3 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-3">
          <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
            <p className="font-semibold text-slate-900 dark:text-white">Workspace</p>
            <p className="mt-1">Spend and provider status come from the same backend source used by the main dashboard pages.</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
            <p className="font-semibold text-slate-900 dark:text-white">Launchers</p>
            <p className="mt-1">Each saved view is a shortcut into a focused workflow, with live metrics shown when backend data is ready.</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
            <p className="font-semibold text-slate-900 dark:text-white">Readiness</p>
            <p className="mt-1">Scans, alerts, hierarchy coverage, and chargeback mapping show whether the workspace is ready for operator action.</p>
          </div>
        </div>
      </Expander>

      {state.loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-28 rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="grid gap-4 md:grid-cols-4">
            <div className="h-28 rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="h-28 rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="h-28 rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="h-28 rounded-lg bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
      ) : (
      <>
      <div className="grid md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Workspace Spend</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">
            {formatCurrency(state.costs?.totalCost || 0)}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Configured Providers</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">
            {state.diagnostics.filter((item) => item.configured).length}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Recent Scans</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">
            {state.history.length}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Open Alerts</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">
            {state.alerts.filter((item) => !item.acknowledged_at).length}
          </p>
        </div>
      </div>

      <Expander
        title="Month-over-Month Analysis"
        description="Compare selected months and provider movement when you need trend detail."
        icon={<BarChart3 className="w-5 h-5 text-indigo-600" />}
      >
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <MonthlyComparisonCard
            data={trendData}
            title="Month-over-Month Cost"
            className="xl:col-span-2"
          />
          <div className="card">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Comparison Use</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Select any two months, such as April and May, to see the exact cost delta and which providers drove the change.
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              This view uses the same monthly series as the main dashboard, including archived periods when the selected range goes beyond the 90-day hot tier.
            </p>
          </div>
        </div>
      </Expander>

      <Expander
        title="Workspace Dashboards"
        description="Open the full launcher when you need to jump into a specific operational view."
        icon={<Grid className="w-5 h-5 text-indigo-600" />}
        defaultOpen
      >
        <div className="grid md:grid-cols-2 gap-6">
          {workspaceViews.map((view) => (
            <Link
              key={view.id}
              href={view.href}
              className="card hover:shadow-lg transition-all hover:border-indigo-300 dark:hover:border-indigo-700 group"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="rounded-lg bg-indigo-50 p-3 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300">
                  {view.icon}
                </div>
                <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                {view.name}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                {view.description}
              </p>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Primary Metric</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{view.metric}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Context</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{view.submetric}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Expander>

      <Expander
        title="Runtime, Hierarchy, Alerts, And Chargeback Detail"
        description="Secondary readiness signals are grouped here to keep the dashboard launcher focused."
        icon={<Activity className="w-5 h-5 text-slate-600" />}
      >
      <div className="grid md:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Cloud className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-slate-900 dark:text-white">Provider Runtime</h3>
          </div>
          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            {state.diagnostics.length === 0 ? (
              <p>Provider diagnostics are unavailable.</p>
            ) : (
              state.diagnostics.map((item) => (
                <div key={item.provider} className="flex items-center justify-between">
                  <span className="uppercase">{item.provider}</span>
                  <span className={item.configured ? 'text-emerald-600' : 'text-amber-600'}>
                    {item.configured ? 'Configured' : 'Missing runtime'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Layers3 className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-slate-900 dark:text-white">Hierarchy Coverage</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">
            {state.rollups?.items.length || 0}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
            Account/subscription/project/tenancy rollup node(s) available for dashboard drill-down.
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-slate-900 dark:text-white">Alert Posture</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">
            {state.alerts.filter((item) => !item.acknowledged_at).length}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
            Open alert(s) awaiting acknowledgement or further investigation.
          </p>
        </div>

        {/* Chargeback Overview Card */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-5 h-5 text-violet-600" />
            <h3 className="font-semibold text-slate-900 dark:text-white">Chargeback Coverage</h3>
          </div>
          {state.coverage ? (
            <>
              <p className="text-3xl font-bold text-violet-600">
                {state.coverage.coverage_percent.toFixed(1)}%
              </p>
              <div className="mt-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-2 rounded-full bg-violet-500"
                  style={{ width: `${Math.min(state.coverage.coverage_percent, 100)}%` }}
                />
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                {state.chargeback?.groups.length || 0} team(s) mapped ·{' '}
                {formatCurrency(state.coverage.unmapped_cost_usd)} unmapped
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              No allocation data yet. Define mapping rules and upload tagged cost data.
            </p>
          )}
          <Link
            href="/dashboard/costs"
            className="inline-flex items-center gap-1 text-sm font-medium text-violet-600 hover:underline dark:text-violet-400 mt-3"
          >
            View chargeback <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
      </Expander>
      </>
      )}
    </div>
  )
}
