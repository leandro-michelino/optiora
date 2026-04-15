'use client'

import { useEffect, useState } from 'react'
import { DollarSign, Lightbulb, TrendingDown } from 'lucide-react'
import { fetchRecommendations } from '@/lib/api'
import { RecommendationResponse } from '@/lib/types'

interface RecommendationState {
  items: RecommendationResponse[]
  total: number
  limit: number
  offset: number
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
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadRecommendations() {
      setLoading(true)
      try {
        const response = await fetchRecommendations({ limit: state.limit, offset: state.offset })
        setState(response)
      } finally {
        setLoading(false)
      }
    }

    void loadRecommendations()
  }, [state.limit, state.offset])

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

      {loading ? (
        <div className="text-slate-600 dark:text-slate-400">Loading recommendations...</div>
      ) : state.items.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="text-slate-600 dark:text-slate-400">
            No recommendations are available yet. Run a scan or connect more providers to improve signal quality.
          </p>
        </div>
      ) : (
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
      )}
    </div>
  )
}
