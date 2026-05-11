'use client'

import type { FormEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Leaf, RefreshCw, ShieldCheck, Tags, Users, BarChart3, AlertTriangle, DollarSign, Eraser, MessageCircle, Send, Loader } from 'lucide-react'
import {
  fetchDecisionGradeRecommendations,
  fetchFederatedCosts,
  fetchTagQualityScore,
  fetchTaggingCoverage,
  fetchSustainabilityMetrics,
  fetchCrossProviderComparison,
  fetchAnomalyIntelligence,
  fetchChargebackSummary,
  fetchFinOpsOperatingReview,
  fetchDecisionIntelligence,
  fetchFinOpsControlTower,
  forceNextApiRefresh,
} from '@/lib/api'
import {
  DecisionRecommendationResponse,
  FederationCostResponse,
  TagQualityScoreResponse,
  TaggingCoverageResponse,
  SustainabilityResponse,
  CrossProviderComparisonResponse,
  AnomalyIntelligenceResponse,
  ChargebackSummaryResponse,
  FinOpsOperatingReviewResponse,
  DecisionIntelligenceResponse,
  FinOpsControlTowerResponse,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Expander } from '@/components/ui/expander'

function fmt(n: number) {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function statusTone(status: string): string {
  if (status === 'healthy') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
  if (status === 'attention') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300'
  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 45_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`))
    }, timeoutMs)

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timer))
  })
}

type ToastKind = 'success' | 'error' | 'info'

interface ToastMessage {
  id: number
  title: string
  detail: string
  kind: ToastKind
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export default function AdvancedFinOpsPage() {
  const [loading, setLoading] = useState(true)
  const [loadingTagQuality, setLoadingTagQuality] = useState(false)
  const [loadingDecision, setLoadingDecision] = useState(false)
  const [loadingFederation, setLoadingFederation] = useState(false)
  const [tagQualityError, setTagQualityError] = useState<string | null>(null)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [federationError, setFederationError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'advanced-welcome',
      role: 'assistant',
      content:
        'I can explain these control-tower actions using the live Advisor Conversation. Pick an action or ask a FinOps question.',
    },
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const [tagQuality, setTagQuality] = useState<TagQualityScoreResponse | null>(null)
  const [decision, setDecision] = useState<DecisionRecommendationResponse | null>(null)
  const [federation, setFederation] = useState<FederationCostResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // New analytics state
  const [taggingCoverage, setTaggingCoverage] = useState<TaggingCoverageResponse | null>(null)
  const [sustainability, setSustainability] = useState<SustainabilityResponse | null>(null)
  const [crossProvider, setCrossProvider] = useState<CrossProviderComparisonResponse | null>(null)
  const [anomalyIntel, setAnomalyIntel] = useState<AnomalyIntelligenceResponse | null>(null)
  const [chargeback, setChargeback] = useState<ChargebackSummaryResponse | null>(null)
  const [operatingReview, setOperatingReview] = useState<FinOpsOperatingReviewResponse | null>(null)
  const [decisionIntel, setDecisionIntel] = useState<DecisionIntelligenceResponse | null>(null)
  const [controlTower, setControlTower] = useState<FinOpsControlTowerResponse | null>(null)

  const pushToast = useCallback((title: string, detail: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts(prev => [...prev, { id, title, detail, kind }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setTagQualityError(null)
    setDecisionError(null)
    setFederationError(null)
    setLoadingTagQuality(true)
    setLoadingDecision(true)
    setLoadingFederation(true)
    const [tagRes, decRes, fedRes, tcRes, susRes, cpRes, aiRes, cbRes, opRes, diRes, ctRes] = await Promise.allSettled([
      withTimeout(fetchTagQualityScore('all'), 'Tag quality'),
      withTimeout(fetchDecisionGradeRecommendations({ top_n: 8, provider: 'all', min_monthly_savings: 10 }), 'Decision-grade recommendations'),
      withTimeout(fetchFederatedCosts({ provider: 'all', include_regions: true }), 'Federated costs'),
      withTimeout(fetchTaggingCoverage('all'), 'Tagging coverage'),
      withTimeout(fetchSustainabilityMetrics('all'), 'Sustainability metrics'),
      withTimeout(fetchCrossProviderComparison(), 'Cross-provider comparison'),
      withTimeout(fetchAnomalyIntelligence('all'), 'Anomaly intelligence'),
      withTimeout(fetchChargebackSummary('all'), 'Chargeback summary'),
      withTimeout(fetchFinOpsOperatingReview('all', 12), 'Operating review'),
      withTimeout(fetchDecisionIntelligence('all', 12), 'Decision intelligence'),
      withTimeout(fetchFinOpsControlTower('all', 12), 'Control Tower'),
    ])

    if (tagRes.status === 'fulfilled') {
      setTagQuality(tagRes.value)
      pushToast('Tag quality loaded', `Completeness ${tagRes.value.completeness_score.toFixed(1)}%`, 'success')
    } else {
      setTagQualityError('Failed to load tag quality section.')
      pushToast('Tag quality failed', 'Could not load tag quality section.', 'error')
    }
    setLoadingTagQuality(false)

    if (decRes.status === 'fulfilled') {
      setDecision(decRes.value)
      pushToast('Decision-grade loaded', `${decRes.value.total_candidates} candidates`, 'success')
    } else {
      setDecisionError('Failed to load decision-grade recommendations.')
      pushToast('Decision-grade failed', 'Could not load recommendation section.', 'error')
    }
    setLoadingDecision(false)

    if (fedRes.status === 'fulfilled') {
      setFederation(fedRes.value)
      pushToast('Federation loaded', `${fedRes.value.total_accounts} accounts`, 'success')
    } else {
      setFederationError('Failed to load federation cost section.')
      pushToast('Federation failed', 'Could not load federation section.', 'error')
    }
    setLoadingFederation(false)

    if (tcRes.status === 'fulfilled') setTaggingCoverage(tcRes.value)
    if (susRes.status === 'fulfilled') setSustainability(susRes.value)
    if (cpRes.status === 'fulfilled') setCrossProvider(cpRes.value)
    if (aiRes.status === 'fulfilled') setAnomalyIntel(aiRes.value)
    if (cbRes.status === 'fulfilled') setChargeback(cbRes.value)
    if (opRes.status === 'fulfilled') setOperatingReview(opRes.value)
    if (diRes.status === 'fulfilled') setDecisionIntel(diRes.value)
    if (ctRes.status === 'fulfilled') setControlTower(ctRes.value)

    if (tagRes.status === 'rejected' && decRes.status === 'rejected' && fedRes.status === 'rejected') {
      setError('Failed to load advanced FinOps data.')
    }
    setLoading(false)
  }, [pushToast])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const chatScroll = chatScrollRef.current
    if (!chatScroll) return
    chatScroll.scrollTo({ top: chatScroll.scrollHeight, behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  const sendChatMessage = useCallback(async (event?: FormEvent, overridePrompt?: string) => {
    event?.preventDefault()
    const prompt = (overridePrompt ?? chatInput).trim()
    if (!prompt || chatLoading) return

    const userMessage: ChatMessage = {
      id: `${Date.now()}-control-user`,
      role: 'user',
      content: prompt,
    }
    const history = [...chatMessages, userMessage]
    setChatMessages(prev => [...prev, userMessage])
    setChatInput('')
    setChatError(null)
    setChatLoading(true)

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          conversationHistory: history.map(message => ({
            role: message.role,
            content: message.content,
          })),
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(typeof payload?.message === 'string' ? payload.message : 'Advisor chat failed.')
      }

      const payload = await response.json()
      const content =
        typeof payload?.response === 'string' && payload.response.trim()
          ? payload.response
          : 'The advisor returned an empty response. Try a narrower control-tower question.'
      setChatMessages(prev => [
        ...prev,
        {
          id: `${Date.now()}-control-assistant`,
          role: 'assistant',
          content,
        },
      ])
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Advisor chat is unavailable.'
      setChatError(detail)
      setChatMessages(prev => [
        ...prev,
        {
          id: `${Date.now()}-control-error`,
          role: 'assistant',
          content: 'I could not reach the Advisor Conversation right now. Please retry after refreshing telemetry.',
        },
      ])
    } finally {
      setChatLoading(false)
    }
  }, [chatInput, chatLoading, chatMessages])

  function handleActionPrompt(action: string) {
    void sendChatMessage(
      undefined,
      `Explain this FinOps Control Tower action using current telemetry, owner next steps, risks, and evidence: ${action}`,
    )
  }

  function clearChat() {
    setChatMessages([
      {
        id: `${Date.now()}-control-reset`,
        role: 'assistant',
        content: 'Chat reset. Pick a control-tower action or ask a FinOps question.',
      },
    ])
    setChatInput('')
    setChatError(null)
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-md">FinOps Control Tower</Badge>
            <Badge variant="outline" className="rounded-md border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30">
              Competitive Features
            </Badge>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-2">FinOps Control Tower</h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-3xl">
            Unified view of tag completeness scoring, decision-grade optimization ranking, and multi-account federation insights.
          </p>
        </div>
        <Button variant="outline" onClick={() => { forceNextApiRefresh(); void load() }} className="rounded-lg">
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
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
                <p className="text-xs text-slate-500">Decision Frontier</p>
                <p className="text-2xl font-bold capitalize text-slate-900 dark:text-white">{decisionIntel?.recommended_scenario || '—'}</p>
                <p className="text-sm text-slate-500">{fmt(decisionIntel?.expected_monthly_savings_pool_usd || 0)} savings pool / month</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Control Tower</p>
                <p className="text-2xl font-bold capitalize text-slate-900 dark:text-white">{controlTower?.posture || '—'}</p>
                <p className="text-sm text-slate-500">{(controlTower?.control_score ?? 0).toFixed(1)} / 100 score</p>
              </CardContent>
            </Card>
          </div>

          <Expander
            title="FinOps Control Tower"
            description="Unified forecast risk, waste, commitment, governance, and decision signals with RAG-backed advisory context."
            icon={<ShieldCheck className="h-5 w-5" />}
            defaultOpen
          >
            {controlTower ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  {[
                    { label: 'Monthly Spend', value: fmt(controlTower.executive_summary.monthly_spend_usd) },
                    { label: 'Annual Run Rate', value: fmt(controlTower.executive_summary.annualized_run_rate_usd) },
                    { label: 'Forecast Confidence', value: `${controlTower.executive_summary.forecast_confidence_score.toFixed(1)} / 100` },
                    { label: 'Scenario', value: controlTower.executive_summary.recommended_scenario || 'balanced' },
                  ].map((metric) => (
                    <Card key={metric.label} className="rounded-lg">
                      <CardContent className="p-4">
                        <p className="text-xs uppercase text-slate-500">{metric.label}</p>
                        <p className="mt-2 text-xl font-semibold capitalize text-slate-950 dark:text-white">{metric.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                  {controlTower.control_lanes.map((lane) => (
                    <div key={lane.lane} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <p className="font-semibold text-slate-950 dark:text-white">{lane.label}</p>
                        <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${statusTone(lane.status)}`}>
                          {lane.status}
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-slate-950 dark:text-white">
                        {lane.primary_metric_label.includes('opportunity') || lane.primary_metric_label.includes('pool')
                          ? fmt(lane.primary_metric)
                          : lane.primary_metric.toFixed(1)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{lane.primary_metric_label}</p>
                      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{lane.next_action}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 text-blue-700 dark:text-blue-300" />
                        <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">Advisor Conversation</p>
                      </div>
                      <p className="mt-1 text-xs text-blue-800/80 dark:text-blue-200/80">
                        Turn control-tower actions into explainable owner steps using the live chat API.
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={clearChat}>
                      <Eraser className="mr-1 h-4 w-4" />
                      Clear
                    </Button>
                  </div>

                  {controlTower.priority_actions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {controlTower.priority_actions.map((action) => (
                        <button
                          key={action}
                          type="button"
                          onClick={() => handleActionPrompt(action)}
                          disabled={chatLoading}
                          className="rounded-md border border-blue-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 shadow-sm transition hover:border-blue-400 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-900 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-blue-200"
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  )}

                  <div ref={chatScrollRef} className="mt-4 max-h-80 space-y-3 overflow-y-auto rounded-lg border border-blue-100 bg-white p-3 dark:border-blue-950 dark:bg-slate-950">
                    {chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`max-w-[92%] rounded-lg px-3 py-2 text-sm leading-6 ${
                          message.role === 'user'
                            ? 'ml-auto bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200'
                        }`}
                      >
                        <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.content}</div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                        <Loader className="h-4 w-4 animate-spin" />
                        Asking advisor...
                      </div>
                    )}
                  </div>

                  {chatError && (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{chatError}</p>
                  )}

                  <form onSubmit={(event) => void sendChatMessage(event)} className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Ask the Advisor Conversation</span>
                      <textarea
                        value={chatInput}
                        onChange={(event) => setChatInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault()
                            void sendChatMessage()
                          }
                        }}
                        placeholder="Ask why this action matters, who should own it, or what evidence supports it..."
                        disabled={chatLoading}
                        className="min-h-[68px] w-full resize-none rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-70 dark:border-blue-900 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                      />
                    </label>
                    <Button type="submit" disabled={chatLoading || !chatInput.trim()} className="min-h-[68px] px-5">
                      {chatLoading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Send
                    </Button>
                  </form>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Control tower analytics are unavailable for this workspace.</p>
            )}
          </Expander>

          <Expander
            title="Core Control Tower Panels"
            description="Tag quality dimensions and decision-grade optimization ranking."
            icon={<Bot className="h-5 w-5" />}
            defaultOpen
          >
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="flex items-center gap-2"><Tags className="h-5 w-5" />Tag Quality Dimensions</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {tagQualityError && (
                  <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                    {tagQualityError}
                  </div>
                )}
                {loadingTagQuality && <p className="mb-3 text-xs text-slate-500">Loading tag-quality section...</p>}
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
                {decisionError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                    {decisionError}
                  </div>
                )}
                {loadingDecision && <p className="text-xs text-slate-500">Loading decision-grade section...</p>}
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
          </Expander>

          <Expander
            title="Federation And Remediation Controls"
            description="Multi-account rollups and guarded remediation state."
            icon={<Users className="h-5 w-5" />}
          >
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Multi-Account Federation</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {federationError && (
                  <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                    {federationError}
                  </div>
                )}
                {loadingFederation && <p className="mb-3 text-xs text-slate-500">Loading federation section...</p>}
                <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {Object.entries(federation?.provider_totals_usd ?? {}).map(([providerName, total]) => (
                    <div key={providerName} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                      <p className="text-xs font-medium uppercase text-slate-500">{providerName}</p>
                      <p className="font-semibold text-slate-900 dark:text-white">{fmt(total)}</p>
                    </div>
                  ))}
                </div>
                {Object.keys(federation?.source_totals_usd ?? {}).length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {Object.entries(federation?.source_totals_usd ?? {}).map(([sourceName, total]) => (
                      <Badge key={sourceName} variant="outline" className="rounded-md">
                        {sourceName}: {fmt(total)}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  {(federation?.accounts || []).slice(0, 12).map((row) => (
                    <div
                      key={`${row.provider}-${row.account_identifier}`}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                      style={{ marginLeft: String(Math.min(row.depth, 4) * 12) + 'px' }}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-900 dark:text-white">{row.account_name}</p>
                          <Badge variant="outline" className="rounded-md">{row.account_type}</Badge>
                          {row.child_count > 0 && <span className="text-xs text-slate-500">{row.child_count} child(ren)</span>}
                        </div>
                        <p className="font-mono text-xs text-slate-500">{row.provider}:{row.account_identifier}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900 dark:text-white">{fmt(row.rolled_up_cost_usd)}</p>
                        {row.direct_cost_usd !== row.rolled_up_cost_usd && (
                          <p className="text-xs text-slate-500">{fmt(row.direct_cost_usd)} direct</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Auto-Remediation</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  Non-dry-run remediation execution requires ENABLE_AUTO_REMEDIATION=true.
                </div>
                <p className="text-sm text-slate-500">Dry-run planning remains active with guardrails, and rightsizing recommendations remain fully available.</p>
              </CardContent>
            </Card>
          </div>
          </Expander>

          <Expander
            title="Decision Intelligence Frontier"
            description="Compare optimization scenarios by utility, risk, confidence, and payback."
            icon={<BarChart3 className="h-5 w-5" />}
          >
          <Card>
            <CardHeader className="border-b border-slate-200 dark:border-slate-700">
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Decision Intelligence Frontier</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {!decisionIntel ? (
                <p className="text-sm text-slate-500">Decision frontier unavailable for this workspace.</p>
              ) : (
                <div className="space-y-3">
                  {(decisionIntel.frontier || []).map((row) => (
                    <div key={row.scenario} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      <div className="mb-1 flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold capitalize text-slate-900 dark:text-white">{row.scenario}</p>
                        <Badge variant="outline" className="rounded-md">utility {row.utility_score.toFixed(1)}</Badge>
                      </div>
                      <p className="text-xs text-slate-500">{row.description}</p>
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                        savings {fmt(row.expected_annual_savings_usd)}/yr · risk {row.execution_risk_score.toFixed(1)} · confidence {(row.confidence * 100).toFixed(0)}% · payback {row.estimated_payback_months ?? 'n/a'} mo
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </Expander>

          {/* New deep analytics section */}
          <Expander
            title="Deep Analytics"
            description="Allocation readiness, sustainability, cross-provider comparison, anomalies, chargeback, and operating review."
            icon={<AlertTriangle className="h-5 w-5" />}
          >
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="flex items-center gap-2"><Tags className="h-5 w-5" />Tagging Coverage &amp; Allocation Readiness</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {taggingCoverage ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <p className="text-xs text-slate-500">Overall Coverage</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{taggingCoverage.coverage_percent.toFixed(1)}%</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <p className="text-xs text-slate-500">Allocation Readiness</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{taggingCoverage.allocation_readiness_score.toFixed(0)}/100</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
                      <p className="font-medium text-amber-800 dark:text-amber-200">Untagged Spend: {fmt(taggingCoverage.untagged_spend_monthly_usd)}</p>
                      {taggingCoverage.critical_tag_gaps.length > 0 && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Critical gaps: {taggingCoverage.critical_tag_gaps.join(', ')}</p>
                      )}
                    </div>
                    {taggingCoverage.genai_narrative && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 italic">{taggingCoverage.genai_narrative}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Loading tagging coverage...</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="flex items-center gap-2"><Leaf className="h-5 w-5" />Sustainability &amp; Carbon Footprint</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {sustainability ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <p className="text-xs text-slate-500">Monthly CO₂e</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{sustainability.total_kg_co2e_monthly.toFixed(0)} kg</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <p className="text-xs text-slate-500">Sustainability Score</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{sustainability.sustainability_score.toFixed(0)}/100</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {sustainability.provider_emissions.map(pf => (
                        <div key={pf.provider} className="flex justify-between text-sm rounded border border-slate-200 px-2 py-1 dark:border-slate-700">
                          <span className="text-slate-700 dark:text-slate-300 uppercase">{pf.provider}</span>
                          <span className="font-medium text-slate-900 dark:text-white">{pf.kg_co2e_monthly.toFixed(1)} kg CO₂e/mo</span>
                        </div>
                      ))}
                    </div>
                    {sustainability.genai_narrative && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 italic">{sustainability.genai_narrative}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Loading sustainability metrics...</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Cross-Provider Comparison</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {crossProvider ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-slate-200 p-2 text-xs text-center dark:border-slate-700">
                      HHI Concentration: <span className="font-bold">{crossProvider.concentration_hhi.toFixed(2)}</span>
                      {' · '}<span className="capitalize">{crossProvider.concentration_risk}</span> risk
                    </div>
                    {crossProvider.providers.map(p => (
                      <div key={p.provider} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium uppercase text-slate-900 dark:text-white">{p.provider}</span>
                          <span className="text-xs text-slate-500">Health: {p.health_score.toFixed(0)}/100</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Share: {p.share_percent.toFixed(1)}% · Waste: {p.waste_rate_percent.toFixed(1)}% · Commitment: {p.commitment_coverage_percent.toFixed(0)}%
                        </div>
                      </div>
                    ))}
                    {crossProvider.genai_narrative && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 italic">{crossProvider.genai_narrative}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Loading cross-provider comparison...</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Anomaly Intelligence</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {anomalyIntel ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <p className="text-xs text-slate-500">Detected Anomalies</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{anomalyIntel.anomaly_count}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <p className="text-xs text-slate-500">Annualised Risk</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{fmt(anomalyIntel.unresolved_critical_annual_risk_usd)}</p>
                      </div>
                    </div>
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {anomalyIntel.anomalies.slice(0, 8).map((a, i) => (
                        <div key={i} className="rounded border border-slate-200 px-2 py-2 text-xs dark:border-slate-700">
                          <div className="flex justify-between">
                            <span className="font-medium text-slate-800 dark:text-slate-200">{a.service} ({a.provider.toUpperCase()})</span>
                            {a.severity === 'critical' && <Badge variant="outline" className="text-red-600 border-red-300 rounded-md">Escalate</Badge>}
                          </div>
                          <p className="text-slate-500 mt-0.5">{a.root_cause.hypothesis} · {fmt(Math.abs(a.change_usd))}/mo</p>
                        </div>
                      ))}
                    </div>
                    {anomalyIntel.genai_narrative && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 italic">{anomalyIntel.genai_narrative}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Loading anomaly intelligence...</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="border-b border-slate-200 dark:border-slate-700">
              <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />Chargeback / Showback Summary</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {chargeback ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      <p className="text-xs text-slate-500">Allocated</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">{fmt(chargeback.total_allocated_usd)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      <p className="text-xs text-slate-500">Unallocated</p>
                      <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{fmt(chargeback.unallocated_usd)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      <p className="text-xs text-slate-500">Coverage</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">{chargeback.allocation_coverage_percent.toFixed(1)}%</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                          <th className="pb-2 text-left text-xs text-slate-500 font-medium">Team</th>
                          <th className="pb-2 text-right text-xs text-slate-500 font-medium">Spend</th>
                          <th className="pb-2 text-right text-xs text-slate-500 font-medium">Share</th>
                          <th className="pb-2 text-left text-xs text-slate-500 font-medium">Provider</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {chargeback.allocations.map((t, idx) => (
                          <tr key={`${t.team}-${t.provider}-${idx}`}>
                            <td className="py-1.5 text-slate-900 dark:text-white font-medium">{t.team}</td>
                            <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{fmt(t.allocated_spend_usd)}</td>
                            <td className="py-1.5 text-right text-slate-500">{t.share_percent.toFixed(1)}%</td>
                            <td className="py-1.5 text-slate-500 uppercase text-xs">{t.provider}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {chargeback.genai_narrative && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 italic">{chargeback.genai_narrative}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Loading chargeback summary...</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-slate-200 dark:border-slate-700">
              <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" />Weekly FinOps Operating Review</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {operatingReview ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      <p className="text-xs text-slate-500">Risk Score</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">{operatingReview.summary.risk_score.toFixed(0)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      <p className="text-xs text-slate-500">Waste / Month</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">{fmt(operatingReview.summary.estimated_waste_usd)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      <p className="text-xs text-slate-500">Spend at Risk</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">{fmt(operatingReview.summary.spend_at_risk_usd)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      <p className="text-xs text-slate-500">Budget Breach</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">{(operatingReview.summary.average_budget_breach_probability * 100).toFixed(1)}%</p>
                    </div>
                  </div>
                  {operatingReview.genai_narrative ? (
                    <p className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs italic text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200">
                      {operatingReview.genai_narrative}
                    </p>
                  ) : (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                      GenAI prompt fallback is available in this response when OCI GenAI is not configured.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Loading operating review...</p>
              )}
            </CardContent>
          </Card>
          </Expander>
        </>
      )}

      <div className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm space-y-2">
        {toasts.map((toast) => {
          const color = toast.kind === 'error'
            ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'
            : toast.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
          return (
            <div key={toast.id} className={`rounded-lg border p-3 shadow-lg ${color}`}>
              <p className="text-xs font-semibold">{toast.title}</p>
              <p className="text-xs opacity-90">{toast.detail}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
