'use client'

import { useEffect, useState } from 'react'
import { DollarSign, Lightbulb, TrendingDown } from 'lucide-react'
import {
  fetchApiHealth,
  fetchImportedCostSummary,
  fetchProviderDiagnostics,
  fetchRecommendationsStrict,
  fetchRightsizingRecommendations,
} from '@/lib/api'
import { DataSourceBanner } from '@/components/DataSourceBanner'
import { buildCostDataSourceStatus } from '@/lib/data-source'
import {
  ApiHealth,
  ImportedCostSummaryResponse,
  ProviderDiagnostic,
  RecommendationResponse,
  RightsizingRecommendation,
} from '@/lib/types'

interface RecommendationState {
  items: RecommendationResponse[]
  total: number
  limit: number
  offset: number
  health: ApiHealth | null
  importedSummary: ImportedCostSummaryResponse | null
  diagnostics: ProviderDiagnostic[]
  rightsizingTop: RightsizingRecommendation[]
  loaded: boolean
  error: string | null
}

function difficultyTone(difficulty: string): string {
  switch (difficulty) {
    case 'easy':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200'
    case 'hard':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
  }
}

export default function RecommendationsPage() {
  const [state, setState] = useState<RecommendationState>({
    items: [],
    total: 0,
    limit: 12,
    offset: 0,
    health: null,
    importedSummary: null,
    diagnostics: [],
    rightsizingTop: [],
    loaded: false,
    error: null,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadRecommendations() {
      setLoading(true)
      const [response, importedResult, healthResult, diagnosticsResult, rightsizingResult] = await Promise.allSettled([
        fetchRecommendationsStrict({ limit: state.limit, offset: state.offset }),
        fetchImportedCostSummary(),
        fetchApiHealth(),
        fetchProviderDiagnostics(),
        fetchRightsizingRecommendations({ limit: 6, min_savings: 50 }),
      ])

      setState((current) => ({
        ...current,
        items: response.status === 'fulfilled' ? response.value.items : [],
        total: response.status === 'fulfilled' ? response.value.total : 0,
        limit: response.status === 'fulfilled' ? response.value.limit : current.limit,
        offset: response.status === 'fulfilled' ? response.value.offset : current.offset,
        health: healthResult.status === 'fulfilled' ? healthResult.value : null,
        importedSummary: importedResult.status === 'fulfilled' ? importedResult.value : null,
        diagnostics: diagnosticsResult.status === 'fulfilled' ? diagnosticsResult.value : [],
        rightsizingTop:
          rightsizingResult.status === 'fulfilled'
            ? rightsizingResult.value.recommendations || []
            : [],
        loaded: response.status === 'fulfilled',
        error:
          response.status === 'rejected'
            ? response.reason instanceof Error
              ? response.reason.message
              : 'Unable to load recommendations.'
            : null,
      }))
      setLoading(false)
    }

    void loadRecommendations()
  }, [state.limit, state.offset])

  const dataSourceStatus = buildCostDataSourceStatus({
    health: state.health,
    importedSummary: state.importedSummary,
    diagnostics: state.diagnostics,
    primaryLoaded: state.loaded,
    pageName: 'Recommendations',
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 text-4xl font-bold text-slate-900 dark:text-white">
          Optimization Recommendations
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Live recommendations ranked by potential savings, ROI, and delivery difficulty.
        </p>
      </div>

      <DataSourceBanner status={dataSourceStatus} />

      {state.error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {state.error}
        </div>
      )}

      {loading ? (
        <div className="text-slate-600 dark:text-slate-400">Loading recommendations...</div>
      ) : state.items.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="text-slate-600 dark:text-slate-400">
            No recommendations are available yet. Run a scan or connect more providers to improve signal quality.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
            <div className="font-semibold">Resource-level optimization details</div>
            <div className="mt-1">
              This tab shows prioritized recommendation themes. Per-resource actions are listed in
              {' '}
              <a href="/dashboard/rightsizing" className="underline font-medium">Rightsizing</a>
              {' '}
              and
              {' '}
              <a href="/dashboard/inventory" className="underline font-medium">Cloud Resources</a>.
            </div>
          </div>

          {state.rightsizingTop.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Top Resource Candidates</h3>
                <a href="/dashboard/rightsizing" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                  View full rightsizing list
                </a>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      <th className="py-2 pr-3">Resource</th>
                      <th className="py-2 pr-3">Provider</th>
                      <th className="py-2 pr-3">Action</th>
                      <th className="py-2 pr-3">Size Change</th>
                      <th className="py-2 text-right">Savings / mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.rightsizingTop.map((row) => (
                      <tr key={`${row.provider}-${row.resource_id}`} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-2 pr-3">
                          <div className="font-medium text-slate-900 dark:text-white">{row.resource_name}</div>
                          <div className="font-mono text-xs text-slate-500 dark:text-slate-400">{row.resource_id}</div>
                        </td>
                        <td className="py-2 pr-3 uppercase text-slate-700 dark:text-slate-200">{row.provider}</td>
                        <td className="py-2 pr-3 capitalize text-slate-700 dark:text-slate-200">{row.action}</td>
                        <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">
                          <span className="font-mono text-xs">{row.current_size}</span>
                          {' '}→{' '}
                          <span className="font-mono text-xs">{row.recommended_size}</span>
                        </td>
                        <td className="py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          ${row.monthly_savings_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="space-y-4">
          {state.items.map((rec) => (
            <div
              key={rec.id}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex items-start gap-4">
                <Lightbulb className="mt-1 h-6 w-6 flex-shrink-0 text-amber-500" />
                <div className="flex-1">
                  <div className="mb-2 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                        {rec.title}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                          {rec.service}
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-1 text-xs uppercase text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                          {rec.cloud}
                        </span>
                        <span className={`rounded px-2 py-1 text-xs font-medium capitalize ${difficultyTone(rec.difficulty)}`}>
                          {rec.difficulty}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1 text-emerald-600 dark:text-emerald-400">
                        <DollarSign className="h-5 w-5" />
                        <span className="text-2xl font-bold">{rec.savings.toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Monthly potential</p>
                    </div>
                  </div>

                  <p className="mb-3 text-slate-600 dark:text-slate-300">{rec.description}</p>

                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                    <TrendingDown className="h-4 w-4" />
                    <span className="text-sm font-semibold">ROI: {rec.roi}%</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  )
}
