'use client'

import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Cloud,
  Download,
  Layers3,
  Map,
  PieChart as PieChartIcon,
  Plus,
  Tag,
  TrendingUp,
  Zap,
} from 'lucide-react'
import {
  applyMappingRules,
  computePeriodSummaries,
  createMappingRule,
  deleteMappingRule,
  downloadChargebackXlsx,
  downloadExecutiveSummaryCsv,
  downloadExecutiveSummaryExcel,
  fetchAllocationCoverage,
  fetchApiHealth,
  fetchChargeback,
  fetchCostTrend,
  fetchCostsStrict,
  fetchImportedCostSummary,
  fetchMappingRules,
  fetchProviderAccountRollups,
  fetchProviderDiagnostics,
  fetchRecommendationsStrict,
} from '@/lib/api'
import { buildCostDataSourceStatus } from '@/lib/data-source'
import { DataSourceBanner } from '@/components/DataSourceBanner'
import { Expander } from '@/components/ui/expander'
import {
  AllocationCoverageResponse,
  ApiHealth,
  BusinessMappingRule,
  ChargebackResponse,
  CostResponse,
  CostTrendResponse,
  ImportedCostSummaryResponse,
  PaginatedResponse,
  ProviderAccountRollupResponse,
  ProviderDiagnostic,
  RecommendationResponse,
} from '@/lib/types'

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6']

const DIMENSION_LABELS: Record<string, string> = {
  team: 'Team',
  environment: 'Environment',
  application: 'Application',
  cost_center: 'Cost Center',
}

interface CostsPageState {
  costs: CostResponse | null
  recommendations: PaginatedResponse<RecommendationResponse>
  rollups: ProviderAccountRollupResponse | null
  importedSummary: ImportedCostSummaryResponse | null
  health: ApiHealth | null
  diagnostics: ProviderDiagnostic[]
  mappingRules: BusinessMappingRule[]
  chargeback: ChargebackResponse | null
  coverage: AllocationCoverageResponse | null
  trend: CostTrendResponse | null
  loading: boolean
  error: string | null
}

const initialRecommendationState: PaginatedResponse<RecommendationResponse> = {
  items: [],
  total: 0,
  limit: 5,
  offset: 0,
}

const initialState: CostsPageState = {
  costs: null,
  recommendations: initialRecommendationState,
  rollups: null,
  importedSummary: null,
  health: null,
  diagnostics: [],
  mappingRules: [],
  chargeback: null,
  coverage: null,
  trend: null,
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

function formatPreciseCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function CostsPage() {
  const [state, setState] = useState<CostsPageState>(initialState)

  async function loadRecommendations(offset: number, limit: number) {
    try {
      const recommendations = await fetchRecommendationsStrict({ offset, limit })
      setState((current) => ({
        ...current,
        recommendations,
      }))
    } catch (error) {
      setState((current) => ({
        ...current,
        recommendations: {
          ...current.recommendations,
          offset,
          limit,
        },
        error:
          error instanceof Error
            ? error.message
            : 'Unable to load recommendations.',
      }))
    }
  }

  useEffect(() => {
    async function loadCostsPage() {
      const [
        costs,
        recommendations,
        rollups,
        importedSummary,
        health,
        diagnostics,
      ] = await Promise.allSettled([
        fetchCostsStrict(),
        fetchRecommendationsStrict({ limit: initialRecommendationState.limit, offset: 0 }),
        fetchProviderAccountRollups(),
        fetchImportedCostSummary(),
        fetchApiHealth(),
        fetchProviderDiagnostics(),
      ])

      const [mappingRulesResult, chargebackResult, coverageResult, trendResult] = await Promise.allSettled([
        fetchMappingRules(undefined, false),
        fetchChargeback('team'),
        fetchAllocationCoverage(),
        fetchCostTrend('monthly', 6),
      ])

      setState({
        costs: costs.status === 'fulfilled' ? costs.value : null,
        recommendations: recommendations.status === 'fulfilled' ? recommendations.value : initialRecommendationState,
        rollups: rollups.status === 'fulfilled' ? rollups.value : null,
        importedSummary: importedSummary.status === 'fulfilled' ? importedSummary.value : null,
        health: health.status === 'fulfilled' ? health.value : null,
        diagnostics: diagnostics.status === 'fulfilled' ? diagnostics.value : [],
        mappingRules: mappingRulesResult.status === 'fulfilled' ? mappingRulesResult.value.rules : [],
        chargeback: chargebackResult.status === 'fulfilled' ? chargebackResult.value : null,
        coverage: coverageResult.status === 'fulfilled' ? coverageResult.value : null,
        trend: trendResult.status === 'fulfilled' ? trendResult.value : null,
        loading: false,
        error:
          costs.status === 'rejected'
            ? costs.reason instanceof Error
              ? costs.reason.message
              : 'Unable to load cloud cost data.'
            : null,
      })
    }

    void loadCostsPage()
  }, [])

  if (state.loading) {
    return <div className="flex items-center justify-center h-64">Loading costs breakdown...</div>
  }

  const dataSourceStatus = buildCostDataSourceStatus({
    health: state.health,
    importedSummary: state.importedSummary,
    diagnostics: state.diagnostics,
    primaryLoaded: Boolean(state.costs),
    pageName: 'Billing & Allocation',
  })

  const breakdownRows = Object.entries(state.costs?.breakdown || {}).sort(
    (left, right) => right[1].cost - left[1].cost,
  )
  const totalCost = state.costs?.totalCost || 0
  const potentialSavings = state.costs?.potentialSavings || 0
  const topProvider = breakdownRows[0]
  const regionRows = (state.costs?.regionBreakdown || []).slice(0, 8)
  const rollupRows = [...(state.rollups?.items || [])]
    .filter((item) => item.account_type !== 'provider')
    .sort((left, right) => right.rolled_up_cost_usd - left.rolled_up_cost_usd)
    .slice(0, 8)
  const chartData = breakdownRows.map(([provider, value]) => ({
    provider: provider.toUpperCase(),
    cost: value.cost,
    percentage: value.percentage,
  }))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
          Billing & Allocation
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Real provider spend, hierarchy rollups, and exportable finance views from the backend.
        </p>
      </div>

      {state.error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {state.error}
        </div>
      )}

      <DataSourceBanner status={dataSourceStatus} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Total Monthly Spend</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">{formatCurrency(totalCost)}</p>
          <p className="text-sm mt-2 text-slate-600 dark:text-slate-400">
            {breakdownRows.length > 0 ? `${breakdownRows.length} provider buckets` : 'No provider cost buckets yet'}
          </p>
        </div>

        <div className="card">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Potential Savings</p>
          <p className="text-3xl font-bold text-emerald-600">{formatCurrency(potentialSavings)}</p>
          <p className="text-sm mt-2 text-slate-600 dark:text-slate-400">
            {totalCost > 0 ? `${((potentialSavings / totalCost) * 100).toFixed(1)}% of current spend` : 'Savings estimate pending'}
          </p>
        </div>

        <div className="card">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Top Provider</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">
            {topProvider ? topProvider[0].toUpperCase() : 'None'}
          </p>
          <p className="text-sm mt-2 text-slate-600 dark:text-slate-400">
            {topProvider ? formatCurrency(topProvider[1].cost) : 'Connect a provider or import CSV'}
          </p>
        </div>

        <div className="card">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Rollup Nodes</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">
            {state.rollups?.items.length || 0}
          </p>
          <p className="text-sm mt-2 text-slate-600 dark:text-slate-400">
            Hierarchy nodes available for account-level drill-down
          </p>
        </div>
      </div>

      <Expander
        title="Provider Charts"
        description="Open for spend comparison bars and provider distribution charts."
        icon={<Cloud className="w-5 h-5 text-blue-600" />}
        defaultOpen
      >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="card">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Cloud className="w-5 h-5 text-blue-600" />
            Provider Spend Comparison
          </h2>
          {chartData.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No provider spend is available yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="provider" />
                <YAxis tickFormatter={(value: number) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => formatPreciseCurrency(Number(value ?? 0))} />
                <Bar dataKey="cost" radius={[8, 8, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={entry.provider} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            Provider Distribution
          </h2>
          {chartData.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Provider distribution will appear once spend data is available.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="cost"
                  nameKey="provider"
                  cx="50%"
                  cy="50%"
                  outerRadius={96}
                  label={({ name, percent }) => `${String(name || '')} ${((percent || 0) * 100).toFixed(0)}%`}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={entry.provider} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatPreciseCurrency(Number(value ?? 0))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      </Expander>

      <Expander
        title="Account And Region Detail"
        description="Open for account rollups and regional cost rows."
        icon={<Layers3 className="w-5 h-5 text-indigo-600" />}
      >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="card">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Layers3 className="w-5 h-5 text-indigo-600" />
            Top Account Rollups
          </h2>
          {rollupRows.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Rollup nodes will appear after CSV imports or completed scans populate account hierarchy snapshots.
            </p>
          ) : (
            <div className="space-y-3">
              {rollupRows.map((item) => (
                <div key={`${item.provider}-${item.account_identifier}`} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm uppercase text-slate-500 dark:text-slate-400">{item.provider}</div>
                      <div className="font-semibold text-slate-900 dark:text-white">{item.account_name}</div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        {item.account_type} · {item.child_count} child node(s) · {item.rolled_up_service_count} service signal(s)
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {formatPreciseCurrency(item.rolled_up_cost_usd)}
                      </div>
                      <div className="text-sm text-emerald-600 dark:text-emerald-400">
                        Savings {formatPreciseCurrency(item.rolled_up_savings_identified_usd)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Map className="w-5 h-5 text-amber-600" />
            Region Breakdown
          </h2>
          {regionRows.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Region data will appear when imported CSVs or provider APIs include regional breakdowns.
            </p>
          ) : (
            <div className="space-y-3">
              {regionRows.map((row, index) => (
                <div key={`${row.region}-${index}`} className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-medium text-slate-900 dark:text-white">{row.region}</div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {formatPreciseCurrency(row.cost_usd)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </Expander>

      <Expander
        title="Top Recommendations"
        description="Open for the paginated optimization queue."
        icon={<Zap className="w-5 h-5 text-emerald-600" />}
        defaultOpen={state.recommendations.items.length > 0}
      >
      <div className="card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Top Recommendations
          </h2>
          {state.recommendations.total > state.recommendations.limit && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <button
                disabled={state.recommendations.offset === 0}
                onClick={() =>
                  void loadRecommendations(
                    Math.max(0, state.recommendations.offset - state.recommendations.limit),
                    state.recommendations.limit,
                  )
                }
                className="px-3 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-50"
              >
                Previous
              </button>
              <span>
                Showing {state.recommendations.offset + 1}-
                {Math.min(
                  state.recommendations.offset + state.recommendations.limit,
                  state.recommendations.total,
                )}{' '}
                of {state.recommendations.total}
              </span>
              <button
                disabled={state.recommendations.offset + state.recommendations.limit >= state.recommendations.total}
                onClick={() =>
                  void loadRecommendations(
                    state.recommendations.offset + state.recommendations.limit,
                    state.recommendations.limit,
                  )
                }
                className="px-3 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {state.recommendations.items.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No optimization recommendations are available yet.
            </p>
          ) : (
            state.recommendations.items.map((recommendation) => (
              <div
                key={recommendation.id}
                className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-700">
                        {recommendation.service}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs uppercase dark:bg-slate-700">
                        {recommendation.cloud}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs capitalize dark:bg-slate-700">
                        {recommendation.difficulty}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {recommendation.title}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      {recommendation.description}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-emerald-600">
                      {formatCurrency(recommendation.savings)}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      ROI {recommendation.roi}%
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </Expander>

      <Expander
        title="Trend And Exports"
        description="Open for the monthly trend chart and finance export actions."
        icon={<Download className="w-5 h-5 text-blue-600" />}
      >
      <div className="flex flex-wrap gap-4">
        {/* Trend chart */}
        {state.trend && state.trend.points.length > 0 && (
          <div className="w-full bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-500" />
                Cost Trend — Last {state.trend.lookback_periods} Months
              </h2>
              <span className="text-xs text-slate-400">
                Source: {state.trend.data_source}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={state.trend.points.map(p => ({
                month: p.period_start.slice(0, 7),
                provider: p.provider,
                total: p.total_cost_usd,
                mapped: p.mapped_cost_usd,
                unmapped: p.unmapped_cost_usd,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => v != null ? `$${Number(v).toLocaleString()}` : ''} />
                <Legend />
                <Area type="monotone" dataKey="total" name="Total" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} />
                <Area type="monotone" dataKey="mapped" name="Allocated" stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <button
          type="button"
          onClick={() => void downloadExecutiveSummaryCsv()}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
        >
          <Download className="w-5 h-5" />
          Export Executive CSV
        </button>
        <button
          type="button"
          onClick={() => void downloadExecutiveSummaryExcel()}
          className="flex items-center gap-2 px-6 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded-lg font-medium transition"
        >
          <Download className="w-5 h-5" />
          Export Executive Excel
        </button>
        <button
          type="button"
          onClick={() => void downloadChargebackXlsx()}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition"
        >
          <Download className="w-5 h-5" />
          Full Report (XLSX)
        </button>
        <a
          href="/dashboard/ai-insights"
          className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition"
        >
          <Zap className="w-5 h-5" />
          Open AI Insights
        </a>
      </div>
      </Expander>

      {/* ── Business Mapping & Allocation Coverage ───────────────────── */}
      <Expander
        title="Business Mapping And Chargeback"
        description="Open for allocation coverage, chargeback by team, and mapping rule tables."
        icon={<Tag className="w-5 h-5 text-violet-500" />}
      >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Tag className="w-6 h-6 text-violet-500" />
              Business Mapping &amp; Chargeback
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Normalize costs to business dimensions (team, environment, application, cost center) via tag-based rules.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void applyMappingRules().then(() => window.location.reload())
            }}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition"
          >
            <Plus className="w-4 h-4" />
            Re-apply Rules
          </button>
        </div>

        {/* Allocation Coverage Summary */}
        {state.coverage && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Overall Coverage</p>
              <p className="text-2xl font-bold text-violet-600">{state.coverage.coverage_percent.toFixed(1)}%</p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                ${state.coverage.mapped_cost_usd.toLocaleString()} mapped of ${state.coverage.total_cost_usd.toLocaleString()}
              </p>
            </div>
            {Object.entries(state.coverage.dimension_coverage).map(([dim, pct]) => (
              <div key={dim} className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                  {DIMENSION_LABELS[dim] ?? dim}
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{pct.toFixed(1)}%</p>
                <div className="mt-2 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className="h-1.5 rounded-full bg-violet-500"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chargeback by Team */}
        {state.chargeback && state.chargeback.groups.length > 0 ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-violet-500" />
                Chargeback by Team
              </h3>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {state.chargeback.coverage_percent.toFixed(1)}% of spend mapped
              </span>
            </div>
            <div className="grid md:grid-cols-2 gap-0">
              <div className="p-4">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={state.chargeback.groups.slice(0, 8)}
                      dataKey="total_cost_usd"
                      nameKey="value"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }: { name?: string; percent?: number }) =>
                        `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                    >
                      {state.chargeback.groups.slice(0, 8).map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val) =>
                        typeof val === 'number'
                          ? val.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
                          : String(val)
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-auto p-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left pb-2 text-slate-500">Team</th>
                      <th className="text-right pb-2 text-slate-500">Cost</th>
                      <th className="text-right pb-2 text-slate-500">Records</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.chargeback.groups.map((g) => (
                      <tr key={g.value} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-2 font-medium text-slate-900 dark:text-white">{g.value}</td>
                        <td className="py-2 text-right text-slate-700 dark:text-slate-300">
                          {g.total_cost_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-2 text-right text-slate-500">{g.record_count}</td>
                      </tr>
                    ))}
                    {state.chargeback.total_unmapped_cost_usd > 0 && (
                      <tr className="border-b border-slate-100 dark:border-slate-800 opacity-60">
                        <td className="py-2 italic text-slate-500">Unmapped</td>
                        <td className="py-2 text-right text-slate-500">
                          {state.chargeback.total_unmapped_cost_usd.toLocaleString('en-US', {
                            style: 'currency',
                            currency: 'USD',
                            maximumFractionDigits: 0,
                          })}
                        </td>
                        <td className="py-2 text-right text-slate-400">—</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-sm text-slate-600 dark:text-slate-400">
            No chargeback data yet. Create mapping rules and upload a CSV with tag columns (e.g. <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">team</code>, <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">environment</code>) to populate chargeback views.
          </div>
        )}

        {/* Mapping Rules Table */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Map className="w-4 h-4" />
              Mapping Rules ({state.mappingRules.length})
            </h3>
            <a
              href="/dashboard/settings"
              className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Manage in Settings
            </a>
          </div>
          {state.mappingRules.length === 0 ? (
            <div className="p-6 text-sm text-slate-600 dark:text-slate-400">
              No mapping rules defined yet. Use the API or settings page to create rules that map tags to business dimensions.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="text-left px-4 py-2 text-slate-500">Tag Key</th>
                    <th className="text-left px-4 py-2 text-slate-500">Tag Value</th>
                    <th className="text-left px-4 py-2 text-slate-500">Dimension</th>
                    <th className="text-left px-4 py-2 text-slate-500">Mapped Value</th>
                    <th className="text-right px-4 py-2 text-slate-500">Priority</th>
                    <th className="text-center px-4 py-2 text-slate-500">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {state.mappingRules.map((rule) => (
                    <tr key={rule.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2 font-mono text-xs text-slate-800 dark:text-slate-200">{rule.tag_key}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">{rule.tag_value}</td>
                      <td className="px-4 py-2">
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                          {DIMENSION_LABELS[rule.dimension] ?? rule.dimension}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-800 dark:text-slate-200">{rule.mapped_value}</td>
                      <td className="px-4 py-2 text-right text-slate-500">{rule.priority}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-block w-2 h-2 rounded-full ${rule.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      </Expander>
    </div>
  )
}
