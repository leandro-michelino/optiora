'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Lightbulb,
  TrendingDown,
  Zap,
} from 'lucide-react'
import { fetchFinOpsAnalytics, fetchRecommendations } from '@/lib/api'
import { FinOpsAnalyticsResponse, RecommendationResponse } from '@/lib/types'

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

export default function AIInsightsPage() {
  const [analytics, setAnalytics] = useState<FinOpsAnalyticsResponse | null>(null)
  const [recommendations, setRecommendations] = useState<RecommendationResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedInsight, setSelectedInsight] = useState<RecommendationResponse | null>(null)

  useEffect(() => {
    async function loadInsights() {
      try {
        const [analyticsResult, recommendationsResult] = await Promise.all([
          fetchFinOpsAnalytics(),
          fetchRecommendations(),
        ])
        setAnalytics(analyticsResult)
        setRecommendations(recommendationsResult.items)
      } catch (insightError) {
        setError(
          insightError instanceof Error
            ? insightError.message
            : 'Unable to load AI insight inputs.',
        )
      } finally {
        setLoading(false)
      }
    }

    void loadInsights()
  }, [])

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="animate-pulse">
          <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
        </div>
      </div>
    )
  }

  if (error || !analytics) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        {error || 'Analytics are unavailable.'}
      </div>
    )
  }

  const topFindings = [...analytics.provider_findings]
    .sort((a, b) => b.estimated_waste_usd - a.estimated_waste_usd)
    .slice(0, 3)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
          <Brain className="w-10 h-10 text-purple-600" />
          AI Cost Intelligence
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Deterministic FinOps analytics with OCI GenAI in London South available for explanation, prioritization, and planning.
        </p>
      </div>

      <div className="p-6 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg text-white shadow-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <TrendingDown className="w-8 h-8 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-1">Identified Monthly Savings</h3>
              <p className="text-green-50 mb-3">Based on provider mix, waste rate, commitment coverage, and active recommendations.</p>
              <div className="text-3xl font-bold">{formatCurrency(analytics.identified_monthly_savings_usd)}</div>
            </div>
          </div>
          <Link
            href="/dashboard/cost-advisor"
            className="px-6 py-3 bg-white text-green-700 rounded-lg font-semibold hover:bg-green-50 transition whitespace-nowrap"
          >
            Ask Advisor
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-slate-600 dark:text-slate-400">Risk Score</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{analytics.risk_score}/100</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-600 dark:text-slate-400">Maturity Score</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{analytics.maturity_score}/100</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-600 dark:text-slate-400">Waste Rate</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {analytics.unit_metrics.estimated_waste_rate_percent}%
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-600 dark:text-slate-400">Commitment Coverage</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {analytics.commitment_coverage_percent}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="card bg-white dark:bg-slate-800">
            <h2 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-white flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-red-500" />
              Provider Waste Hotspots
            </h2>
            <div className="space-y-3">
              {topFindings.map((finding) => (
                <div
                  key={finding.provider}
                  className="p-4 rounded-lg border-l-4 border-rose-500 bg-slate-50 dark:bg-slate-700/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-900 dark:text-white uppercase">
                        {finding.provider}
                      </h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        Estimated waste {formatCurrency(finding.estimated_waste_usd)}/month,
                        commitment coverage {finding.commitment_coverage_percent}%.
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-rose-600 text-white whitespace-nowrap">
                      {finding.volatility_score}% volatility
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card bg-white dark:bg-slate-800">
            <h2 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-white flex items-center gap-2">
              <Lightbulb className="w-6 h-6 text-yellow-500" />
              Prioritized Recommendations
            </h2>
            <div className="space-y-3">
              {recommendations.slice(0, 6).map((recommendation) => (
                <button
                  key={recommendation.id}
                  className="w-full p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-500 cursor-pointer transition group text-left"
                  onClick={() => setSelectedInsight(recommendation)}
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h4 className="font-semibold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400">
                      {recommendation.title}
                    </h4>
                    <span className="px-2 py-1 rounded text-xs font-medium text-white whitespace-nowrap bg-purple-600">
                      {recommendation.difficulty.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{recommendation.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(recommendation.savings)}/month
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Analysis Summary</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Monthly Spend</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {formatCurrency(analytics.current_monthly_spend_usd)}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Estimated Waste</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {formatCurrency(analytics.estimated_monthly_waste_usd)}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Recommendations</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{recommendations.length}</p>
              </div>
            </div>
          </div>

          <div className="card bg-white dark:bg-slate-800 border-l-4 border-purple-500">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-500" />
              GenAI Role
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              OptiOra keeps savings math deterministic. The GenAI advisor turns the findings into explanations, rollout plans, and executive summaries.
            </p>
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              {analytics.actions.map((action) => (
                <div key={action} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />
                  <span>{action}</span>
                </div>
              ))}
            </div>
          </div>

          <Link
            href="/dashboard/cost-advisor"
            className="block w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg transition text-center"
          >
            Generate Narrative Plan
          </Link>
        </div>
      </div>

      {selectedInsight && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-2xl w-full p-8">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              {selectedInsight.title}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">{selectedInsight.description}</p>
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Monthly Savings</p>
                <p className="text-3xl font-bold text-green-600">{formatCurrency(selectedInsight.savings)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">ROI</p>
                <p className="text-3xl font-bold text-purple-600">
                  {Number.isFinite(selectedInsight.roi) ? `${selectedInsight.roi.toFixed(0)}%` : 'Immediate'}
                </p>
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg mb-6">
              <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Recommended Action</h4>
              <ol className="list-decimal list-inside space-y-2 text-slate-700 dark:text-slate-300">
                <li>Validate affected resources and ownership.</li>
                <li>Confirm production risk and maintenance window.</li>
                <li>Apply the optimization in the lowest-risk environment first.</li>
                <li>Measure savings and rollback signals for one billing cycle.</li>
              </ol>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedInsight(null)}
                className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              >
                Close
              </button>
              <Link
                href="/dashboard/cost-advisor"
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition text-center"
              >
                Ask Advisor
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
