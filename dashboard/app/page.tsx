"use client";

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  BarChart3,
  Box,
  CheckCircle2,
  Cloud,
  PauseCircle,
  PlayCircle,
  Search,
  Server,
  ShieldCheck,
  TrendingDown,
  Zap,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

type PreviewScene = 'overview' | 'inventory' | 'kubernetes'

function useCountUp(target: number, duration = 1400): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let start: number | null = null
    const step = (timestamp: number) => {
      if (!start) start = timestamp
      const progress = Math.min((timestamp - start) / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.floor(eased * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    const raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return reducedMotion
}

const PROVIDERS = [
  { name: 'AWS', color: 'from-amber-400 to-orange-500', cost: 68 },
  { name: 'Azure', color: 'from-blue-400 to-blue-600', cost: 45 },
  { name: 'GCP', color: 'from-emerald-400 to-emerald-600', cost: 31 },
  { name: 'OCI', color: 'from-rose-400 to-rose-600', cost: 24 },
]

const INVENTORY_ROWS = [
  { name: 'payments-api-prod', type: 'compute', provider: 'AWS', region: 'us-east-1', cost: '$1,420/mo', status: 'waste-flag' },
  { name: 'events-blob-archive', type: 'storage', provider: 'Azure', region: 'westeurope', cost: '$320/mo', status: 'healthy' },
  { name: 'realtime-cache-a', type: 'database', provider: 'GCP', region: 'us-central1', cost: '$780/mo', status: 'healthy' },
]

const K8S_NAMESPACES = [
  { name: 'payments', share: 42, cost: '$3,860', pods: 38 },
  { name: 'core-platform', share: 31, cost: '$2,920', pods: 24 },
  { name: 'ai-services', share: 17, cost: '$1,570', pods: 19 },
  { name: 'ops', share: 10, cost: '$930', pods: 11 },
]

const PREVIEW_SCENES: Array<{
  id: PreviewScene
  label: string
  metric: string
  detail: string
  icon: typeof BarChart3
}> = [
  {
    id: 'overview',
    label: 'Overview',
    metric: '$14.3k found',
    detail: 'Provider mix, anomaly count, and efficiency score',
    icon: BarChart3,
  },
  {
    id: 'inventory',
    label: 'Cloud Resources',
    metric: '1 flag',
    detail: 'Resource costs grouped by provider, type, region, account, and waste signal',
    icon: Server,
  },
  {
    id: 'kubernetes',
    label: 'Kubernetes',
    metric: '$9.3k tracked',
    detail: 'OpenCost allocation with namespace and pod context',
    icon: Box,
  },
]

function AnimatedBar({ pct, color, delay }: { pct: number; color: string; delay: string }) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 100)
    return () => clearTimeout(t)
  }, [pct])
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-200/60 dark:bg-slate-700">
      <div
        className={`h-2 rounded-full bg-gradient-to-r ${color} transition-all`}
        style={{ width: `${width}%`, transitionDuration: '900ms', transitionDelay: delay }}
      />
    </div>
  )
}

export default function Home() {
  const { authEnabled, isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const savingsCount = useCountUp(34)
  const providerCount = useCountUp(4, 800)
  const alertCount = useCountUp(127, 1200)
  const [activeScene, setActiveScene] = useState<PreviewScene>('overview')
  const [previewPaused, setPreviewPaused] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (!loading && (!authEnabled || isAuthenticated)) {
      router.push('/dashboard')
    }
  }, [authEnabled, isAuthenticated, loading, router])

  useEffect(() => {
    if (previewPaused || reducedMotion) return
    const order = PREVIEW_SCENES.map(scene => scene.id)
    const timer = setInterval(() => {
      setActiveScene(prev => {
        const idx = order.indexOf(prev)
        return order[(idx + 1) % order.length]
      })
    }, 3500)

    return () => clearInterval(timer)
  }, [previewPaused, reducedMotion])

  const activeSceneMeta = PREVIEW_SCENES.find(scene => scene.id === activeScene) || PREVIEW_SCENES[0]
  const ActiveSceneIcon = activeSceneMeta.icon
  const PreviewStatusIcon = previewPaused || reducedMotion ? PlayCircle : PauseCircle

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
              <Cloud className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">OptiOra</span>
          </div>
          <div className="flex items-center gap-2">
            {authEnabled ? (
              <>
                <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                  Sign In
                </Link>
                <Link href="/signup" className="btn-primary rounded-lg text-sm">
                  Get Started
                </Link>
              </>
            ) : (
              <Link href="/dashboard" className="btn-primary rounded-lg text-sm">
                Open Dashboard
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 pt-20 pb-12 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 mb-6">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
          </span>
          Live FinOps Intelligence
        </div>

        <h1 className="text-5xl md:text-6xl font-bold text-slate-900 dark:text-white mb-5 leading-tight tracking-tight">
          Multi-Cloud Cost
          <span className="block bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 bg-clip-text text-transparent">
            Optimization
          </span>
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
          Unified visibility and control over your AWS, Azure, GCP, and OCI cloud costs — with AI-powered savings detection.
        </p>

        {/* Animated stats */}
        <div className="flex justify-center gap-8 md:gap-16 mb-10">
          <div className="text-center">
            <div className="text-4xl font-bold text-blue-600 dark:text-blue-400">{savingsCount}%</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">avg. savings identified</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">{providerCount}</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">cloud providers</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-violet-600 dark:text-violet-400">{alertCount}+</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">anomalies caught / mo</div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={authEnabled ? "/signup" : "/dashboard"}
            className="inline-flex items-center gap-2 btn-primary rounded-lg px-6 py-3 text-base font-semibold shadow-lg shadow-blue-500/25 transition hover:shadow-blue-500/40"
          >
            {authEnabled ? "Get Started free" : "Open Dashboard"} <ArrowRight className="h-5 w-5" />
          </Link>
          <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white/80 px-3 py-2 text-sm font-medium text-emerald-700 shadow-sm dark:border-emerald-900 dark:bg-slate-900/70 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            CSV fallback and live providers ready
          </span>
        </div>
      </section>

      {/* Live preview mockup */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <div
          className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900"
          onMouseEnter={() => setPreviewPaused(true)}
          onMouseLeave={() => setPreviewPaused(false)}
          onFocus={() => setPreviewPaused(true)}
          onBlur={() => setPreviewPaused(false)}
        >
          {/* Mock window chrome */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <span className="h-3 w-3 rounded-full bg-rose-400" />
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="h-3 w-3 rounded-full bg-emerald-400" />
            <span className="ml-2 text-xs font-medium text-slate-500 dark:text-slate-400 sm:ml-4">OptiOra Command Center</span>
            <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live preview
            </span>
          </div>
          <div className="p-6">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <ActiveSceneIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  {activeSceneMeta.label}
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{activeSceneMeta.detail}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                  {activeSceneMeta.metric}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <PreviewStatusIcon className="h-3.5 w-3.5" />
                  {previewPaused || reducedMotion ? 'Paused' : 'Cycling'}
                </span>
              </div>
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {PREVIEW_SCENES.map(scene => {
                const Icon = scene.icon
                const active = activeScene === scene.id
                return (
                  <button
                    key={scene.id}
                    onClick={() => setActiveScene(scene.id)}
                    aria-pressed={active}
                    className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {scene.label}
                  </button>
                )
              })}
            </div>

            <div className="min-h-[360px] sm:min-h-[310px]">
            {activeScene === 'overview' && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: 'Monthly Cost', value: '$42,180', color: 'from-blue-500 to-blue-600' },
                    { label: 'Savings Found', value: '$14,300', color: 'from-emerald-500 to-emerald-600' },
                    { label: 'Active Anomalies', value: '3', color: 'from-rose-500 to-rose-600' },
                    { label: 'Efficiency Score', value: '78.4', color: 'from-violet-500 to-violet-600' },
                  ].map((card, i) => (
                    <div
                      key={card.label}
                      className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40"
                      style={{ animationDelay: `${i * 120}ms` }}
                    >
                      <div className={`mb-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${card.color}`}>
                        <BarChart3 className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="text-lg font-bold text-slate-900 dark:text-white">{card.value}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{card.label}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-slate-100 p-4 dark:border-slate-800">
                  <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Provider Cost Distribution</div>
                  <div className="space-y-3">
                    {PROVIDERS.map((p, i) => (
                      <div key={p.name} className="flex items-center gap-3">
                        <div className="w-10 text-xs font-medium text-slate-500 dark:text-slate-400">{p.name}</div>
                        <div className="flex-1">
                          <AnimatedBar pct={p.cost} color={p.color} delay={`${i * 150}ms`} />
                        </div>
                        <div className="w-8 text-right text-xs font-medium text-slate-700 dark:text-slate-300">{p.cost}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeScene === 'inventory' && (
              <div className="rounded-lg border border-slate-100 p-4 dark:border-slate-800">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">Resource Inventory (Live)</div>
                  <div className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <Search className="h-3 w-3" /> prod and waste_only
                  </div>
                </div>
                <div className="space-y-2">
                  {INVENTORY_ROWS.map((row) => (
                    <div key={row.name} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700 sm:grid-cols-12 sm:items-center">
                      <div className="font-medium text-slate-900 dark:text-white sm:col-span-4">{row.name}</div>
                      <div className="text-slate-500 sm:col-span-2">{row.type}</div>
                      <div className="text-slate-500 sm:col-span-2">{row.provider}</div>
                      <div className="text-slate-500 sm:col-span-2">{row.region}</div>
                      <div className="flex items-center justify-between gap-2 sm:col-span-2 sm:justify-end sm:text-right">
                        <span className="font-semibold text-slate-900 dark:text-white">{row.cost}</span>
                        <span className={`ml-2 rounded px-1.5 py-0.5 ${row.status === 'waste-flag' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                          {row.status === 'waste-flag' ? 'flag' : 'ok'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeScene === 'kubernetes' && (
              <div className="rounded-lg border border-slate-100 p-4 dark:border-slate-800">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">Kubernetes Namespace Breakdown</div>
                  <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                    OpenCost sync active
                  </span>
                </div>
                <div className="space-y-3">
                  {K8S_NAMESPACES.map((ns, i) => (
                    <div key={ns.name}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-800 dark:text-slate-200">{ns.name}</span>
                        <span className="text-slate-500">{ns.cost} | {ns.pods} pods</span>
                      </div>
                      <AnimatedBar pct={ns.share} color="from-cyan-500 to-indigo-500" delay={`${i * 120}ms`} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="max-w-7xl mx-auto px-4 pb-24">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="group rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-sm">
              <TrendingDown className="h-6 w-6 text-white" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">Anomaly Detection</h3>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Catch unusual spending patterns and cost spikes instantly before they impact your budget.
            </p>
          </div>

          <div className="group rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 shadow-sm">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">AI-Powered Recommendations</h3>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Get OCI GenAI-driven savings suggestions ranked by ROI — with actionable implementation guidance.
            </p>
          </div>

          <div className="group rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-indigo-600 shadow-sm">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">Finance-Grade Reporting</h3>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Multi-sheet Excel workbooks, PDF digests, and tokenized read-only share links for finance teams.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-sm text-slate-500 dark:text-slate-500">
          <div className="space-y-1 text-center md:text-left">
            <div className="flex items-center justify-center gap-2 md:justify-start">
              <Cloud className="h-4 w-4" />
              <span>OptiOra — Intelligent Cloud Cost Management</span>
            </div>
            <p>Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot</p>
          </div>
          <div className="flex gap-6">
            <Link href="/dashboard" className="hover:text-slate-700 dark:hover:text-slate-300 transition">Dashboard</Link>
            <Link href="/login" className="hover:text-slate-700 dark:hover:text-slate-300 transition">Sign In</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
