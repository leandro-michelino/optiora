'use client'

import type { FormEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Calculator,
  CircleDollarSign,
  Download,
  Gauge,
  Layers3,
  Loader,
  RefreshCw,
  TrendingDown,
  Zap,
} from 'lucide-react'
import { fetchUnitEconomicsCockpit, recordUnitEconomicsMetric, downloadFocusCsv } from '@/lib/api'
import { UnitEconomicsCockpitResponse, UnitEconomicsMetricResult } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Expander } from '@/components/ui/expander'

const PROVIDERS = ['all', 'aws', 'azure', 'gcp', 'oci']
type SpendPoint = { month: string; cost_usd: number }

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function fmtPrecise(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtCompact(n: number) {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: Math.abs(n) >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(n) >= 10000 ? 1 : 0,
  })
}

function fmtDate(value?: string) {
  if (!value) return 'Not available'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not available'
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function providerLabel(provider: string) {
  return provider === 'all' ? 'All providers' : provider.toUpperCase()
}

function efficiencyTone(score: number) {
  if (score >= 80) return { label: 'Strong', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' }
  if (score >= 60) return { label: 'Watch', cls: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300' }
  return { label: 'Needs action', cls: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300' }
}

function StatTile({
  icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  helper: string
  tone: 'blue' | 'emerald' | 'amber' | 'rose'
}) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
    rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300',
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{value}</p>
        </div>
        <span className={`rounded-lg border p-2 ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-3 text-sm leading-5 text-slate-500 dark:text-slate-400">{helper}</p>
    </div>
  )
}

function ProviderBadge({ provider }: { provider: string }) {
  const colors: Record<string, string> = {
    aws: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300',
    azure: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
    gcp: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
    oci: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300',
  }
  const cls = colors[provider.toLowerCase()] ?? 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
  return <Badge className={`rounded-md border text-xs ${cls}`}>{provider.toUpperCase()}</Badge>
}

function MiniSpendTrend({ points }: { points: SpendPoint[] }) {
  if (points.length <= 1) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
        <BarChart3 className="mx-auto mb-3 h-8 w-8 text-slate-400" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">One period available</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Run another scan or import another month to show a trend.</p>
      </div>
    )
  }

  const maxCost = Math.max(...points.map((point) => point.cost_usd), 1)

  return (
    <div className="h-44">
      <div className="flex h-36 items-end gap-2">
        {points.map((point) => {
          const height = Math.max(10, (point.cost_usd / maxCost) * 100)
          return (
            <div key={point.month} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-blue-600 to-sky-400"
                style={{ height: `${height}%` }}
                title={`${point.month}: ${fmtPrecise(point.cost_usd)}`}
              />
              <span className="max-w-full truncate text-xs text-slate-500 dark:text-slate-400">{point.month}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function UnitEconomicsPage() {
  const [loading, setLoading] = useState(true)
  const [provider, setProvider] = useState('all')
  const [data, setData] = useState<UnitEconomicsCockpitResponse | null>(null)
  const [metricName, setMetricName] = useState('')
  const [metricValue, setMetricValue] = useState('')
  const [metricUnit, setMetricUnit] = useState('units')
  const [metricResult, setMetricResult] = useState<UnitEconomicsMetricResult | null>(null)
  const [metricLoading, setMetricLoading] = useState(false)
  const [focusDownloading, setFocusDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchUnitEconomicsCockpit(provider)
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load unit economics data.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [provider])

  useEffect(() => { void load() }, [load])

  async function handleMetricSubmit(event: FormEvent) {
    event.preventDefault()
    const val = parseFloat(metricValue)
    if (!metricName || Number.isNaN(val) || val <= 0) return
    setMetricLoading(true)
    try {
      const res = await recordUnitEconomicsMetric({ metric_name: metricName, metric_value: val, metric_unit: metricUnit })
      setMetricResult(res)
    } finally {
      setMetricLoading(false)
    }
  }

  async function handleFocusDownload() {
    setFocusDownloading(true)
    try {
      await downloadFocusCsv(provider)
    } finally {
      setFocusDownloading(false)
    }
  }

  const historicalSpend: SpendPoint[] = (data?.historical_monthly_spend || [])
    .map((point, index) => {
      if (typeof point === 'number') {
        return {
          month: index === 0 ? 'Current' : `Period ${index + 1}`,
          cost_usd: point,
        }
      }
      return {
        month: point.month || `Period ${index + 1}`,
        cost_usd: Number(point.cost_usd || 0),
      }
    })
    .filter((point) => Number.isFinite(point.cost_usd))

  const bestProvider = useMemo(() => {
    if (!data?.provider_metrics.length) return null
    return [...data.provider_metrics].sort((a, b) => b.efficiency_index - a.efficiency_index)[0]
  }, [data])

  const largestWasteProvider = useMemo(() => {
    if (!data?.provider_metrics.length) return null
    return [...data.provider_metrics].sort((a, b) => b.estimated_waste_usd - a.estimated_waste_usd)[0]
  }, [data])

  const summary = data?.summary
  const tone = summary ? efficiencyTone(summary.dollar_efficiency_score || 0) : null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-4xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-md">FinOps Foundation</Badge>
            <Badge variant="outline" className="rounded-md border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30">FOCUS-ready</Badge>
            <Badge variant="outline" className="rounded-md">Updated {fmtDate(data?.generated_at)}</Badge>
          </div>
          <h1 className="text-3xl font-semibold text-slate-950 dark:text-white md:text-4xl">Unit Economics Cockpit</h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-400">
            Translate cloud spend into business-unit cost, waste rate, provider efficiency, and exportable FOCUS data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => void handleFocusDownload()} disabled={focusDownloading}>
            {focusDownloading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            FOCUS CSV
          </Button>
        </div>
      </div>

      <Expander
        title="Provider scope"
        description={`Current scope: ${providerLabel(provider)}. Change the scope to compare one cloud or all connected providers.`}
        icon={<Layers3 className="h-5 w-5 text-blue-600" />}
      >
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((item) => (
            <button
              key={item}
              onClick={() => setProvider(item)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                provider === item
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {providerLabel(item)}
            </button>
          ))}
        </div>
      </Expander>

      {loading ? (
        <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          <Loader className="mr-2 h-6 w-6 animate-spin" /> Loading unit economics...
        </div>
      ) : data && summary ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTile
              icon={<CircleDollarSign className="h-5 w-5" />}
              label="Monthly Spend"
              value={fmt(summary.total_monthly_cost_usd)}
              helper={`${providerLabel(provider)} cloud spend in the current scope`}
              tone="blue"
            />
            <StatTile
              icon={<TrendingDown className="h-5 w-5" />}
              label="Estimated Waste"
              value={fmt(summary.estimated_waste_usd)}
              helper={`${summary.waste_to_spend_percent.toFixed(1)}% of spend is flagged`}
              tone={summary.estimated_waste_usd > 0 ? 'rose' : 'emerald'}
            />
            <StatTile
              icon={<Gauge className="h-5 w-5" />}
              label="Efficiency Score"
              value={`${(summary.dollar_efficiency_score || 0).toFixed(1)}`}
              helper={`${tone?.label ?? 'Not scored'} dollar efficiency posture`}
              tone={(summary.dollar_efficiency_score || 0) >= 80 ? 'emerald' : 'amber'}
            />
            <StatTile
              icon={<Zap className="h-5 w-5" />}
              label="Identified Savings"
              value={fmt(summary.identified_savings_usd || 0)}
              helper="Prioritized savings opportunity currently detected"
              tone="emerald"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Executive Readout</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">Efficiency posture is {tone?.label.toLowerCase() ?? 'not scored'}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                    {largestWasteProvider
                      ? `${largestWasteProvider.provider.toUpperCase()} carries the largest waste signal at ${fmtPrecise(largestWasteProvider.estimated_waste_usd)}.`
                      : 'No provider waste signal is available yet.'}
                    {bestProvider ? ` Best provider efficiency is ${bestProvider.provider.toUpperCase()} at ${bestProvider.efficiency_index.toFixed(0)}%.` : ''}
                  </p>
                </div>
                {tone && (
                  <Badge className={`rounded-md border ${tone.cls}`}>
                    {tone.label}
                  </Badge>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Next Best Action</p>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                Add a business metric below to convert cloud spend into cost per customer, request, transaction, workload, or any operating unit your team manages.
              </p>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_0.75fr]">
            <Expander
              title="Provider efficiency breakdown"
              description="Compare spend share, waste signal, and efficiency by provider."
              icon={<BarChart3 className="h-5 w-5 text-blue-600" />}
              defaultOpen
            >
              {data.provider_metrics.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Connect cloud providers and run a scan to populate per-provider metrics.</p>
              ) : (
                <div className="space-y-4">
                  {data.provider_metrics.map((metric) => {
                    const providerTone = efficiencyTone(metric.efficiency_index)
                    return (
                      <div key={metric.provider} className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-center gap-3">
                            <ProviderBadge provider={metric.provider} />
                            <div>
                              <p className="font-semibold text-slate-950 dark:text-white">{fmtPrecise(metric.cost_usd)}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{metric.share_percent.toFixed(1)}% of scoped spend</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-rose-600 dark:text-rose-400">{fmtPrecise(metric.estimated_waste_usd)} waste</span>
                            <Badge className={`rounded-md border ${providerTone.cls}`}>Efficiency {metric.efficiency_index.toFixed(0)}%</Badge>
                          </div>
                        </div>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                            style={{ width: `${Math.min(Math.max(metric.share_percent, 2), 100)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Expander>

            <Expander
              title="Cost-per-unit calculator"
              description={data.business_metrics_hint || 'Use a business volume to calculate unit cost.'}
              icon={<Calculator className="h-5 w-5 text-emerald-600" />}
              defaultOpen
            >
              <form onSubmit={(event) => void handleMetricSubmit(event)} className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Business metric</span>
                  <input
                    type="text"
                    value={metricName}
                    onChange={(event) => setMetricName(event.target.value)}
                    placeholder="customers, requests, transactions"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Volume this month</span>
                  <input
                    type="number"
                    min="1"
                    value={metricValue}
                    onChange={(event) => setMetricValue(event.target.value)}
                    placeholder="50000"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Unit label</span>
                  <input
                    type="text"
                    value={metricUnit}
                    onChange={(event) => setMetricUnit(event.target.value)}
                    placeholder="units"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <Button type="submit" disabled={metricLoading} className="w-full">
                  {metricLoading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                  Calculate Unit Cost
                </Button>
              </form>

              {metricResult && (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Calculated unit cost</p>
                  <p className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-300">{metricResult.cost_per_unit_label}</p>
                  <p className="mt-2 text-sm leading-5 text-emerald-700 dark:text-emerald-300">{metricResult.benchmark_note}</p>
                </div>
              )}
            </Expander>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.65fr]">
            <Expander
              title="Monthly spend trend"
              description={historicalSpend.length > 1 ? 'Compact monthly trend from available scan/import history.' : 'Trend appears after another period is available.'}
              icon={<TrendingDown className="h-5 w-5 text-amber-600" />}
            >
              <MiniSpendTrend points={historicalSpend} />
            </Expander>

            <Expander
              title="FOCUS export"
              description="Download scoped costs in FinOps Open Cost and Usage Specification format."
              icon={<Download className="h-5 w-5 text-blue-600" />}
            >
              <div className="space-y-4">
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
                  Export the current provider scope as FOCUS CSV for finance, analytics, and FinOps tooling.
                </p>
                <Button variant="outline" onClick={() => void handleFocusDownload()} disabled={focusDownloading}>
                  {focusDownloading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Download FOCUS CSV
                </Button>
              </div>
            </Expander>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          {error || 'Could not load unit economics data. Check backend connectivity.'}
        </div>
      )}
    </div>
  )
}
