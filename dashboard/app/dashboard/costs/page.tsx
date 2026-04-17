'use client'

import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  TrendingUp,
  Zap,
} from 'lucide-react'
import {
  downloadExecutiveSummaryCsv,
  downloadExecutiveSummaryExcel,
  fetchApiHealth,
  fetchCostsStrict,
  fetchImportedCostSummary,
  fetchProviderAccountRollups,
  fetchProviderDiagnostics,
  fetchRecommendationsStrict,
} from '@/lib/api'
import { buildCostDataSourceStatus } from '@/lib/data-source'
import { DataSourceBanner } from '@/components/DataSourceBanner'
import {
  ApiHealth,
  CostResponse,
  ImportedCostSummaryResponse,
  PaginatedResponse,
  ProviderAccountRollupResponse,
  ProviderDiagnostic,
  RecommendationResponse,
} from '@/lib/types'

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6']

interface CostsPageState {
  costs: CostResponse | null
  recommendations: PaginatedResponse<RecommendationResponse>
  rollups: ProviderAccountRollupResponse | null
  importedSummary: ImportedCostSummaryResponse | null
  health: ApiHealth | null
  diagnostics: ProviderDiagnostic[]
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

      setState({
        costs: costs.status === 'fulfilled' ? costs.value : null,
        recommendations: recommendations.status === 'fulfilled' ? recommendations.value : initialRecommendationState,
        rollups: rollups.status === 'fulfilled' ? rollups.value : null,
        importedSummary: importedSummary.status === 'fulfilled' ? importedSummary.value : null,
        health: health.status === 'fulfilled' ? health.value : null,
        diagnostics: diagnostics.status === 'fulfilled' ? diagnostics.value : [],
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
    pageName: 'Cloud Costs',
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
          Cost Breakdown & Analysis
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

      <div className="flex flex-wrap gap-4">
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
        <a
          href="/dashboard/ai-insights"
          className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition"
        >
          <Zap className="w-5 h-5" />
          Open AI Insights
        </a>
      </div>
    </div>
  )
}
