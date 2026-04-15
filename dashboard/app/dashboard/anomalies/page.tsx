'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, TrendingUp } from 'lucide-react'
import { fetchAnomalies } from '@/lib/api'
import { AnomalyResponse } from '@/lib/types'

interface PageState {
  items: AnomalyResponse[]
  total: number
  limit: number
  offset: number
  loading: boolean
}

export default function AnomaliesPage() {
  const [state, setState] = useState<PageState>({
    items: [],
    total: 0,
    limit: 10,
    offset: 0,
    loading: true,
  })

  async function loadPage(offset: number, limit: number) {
    setState((prev) => ({ ...prev, loading: true }))
    try {
      const res = await fetchAnomalies({ offset, limit })
      setState({ ...res, loading: false })
    } catch (error) {
      console.warn('Failed to load anomalies', error)
      setState((prev) => ({ ...prev, loading: false }))
    }
  }

  useEffect(() => {
    void loadPage(0, state.limit)
    // limit is user-controlled page size; load when it changes
  }, [state.limit])

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
