euse client'

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
  const [state, setState] = useState<PageState>({ items: [], total: 0, limit: 10, offset: 0, loading: true })

  const loadPage = async (offset: number, limit: number) => {
    setState(prev => ({ ...prev, loading: true }))
    try {
      const res = await fetchAnomalies({ offset, limit })
      setState({ ...res, loading: false })
    } catch (e) {
      console.warn('Failed to load anomalies', e)
      setState(prev => ({ ...prev, loading: false }))
    }
  }

  useEffect(() => {
    void loadPage(0, state.limit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.limit])

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      case 'medium':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
      case 'low':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
      default:
        return 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600'
    }
  }

  const getSeverityTextColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'text-red-900 dark:text-red-100'
      case 'medium':
        return 'text-yellow-900 dark:text-yellow-100'
      case 'low':
        return 'text-blue-900 dark:text-blue-100'
      default:
        return ''
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
          Cost Anomalies
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Detected unusual cost patterns and sudden spikes
        </p>
      </div>

      {state.loading && (
        <div className="text-slate-600 dark:text-slate-400">Loading anomalies...</div>
      )}

      {!state.loading && (
        <div className="space-y-4">
          {state.items.map((anomaly) => (
          <div
            key={anomaly.id}
            className={`card border-l-4 ${getSeverityColor(anomaly.severity)} ${getSeverityTextColor(
              anomaly.severity
            )}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex gap-4">
                <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-1" />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{anomaly.service}</h3>
                    <span className="text-sm px-2 py-1 bg-slate-200 dark:bg-slate-600 rounded">
                      {anomaly.cloud}
                    </span>
                  </div>
                  <p className="text-sm mt-1">{anomaly.message}</p>
                  <p className="text-xs mt-2 opacity-75">{anomaly.timestamp}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-4">
                <div className="flex items-center gap-2 justify-end">
                  <TrendingUp className="w-5 h-5" />
                  <span className="text-2xl font-bold">+{anomaly.change}%</span>
                </div>
              </div>
            </div>
          </div>
          ))}
        </div>
      )}

      {!state.loading && state.items.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-slate-600 dark:text-slate-400">
            No anomalies detected - your costs are stable
          </p>
        </div>
      )}

      {!state.loading && state.total > state.limit && (
        <div className="flex items-center gap-3">
          <button
            disabled={state.offset === 0}
            onClick={() => loadPage(Math.max(0, state.offset - state.limit), state.limit)}
            className="px-3 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Showing {state.offset + 1}-{Math.min(state.offset + state.limit, state.total)} of {state.total}
          </span>
          <button
            disabled={state.offset + state.limit >= state.total}
            onClick={() => loadPage(state.offset + state.limit, state.limit)}
            className="px-3 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
