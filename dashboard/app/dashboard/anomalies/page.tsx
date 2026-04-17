'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, TrendingUp } from 'lucide-react'
import {
  fetchAnomaliesStrict,
  fetchApiHealth,
  fetchProviderDiagnostics,
} from '@/lib/api'
import { DataSourceBanner } from '@/components/DataSourceBanner'
import { buildLiveDataSourceStatus } from '@/lib/data-source'
import { AnomalyResponse, ApiHealth, ProviderDiagnostic } from '@/lib/types'

interface PageState {
  items: AnomalyResponse[]
  total: number
  limit: number
  offset: number
  health: ApiHealth | null
  diagnostics: ProviderDiagnostic[]
  loaded: boolean
  loading: boolean
  error: string | null
}

export default function AnomaliesPage() {
  const [state, setState] = useState<PageState>({
    items: [],
    total: 0,
    limit: 10,
    offset: 0,
    health: null,
    diagnostics: [],
    loaded: false,
    loading: true,
    error: null,
  })

  async function loadPage(offset: number, limit: number) {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const res = await fetchAnomaliesStrict({ offset, limit })
      setState((prev) => ({
        ...prev,
        ...res,
        loaded: true,
        loading: false,
        error: null,
      }))
    } catch (error) {
      setState((prev) => ({
        ...prev,
        offset,
        limit,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load anomalies.',
      }))
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitialPage() {
      const [anomaliesResult, healthResult, diagnosticsResult] = await Promise.allSettled([
        fetchAnomaliesStrict({ offset: 0, limit: state.limit }),
        fetchApiHealth(),
        fetchProviderDiagnostics(),
      ])

      if (!cancelled) {
        const nextState: PageState = {
          items: anomaliesResult.status === 'fulfilled' ? anomaliesResult.value.items : [],
          total: anomaliesResult.status === 'fulfilled' ? anomaliesResult.value.total : 0,
          limit: anomaliesResult.status === 'fulfilled' ? anomaliesResult.value.limit : state.limit,
          offset: anomaliesResult.status === 'fulfilled' ? anomaliesResult.value.offset : 0,
          health: healthResult.status === 'fulfilled' ? healthResult.value : null,
          diagnostics: diagnosticsResult.status === 'fulfilled' ? diagnosticsResult.value : [],
          loaded: anomaliesResult.status === 'fulfilled',
          loading: false,
          error:
            anomaliesResult.status === 'rejected'
              ? anomaliesResult.reason instanceof Error
                ? anomaliesResult.reason.message
                : 'Failed to load anomalies.'
              : null,
        }
        setState(nextState)
      }
    }

    void loadInitialPage()
    return () => {
      cancelled = true
    }
  }, [state.limit])

  const dataSourceStatus = buildLiveDataSourceStatus({
    health: state.health,
    diagnostics: state.diagnostics,
    primaryLoaded: state.loaded,
    pageName: 'Anomalies',
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 text-4xl font-bold text-slate-900 dark:text-white">
          Cost Anomalies
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Detected unusual cost patterns and sudden spend spikes across your connected providers.
        </p>
      </div>

      <DataSourceBanner status={dataSourceStatus} />

      {state.error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {state.error}
        </div>
      )}

      {state.loading ? (
        <div className="text-slate-600 dark:text-slate-400">Loading anomalies...</div>
      ) : state.items.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="text-slate-600 dark:text-slate-400">
            No anomalies detected. Recent cost movement looks stable.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {state.items.map((anomaly) => (
            <div
              key={anomaly.id}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-4">
                  <AlertTriangle className="mt-1 h-6 w-6 flex-shrink-0 text-amber-500" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                        {anomaly.service}
                      </h3>
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                        {anomaly.cloud}
                      </span>
                      <span className="rounded bg-amber-50 px-2 py-1 text-xs font-medium uppercase text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                        {anomaly.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {anomaly.message}
                    </p>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
                      {new Date(anomaly.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-right text-red-600 dark:text-red-400">
                  <TrendingUp className="h-5 w-5" />
                  <span className="text-2xl font-bold">+{anomaly.change}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!state.loading && state.total > state.limit && (
        <div className="flex items-center gap-3">
          <button
            disabled={state.offset === 0}
            onClick={() => void loadPage(Math.max(0, state.offset - state.limit), state.limit)}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50 dark:border-slate-700"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Showing {state.offset + 1}-{Math.min(state.offset + state.limit, state.total)} of {state.total}
          </span>
          <button
            disabled={state.offset + state.limit >= state.total}
            onClick={() => void loadPage(state.offset + state.limit, state.limit)}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50 dark:border-slate-700"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
