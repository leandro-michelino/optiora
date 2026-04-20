'use client'

import { useEffect, useState } from 'react'
import { Bot, RefreshCw, ShieldCheck, Tags, Users } from 'lucide-react'
import {
  fetchDecisionGradeRecommendations,
  fetchFederatedCosts,
  fetchTagQualityScore,
  runAutoRemediationLoop,
} from '@/lib/api'
import {
  DecisionRecommendationResponse,
  FederationCostResponse,
  RemediationLoopResponse,
  TagQualityScoreResponse,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function fmt(n: number) {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function AdvancedFinOpsPage() {
  const [loading, setLoading] = useState(true)
  const [runningLoop, setRunningLoop] = useState(false)
  const [tagQuality, setTagQuality] = useState<TagQualityScoreResponse | null>(null)
  const [decision, setDecision] = useState<DecisionRecommendationResponse | null>(null)
  const [federation, setFederation] = useState<FederationCostResponse | null>(null)
  const [loopResult, setLoopResult] = useState<RemediationLoopResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    const [tagRes, decRes, fedRes] = await Promise.allSettled([
      fetchTagQualityScore('all'),
      fetchDecisionGradeRecommendations({ top_n: 8, provider: 'all', min_monthly_savings: 10 }),
      fetchFederatedCosts({ provider: 'all', include_regions: true }),
    ])

    if (tagRes.status === 'fulfilled') setTagQuality(tagRes.value)
    if (decRes.status === 'fulfilled') setDecision(decRes.value)
    if (fedRes.status === 'fulfilled') setFederation(fedRes.value)

    if (tagRes.status === 'rejected' && decRes.status === 'rejected' && fedRes.status === 'rejected') {
      setError('Failed to load advanced FinOps data.')
    }
    setLoading(false)
  }

  async function runDryRunLoop() {
    setRunningLoop(true)
    try {
      const result = await runAutoRemediationLoop({
        dry_run: true,
        max_actions_per_run: 15,
        max_total_impact_usd: 1500,
        require_approval_above_usd: 250,
      })
      setLoopResult(result)
    } finally {
      setRunningLoop(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-md">Advanced FinOps</Badge>
            <Badge variant="outline" className="rounded-md border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30">
              Competitive Features
            </Badge>
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Advanced FinOps Console</h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-3xl">
            Unified view of tag completeness scoring, decision-grade optimization ranking, multi-account federation, and safe remediation loops.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} className="rounded-lg">
          <RefreshCw className="mr-2 h-4 w-4" />Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-slate-200 p-8 text-center text-slate-500 dark:border-slate-700">
          Loading advanced FinOps analytics...
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Tag Quality</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{tagQuality?.quality_grade || '—'}</p>
                <p className="text-sm text-slate-500">{tagQuality?.completeness_score.toFixed(1) || '0.0'}% completeness</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Decision Candidates</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{decision?.total_candidates || 0}</p>
                <p className="text-sm text-slate-500">Model: {decision?.model || 'n/a'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Federated Accounts</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{federation?.total_accounts || 0}</p>
                <p className="text-sm text-slate-500">{fmt(federation?.total_cost_usd || 0)} total</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Dry-run Planned Impact</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{fmt(loopResult?.total_planned_impact_usd || 0)}</p>
                <p className="text-sm text-slate-500">{loopResult?.planned_count || 0} planned actions</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="flex items-center gap-2"><Tags className="h-5 w-5" />Tag Quality Dimensions</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {(tagQuality?.dimensions || []).map((d) => (
                    <div key={d.dimension} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-medium capitalize text-slate-900 dark:text-white">{d.dimension.replace('_', ' ')}</span>
                        <span className="text-slate-600 dark:text-slate-400">{d.completeness_percent.toFixed(1)}%</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        Covered: {fmt(d.covered_cost_usd)} · Uncovered: {fmt(d.uncovered_cost_usd)} · Missing records: {d.missing_records}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" />Decision-Grade Recommendations</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {(decision?.top_recommendations || []).map((row) => (
                  <div key={row.recommendation_id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="mb-1 flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{row.title}</p>
                      <Badge variant="outline" className="rounded-md">{row.decision_score.toFixed(1)}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {row.category} · {fmt(row.estimated_monthly_savings_usd)}/mo · confidence {row.confidence_score.toFixed(1)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Multi-Account Federation</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  {(federation?.accounts || []).slice(0, 12).map((row) => (
                    <div key={`${row.provider}-${row.account_identifier}`} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{row.account_name}</p>
                        <p className="font-mono text-xs text-slate-500">{row.provider}:{row.account_identifier}</p>
                      </div>
                      <p className="font-semibold text-slate-900 dark:text-white">{fmt(row.direct_cost_usd)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Safe Auto-Remediation Loop</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <Button className="w-full rounded-lg" onClick={() => void runDryRunLoop()} disabled={runningLoop}>
                  {runningLoop ? 'Running dry-run...' : 'Run Guardrailed Dry-run'}
                </Button>
                {loopResult ? (
                  <div className="space-y-2 text-sm">
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      Planned: {loopResult.planned_count} · Requires approval: {loopResult.requires_approval_count} · Skipped: {loopResult.skipped_count}
                    </div>
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {loopResult.decisions.map((d) => (
                        <div key={d.action_id} className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700">
                          <p className="font-medium text-slate-800 dark:text-slate-200">{d.action_id} · {d.status}</p>
                          <p className="text-slate-500">{d.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Run the dry-run to preview guardrailed remediation decisions.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
