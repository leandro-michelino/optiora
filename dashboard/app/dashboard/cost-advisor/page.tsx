'use client'

import type { FormEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Brain,
  CheckCircle2,
  Clipboard,
  Database,
  Download,
  Eraser,
  FileText,
  Gauge,
  Lightbulb,
  ListChecks,
  Loader,
  MessageCircle,
  RefreshCw,
  Route,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  User,
  Zap,
} from 'lucide-react'
import { fetchHybridAdvisor, forceNextApiRefresh } from '@/lib/api'
import { AdvisorNarrativeType, HybridAdvisorResponse } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Expander } from '@/components/ui/expander'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  status?: 'ok' | 'error'
}

interface Suggestion {
  text: string
  icon: ReactNode
}

const narrativeLabels: Record<AdvisorNarrativeType, string> = {
  waste_insights: 'Waste Insights',
  optimization_roadmap: '30/60/90 Roadmap',
  executive_narrative: 'Executive Summary',
  tagging_strategy: 'Tagging Plan',
  sustainability_narrative: 'Sustainability',
  finops_operating_review: 'Operating Review',
}

const narrativeOrder: AdvisorNarrativeType[] = [
  'optimization_roadmap',
  'waste_insights',
  'tagging_strategy',
  'finops_operating_review',
  'executive_narrative',
  'sustainability_narrative',
]

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

function formatDateTime(value?: string): string {
  if (!value) return 'Not available'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not available'
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatPercent(value?: number | null, digits = 1): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0.0%'
  return `${value.toFixed(digits)}%`
}

function humanize(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function confidenceLabel(hybrid: HybridAdvisorResponse | null): string {
  if (!hybrid) return 'Waiting for live data'
  if (hybrid.advisory.genai_configured && !hybrid.advisory.fallback_mode) {
    return 'High: deterministic metrics plus GenAI narrative'
  }
  return 'High: deterministic metrics, narrative fallback'
}

function resolveHybridErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unable to load hybrid advisor data.'
  }

  const message = error.message.trim()
  const lower = message.toLowerCase()
  if (lower.includes('timed out') || lower.includes('aborted')) {
    return 'Hybrid advisor is taking longer than expected. Please retry in a few seconds.'
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('network error')) {
    return 'Advisor backend is not reachable from this browser. Check the API URL, deployment health, or refresh after the service starts.'
  }

  return message || 'Unable to load hybrid advisor data.'
}

function tokenParts(text: string): ReactNode[] {
  const parts = text.split(/(https?:\/\/[^\s]+|arn:[^\s]+|\/subscriptions\/[^\s]+|projects\/[^\s]+|oci[a-z0-9_.-]{20,})/gi)
  return parts.map((part, index) => {
    if (!part) return null
    if (/^https?:\/\//i.test(part)) {
      return (
        <a
          key={`${part}-${index}`}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="break-all font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900 dark:text-blue-300 dark:decoration-blue-700 dark:hover:text-blue-100"
        >
          {part}
        </a>
      )
    }
    if (/^(oci|arn:|\/subscriptions\/|projects\/)/i.test(part)) {
      return (
        <code
          key={`${part}-${index}`}
          className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[0.8em] text-slate-800 [overflow-wrap:anywhere] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        >
          {part}
        </code>
      )
    }
    return <span key={`${part}-${index}`}>{part}</span>
  })
}

function AdvisorText({ content, compact = false }: { content: string; compact?: boolean }) {
  const normalized = content.replace(/\r/g, '').trim()
  if (!normalized) return null

  const blocks = normalized.split(/\n{2,}/).filter(Boolean)
  return (
    <div className={`${compact ? 'space-y-2' : 'space-y-3'} text-sm leading-6 text-slate-700 dark:text-slate-200`}>
      {blocks.map((block, blockIndex) => {
        const lines = block.split('\n').filter((line) => line.trim().length > 0)
        const numbered = lines.length > 1 && lines.every((line) => /^\s*(\d+\.|-|•)/.test(line))

        if (numbered) {
          return (
            <ul key={`${blockIndex}-${block.slice(0, 16)}`} className="space-y-2">
              {lines.map((line, lineIndex) => (
                <li
                  key={`${lineIndex}-${line.slice(0, 16)}`}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
                >
                  {tokenParts(line.replace(/^\s*(\d+\.|-|•)\s*/, ''))}
                </li>
              ))}
            </ul>
          )
        }

        return (
          <p key={`${blockIndex}-${block.slice(0, 16)}`} className="[overflow-wrap:anywhere]">
            {tokenParts(block)}
          </p>
        )
      })}
    </div>
  )
}

function StatTile({
  label,
  value,
  helper,
  icon,
  tone,
}: {
  label: string
  value: string
  helper: string
  icon: ReactNode
  tone: 'blue' | 'emerald' | 'amber' | 'slate'
}) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
    slate: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold text-slate-950 dark:text-white">{value}</p>
        </div>
        <span className={`rounded-lg border p-2 ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-3 text-sm leading-5 text-slate-500 dark:text-slate-400">{helper}</p>
    </div>
  )
}

function DecisionCard({
  label,
  title,
  helper,
  icon,
  tone,
}: {
  label: string
  title: string
  helper: string
  icon: ReactNode
  tone: 'blue' | 'emerald' | 'amber' | 'violet'
}) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
    violet: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300',
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <span className={`rounded-lg border p-2 ${tones[tone]}`}>{icon}</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-base font-semibold leading-6 text-slate-950 [overflow-wrap:anywhere] dark:text-white">
            {title}
          </p>
          <p className="mt-2 text-sm leading-5 text-slate-600 [overflow-wrap:anywhere] dark:text-slate-400">
            {helper}
          </p>
        </div>
      </div>
    </div>
  )
}

function ProgressLine({
  label,
  value,
  helper,
  tone = 'blue',
}: {
  label: string
  value: number
  helper?: string
  tone?: 'blue' | 'emerald' | 'amber' | 'rose'
}) {
  const clamped = Math.max(0, Math.min(value, 100))
  const tones = {
    blue: 'bg-blue-600',
    emerald: 'bg-emerald-600',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-900 dark:text-white">{label}</span>
        <span className="shrink-0 text-slate-600 dark:text-slate-400">{formatPercent(clamped)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-2 rounded-full transition-all duration-700 ${tones[tone]}`} style={{ width: `${clamped}%` }} />
      </div>
      {helper ? <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{helper}</p> : null}
    </div>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
      {children}
    </div>
  )
}

function Notice({
  tone,
  icon,
  children,
}: {
  tone: 'amber' | 'blue' | 'red' | 'emerald'
  icon: ReactNode
  children: ReactNode
}) {
  const cls = {
    amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
    blue: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200',
    red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
  }

  return (
    <div className={`rounded-lg border p-3 text-sm ${cls[tone]}`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0 [overflow-wrap:anywhere]">{children}</div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  return (
    <article className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
          <Bot className="h-4 w-4" />
        </span>
      )}
      <div
        className={`min-w-0 max-w-[min(920px,86%)] rounded-lg border px-4 py-3 shadow-sm ${
          isUser
            ? 'border-blue-600 bg-blue-600 text-white'
            : message.status === 'error'
              ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
              : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
        }`}
      >
        {isUser ? (
          <p className="text-sm leading-6 [overflow-wrap:anywhere]">{message.content}</p>
        ) : (
          <AdvisorText content={message.content} />
        )}
        <p className={`mt-3 text-xs ${isUser ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      {isUser && (
        <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <User className="h-4 w-4" />
        </span>
      )}
    </article>
  )
}

function ConversationLens({
  label,
  prompt,
  icon,
  onSelect,
}: {
  label: string
  prompt: string
  icon: ReactNode
  onSelect: (prompt: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(prompt)}
      className="rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800 dark:hover:bg-blue-950/30"
    >
      <span className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
        {icon}
      </span>
      <span className="block text-sm font-semibold text-slate-950 dark:text-white">{label}</span>
      <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400 [overflow-wrap:anywhere]">
        {prompt}
      </span>
    </button>
  )
}

export default function CostAdvisorPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        "I'm ready to analyze your cloud cost telemetry. Ask about expensive resources, savings opportunities, commitment coverage, Kubernetes allocation, or migration tradeoffs.",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hybrid, setHybrid] = useState<HybridAdvisorResponse | null>(null)
  const [hybridLoading, setHybridLoading] = useState(false)
  const [hybridError, setHybridError] = useState<string | null>(null)
  const [narrativeType, setNarrativeType] = useState<AdvisorNarrativeType>('optimization_roadmap')
  const [chatError, setChatError] = useState<string | null>(null)
  const [lastUserPrompt, setLastUserPrompt] = useState<string>('')
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const hybridRequestIdRef = useRef(0)

  const suggestions: Suggestion[] = useMemo(() => [
    { icon: <Target className="h-4 w-4" />, text: 'What is the most expensive actionable resource?' },
    { icon: <Zap className="h-4 w-4" />, text: 'Show the fastest savings actions for this month' },
    { icon: <Gauge className="h-4 w-4" />, text: 'Which services are over-provisioned?' },
    { icon: <Brain className="h-4 w-4" />, text: 'Create a 30/60/90 day FinOps plan' },
    { icon: <ShieldCheck className="h-4 w-4" />, text: 'Where do we need better tags or ownership?' },
  ], [])

  useEffect(() => {
    const chatScroll = chatScrollRef.current
    if (!chatScroll) return
    chatScroll.scrollTo({ top: chatScroll.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const loadHybrid = useCallback(async (type: AdvisorNarrativeType) => {
    const requestId = hybridRequestIdRef.current + 1
    hybridRequestIdRef.current = requestId
    setHybridLoading(true)
    setHybridError(null)
    setNarrativeType(type)
    try {
      const response = await fetchHybridAdvisor(type)
      if (requestId !== hybridRequestIdRef.current) return
      setHybrid(response)
    } catch (error) {
      if (requestId !== hybridRequestIdRef.current) return
      setHybridError(resolveHybridErrorMessage(error))
    } finally {
      if (requestId === hybridRequestIdRef.current) {
        setHybridLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadHybrid('optimization_roadmap')
  }, [loadHybrid])

  async function handleSendMessage(event?: FormEvent, overridePrompt?: string) {
    event?.preventDefault()
    const prompt = (overridePrompt ?? input).trim()
    if (!prompt || loading) return
    setChatError(null)

    const userMessage: Message = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    }

    const historyForRequest = [...messages, userMessage]
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLastUserPrompt(prompt)
    setLoading(true)

    try {
      const controller = new AbortController()
      const timeout = globalThis.setTimeout(() => controller.abort(), 90000)
      let response: Response | undefined
      try {
        response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            message: prompt,
            conversationHistory: historyForRequest.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        })
      } finally {
        globalThis.clearTimeout(timeout)
      }
      if (!response) {
        throw new Error('No response returned from the advisor service.')
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const detail = typeof payload?.message === 'string' ? payload.message : ''
        throw new Error(detail || 'Failed to get response')
      }

      const data = await response.json()
      const responseText = typeof data?.response === 'string' && data.response.trim()
        ? data.response
        : 'The advisor returned an empty response. Please retry with a narrower question.'

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: responseText,
          timestamp: new Date(),
        },
      ])
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? 'The request timed out after 90 seconds. Please try again.'
          : "I'm having trouble connecting to the AI service. Please try again in a moment."
      setChatError(message)
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant-error`,
          role: 'assistant',
          content: message,
          timestamp: new Date(),
          status: 'error',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleSuggestion(suggestion: string) {
    setInput(suggestion)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function handleRetry() {
    if (!loading && lastUserPrompt) {
      void handleSendMessage(undefined, lastUserPrompt)
    }
  }

  function handleClearChat() {
    setMessages([
      {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        content:
          "Chat reset. Ask any FinOps question about your cloud services, and I'll answer using current telemetry.",
        timestamp: new Date(),
      },
    ])
    setInput('')
    setChatError(null)
  }

  function handleExportChat() {
    const transcript = messages
      .map((m) => `[${m.timestamp.toISOString()}] ${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n')
    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `cost-advisor-chat-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function handleShareChat() {
    const transcript = messages
      .slice(-8)
      .map((m) => `${m.role === 'user' ? 'User' : 'Advisor'}: ${m.content}`)
      .join('\n')
    const shareText = `OptiOra Cost Advisor highlights:\n${transcript}`
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'OptiOra Cost Advisor',
          text: shareText,
          url: window.location.href,
        })
        return
      }
      await navigator.clipboard.writeText(shareText)
      setChatError('Chat summary copied to clipboard.')
    } catch {
      setChatError('Unable to share automatically. Please use Export Chat.')
    }
  }

  const topRecommendations = hybrid?.deterministic.recommendations.slice(0, 4) || []
  const topRecommendation = topRecommendations[0]
  const quickWins = hybrid?.deterministic.waste.quick_wins.slice(0, 4) || []
  const wasteCategories = hybrid?.deterministic.waste.categories.slice(0, 5) || []
  const providerFindings = hybrid?.deterministic.analytics.provider_findings.slice(0, 4) || []
  const providerSignals = hybrid?.deterministic.analytics.provider_signals?.slice(0, 4) || []
  const improvementFocus = hybrid?.deterministic.efficiency.improvement_focus.slice(0, 5) || []
  const efficiencyDimensions = Object.entries(hybrid?.deterministic.efficiency.dimensions || {}).slice(0, 5)
  const commitmentGaps = hybrid?.deterministic.commitment_gap.provider_gaps.slice(0, 4) || []
  const monthlySpend = hybrid?.deterministic.analytics.current_monthly_spend_usd || 0
  const wasteEstimate = hybrid?.deterministic.waste.total_estimated_waste_usd || 0
  const wasteRate = hybrid?.deterministic.waste.total_waste_rate_percent || 0
  const budgetUtilization = hybrid?.deterministic.analytics.unit_metrics?.budget_utilization_percent || 0
  const riskScore = hybrid?.deterministic.analytics.risk_score || 0
  const commitmentOpportunity = hybrid?.deterministic.commitment_gap.total_annual_opportunity_usd || 0
  const efficiencyScore = hybrid?.deterministic.efficiency.overall_score || 0
  const genAiMode = hybrid?.advisory.genai_configured && !hybrid?.advisory.fallback_mode ? 'GenAI active' : 'Deterministic fallback'
  const nextActionTitle = topRecommendation?.title || quickWins[0]?.remediation || 'Load live advisor data'
  const nextActionHelper = topRecommendation
    ? `${formatCurrency(topRecommendation.savings_monthly_usd || 0)} estimated monthly savings. ROI ${formatPercent(topRecommendation.roi_percent || 0, 0)}.`
    : quickWins[0]
      ? `${formatCurrency(quickWins[0].estimated_waste_usd || 0)} estimated waste in ${humanize(quickWins[0].category)}.`
      : 'Refresh the brief to calculate prioritized actions from the backend.'

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-4xl">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-md">Live advisor API</Badge>
            <Badge variant="outline" className="rounded-md">Deterministic math</Badge>
            <Badge className="rounded-md border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
              {genAiMode}
            </Badge>
          </div>
          <h1 className="text-3xl font-semibold text-slate-950 dark:text-white md:text-4xl">Cost Advisor</h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-400">
            Ask focused FinOps questions, compare deterministic evidence, and turn long telemetry into a friendly action plan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { forceNextApiRefresh(); void loadHybrid(narrativeType) }} disabled={hybridLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${hybridLoading ? 'animate-spin' : ''}`} />
            Refresh Brief
          </Button>
          <Button variant="outline" onClick={handleExportChat}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatTile
          label="Monthly Spend"
          value={hybridLoading ? 'Loading' : formatCurrency(monthlySpend)}
          helper="Current deterministic analytics baseline"
          icon={<FileText className="h-5 w-5" />}
          tone="blue"
        />
        <StatTile
          label="Waste Estimate"
          value={hybridLoading ? 'Loading' : formatCurrency(wasteEstimate)}
          helper={`${formatPercent(wasteRate)} of monthly spend is marked as addressable waste`}
          icon={<Target className="h-5 w-5" />}
          tone="amber"
        />
        <StatTile
          label="Efficiency"
          value={hybridLoading ? 'Loading' : `${efficiencyScore} / 100`}
          helper={`Last brief: ${formatDateTime(hybrid?.generated_at)}`}
          icon={<Gauge className="h-5 w-5" />}
          tone={efficiencyScore >= 75 ? 'emerald' : 'slate'}
        />
      </div>

      <Expander
        title="Decision Snapshot"
        description="A friendly first read: what matters, why, and where to go next."
        icon={<ListChecks className="h-5 w-5 text-emerald-600" />}
        defaultOpen
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <DecisionCard
            label="Best next action"
            title={nextActionTitle}
            helper={nextActionHelper}
            icon={<Target className="h-5 w-5" />}
            tone="emerald"
          />
          <DecisionCard
            label="Evidence confidence"
            title={confidenceLabel(hybrid)}
            helper={`Source of truth: ${hybrid?.source_of_truth || 'waiting for advisor payload'}. Generated ${formatDateTime(hybrid?.generated_at)}.`}
            icon={<Database className="h-5 w-5" />}
            tone="blue"
          />
          <DecisionCard
            label="Financial posture"
            title={`${formatCurrency(commitmentOpportunity)} annual commitment opportunity`}
            helper={`Risk score ${riskScore.toFixed(0)} / 100. Budget utilization ${formatPercent(budgetUtilization)}.`}
            icon={<TrendingUp className="h-5 w-5" />}
            tone={riskScore >= 70 ? 'amber' : 'violet'}
          />
        </div>
      </Expander>

      {hybridError && (
        <Notice tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
          {hybridError}
        </Notice>
      )}
      {chatError && (
        <Notice tone={chatError.includes('copied') ? 'emerald' : 'amber'} icon={chatError.includes('copied') ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}>
          <span>{chatError}</span>
          {lastUserPrompt && !chatError.includes('copied') ? (
            <button type="button" onClick={handleRetry} className="ml-2 font-medium underline underline-offset-2" disabled={loading}>
              Retry last question
            </button>
          ) : null}
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.35fr)]">
        <div className="space-y-5">
          <Expander
            title="Hybrid Advisor Brief"
            description="Authoritative cost metrics with the selected advisory narrative."
            icon={<Brain className="h-5 w-5 text-blue-600" />}
            defaultOpen
          >
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Advisor narrative type">
                {narrativeOrder.map((type) => (
                  <Button
                    key={type}
                    type="button"
                    variant={narrativeType === type ? 'default' : 'outline'}
                    onClick={() => { forceNextApiRefresh(); void loadHybrid(type) }}
                    disabled={hybridLoading}
                  >
                    {narrativeLabels[type]}
                  </Button>
                ))}
              </div>

              {hybridLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
                  <Loader className="h-4 w-4 animate-spin" />
                  Building hybrid advisor brief...
                </div>
              ) : hybrid ? (
                <>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                        {narrativeLabels[hybrid.advisory.narrative_type]}
                      </p>
                      <Badge variant="outline" className="rounded-md">{hybrid.source_of_truth}</Badge>
                    </div>
                    <AdvisorText content={hybrid.advisory.narrative || hybrid.advisory.prompt} compact />
                  </div>

                  <Expander
                    title="Top Deterministic Actions"
                    description={`${topRecommendations.length} highest-priority actions from the backend advisor contract.`}
                    icon={<Sparkles className="h-5 w-5 text-amber-600" />}
                    defaultOpen
                    className="shadow-none"
                  >
                    {topRecommendations.length > 0 ? (
                      <div className="space-y-3">
                        {topRecommendations.map((item, idx) => (
                          <div key={`${item.id}-${idx}`} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="font-medium text-slate-950 dark:text-white [overflow-wrap:anywhere]">{item.title}</p>
                                <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-400 [overflow-wrap:anywhere]">{item.description}</p>
                              </div>
                              <Badge className="w-fit rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                                {formatCurrency(item.savings_monthly_usd || 0)} / mo
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Notice tone="blue" icon={<Lightbulb className="h-4 w-4" />}>
                        No deterministic recommendations are available in the current advisor payload.
                      </Notice>
                    )}
                  </Expander>
                </>
              ) : (
                <Notice tone="blue" icon={<Lightbulb className="h-4 w-4" />}>
                  Load a brief to show live deterministic advisor metrics.
                </Notice>
              )}
            </div>
          </Expander>

          <Expander
            title="Quick Wins And Efficiency"
            description="Open for waste categories, quick wins, score dimensions, and commitment gaps."
            icon={<Route className="h-5 w-5 text-violet-600" />}
          >
            {hybrid ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-3">
                  <ProgressLine
                    label="Waste rate"
                    value={wasteRate}
                    helper={`${formatCurrency(wasteEstimate)} estimated monthly waste before approval and remediation.`}
                    tone={wasteRate >= 25 ? 'rose' : wasteRate >= 15 ? 'amber' : 'emerald'}
                  />
                  <ProgressLine
                    label="Efficiency score"
                    value={efficiencyScore}
                    helper={hybrid.deterministic.efficiency.interpretation}
                    tone={efficiencyScore >= 75 ? 'emerald' : efficiencyScore >= 55 ? 'amber' : 'rose'}
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Quick wins
                  </p>
                  {quickWins.length > 0 ? (
                    <div className="space-y-2">
                      {quickWins.map((item) => (
                        <div key={item.category} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-950 dark:text-white">{humanize(item.category)}</p>
                              <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-400 [overflow-wrap:anywhere]">
                                {item.remediation}
                              </p>
                            </div>
                            <Badge variant="outline" className="w-fit rounded-md">
                              {item.effort} effort
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
                            {formatCurrency(item.estimated_waste_usd)} potential monthly impact
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>No quick wins are available in the current advisor payload.</EmptyState>
                  )}
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Improvement focus
                  </p>
                  {improvementFocus.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {improvementFocus.map((focus) => (
                        <Badge key={focus} variant="outline" className="h-auto rounded-md py-1">
                          {humanize(focus)}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>Efficiency focus areas will appear after analytics return a score profile.</EmptyState>
                  )}
                </div>

                {commitmentGaps.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Commitment gaps
                    </p>
                    {commitmentGaps.map((gap) => (
                      <div key={gap.provider} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium uppercase text-slate-950 dark:text-white">{gap.provider}</p>
                          <Badge variant="outline" className="rounded-md">
                            gap {formatPercent(gap.gap_percent)}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm leading-5 text-slate-600 dark:text-slate-400">
                          {gap.recommendation}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState>Refresh the brief to load quick wins, efficiency dimensions, and commitment opportunities.</EmptyState>
            )}
          </Expander>

          <Expander
            title="Evidence And Provider Signals"
            description="Open for source timestamps, provider findings, and data-quality hints."
            icon={<Database className="h-5 w-5 text-blue-600" />}
          >
            {hybrid ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Generated
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-950 dark:text-white">{formatDateTime(hybrid.generated_at)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Narrative mode
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-950 dark:text-white">{genAiMode}</p>
                  </div>
                </div>

                {providerFindings.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Provider findings
                    </p>
                    {providerFindings.map((finding) => (
                      <div key={finding.provider} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium uppercase text-slate-950 dark:text-white">{finding.provider}</p>
                          <Badge variant="outline" className="rounded-md">
                            {formatCurrency(finding.monthly_cost_usd)}
                          </Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                          <span className="rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-950">
                            Waste {formatCurrency(finding.estimated_waste_usd)}
                          </span>
                          <span className="rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-950">
                            Commitment {formatPercent(finding.commitment_coverage_percent)}
                          </span>
                          <span className="rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-950">
                            Volatility {finding.volatility_score.toFixed(0)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState>No provider-level findings were returned for this advisor payload.</EmptyState>
                )}

                {providerSignals.length > 0 ? (
                  <div className="space-y-2">
                    {providerSignals.map((signal) => (
                      <Notice key={`${signal.provider}-${signal.signal}`} tone="blue" icon={<BarChart3 className="h-4 w-4" />}>
                        <span className="font-medium uppercase">{signal.provider}</span>: {signal.message}
                      </Notice>
                    ))}
                  </div>
                ) : null}

                {wasteCategories.length > 0 || efficiencyDimensions.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3">
                    {wasteCategories.map((category) => (
                      <ProgressLine
                        key={category.category}
                        label={humanize(category.category)}
                        value={category.estimated_waste_rate_percent}
                        helper={category.description}
                        tone={category.estimated_waste_rate_percent >= 25 ? 'rose' : 'amber'}
                      />
                    ))}
                    {efficiencyDimensions.map(([name, dimension]) => (
                      <ProgressLine
                        key={name}
                        label={humanize(name)}
                        value={dimension.score}
                        helper={`Current ${dimension.current} ${dimension.unit}; benchmark ${dimension.benchmark} ${dimension.unit}.`}
                        tone={dimension.score >= 75 ? 'emerald' : 'blue'}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState>Load a brief to see the evidence used by the advisor.</EmptyState>
            )}
          </Expander>

          <Expander
            title="Prompt Shortcuts"
            description="Focused questions that keep answers concise and actionable."
            icon={<Clipboard className="h-5 w-5 text-emerald-600" />}
            defaultOpen
          >
            <div className="grid grid-cols-1 gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.text}
                  type="button"
                  onClick={() => handleSuggestion(suggestion.text)}
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/30 dark:hover:text-blue-200"
                >
                  <span className="shrink-0 text-slate-500 dark:text-slate-400">{suggestion.icon}</span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">{suggestion.text}</span>
                </button>
              ))}
            </div>
          </Expander>
        </div>

        <section className="flex min-h-[620px] flex-col rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Advisor Conversation</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Responses use the real chat API and wrap long identifiers for review.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleClearChat}>
                <Eraser className="mr-1 h-4 w-4" />
                Clear
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleShareChat()}>
                <Share2 className="mr-1 h-4 w-4" />
                Share
              </Button>
            </div>
          </div>

          <div ref={chatScrollRef} className="flex-1 space-y-5 overflow-y-auto bg-slate-50/70 p-4 dark:bg-slate-950/30 lg:p-5">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {messages.length <= 1 && !loading ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <ConversationLens
                  label="Cost driver"
                  prompt="Explain the top three cost drivers and what changed."
                  icon={<BarChart3 className="h-4 w-4" />}
                  onSelect={handleSuggestion}
                />
                <ConversationLens
                  label="Savings order"
                  prompt="Rank savings actions by impact, effort, and approval risk."
                  icon={<ListChecks className="h-4 w-4" />}
                  onSelect={handleSuggestion}
                />
                <ConversationLens
                  label="Owner brief"
                  prompt="Write a friendly action brief for engineering owners."
                  icon={<User className="h-4 w-4" />}
                  onSelect={handleSuggestion}
                />
              </div>
            ) : null}

            {loading && (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <Loader className="h-4 w-4 animate-spin" />
                Asking the live advisor...
              </div>
            )}
          </div>

          <form onSubmit={(event) => void handleSendMessage(event)} className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Ask the cost advisor</span>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void handleSendMessage()
                    }
                  }}
                  placeholder="Ask about the highest-cost VM, over-provisioned services, commitment gaps, or rollout plan..."
                  className="min-h-[72px] w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  disabled={loading}
                />
              </label>
              <Button type="submit" disabled={loading || !input.trim()} className="h-auto min-h-[72px] px-5">
                {loading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
