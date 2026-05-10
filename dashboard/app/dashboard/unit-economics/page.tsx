'use client'

import { useCallback, useEffect, useState } from 'react'
import { BarChart3, DollarSign, Download, Loader, RefreshCw, TrendingDown, Zap } from 'lucide-react'
import { fetchUnitEconomicsCockpit, recordUnitEconomicsMetric, downloadFocusCsv } from '@/lib/api'
import { UnitEconomicsCockpitResponse, UnitEconomicsMetricResult } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const PROVIDERS = ['all', 'aws', 'azure', 'gcp', 'oci']
type SpendPoint = { month: string; cost_usd: number }

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
function fmtPrecise(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

  async function handleMetricSubmit(e: React.FormEvent) {
    e.preventDefault()
    const val = parseFloat(metricValue)
    if (!metricName || isNaN(val) || val <= 0) return
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-md">FinOps Foundation — Unit Economics</Badge>
            <Badge variant="outline" className="rounded-md border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30">FOCUS-Ready</Badge>
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Unit Economics Cockpit</h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-3xl">
            Track cost per business unit, waste-to-spend ratio, and provider efficiency. Enter a business metric (customers, requests, transactions) to calculate cost per unit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void load()} className="rounded-lg">
            <RefreshCw className="mr-2 h-4 w-4" />Refresh
          </Button>
          <Button variant="outline" onClick={() => void handleFocusDownload()} disabled={focusDownloading} className="rounded-lg">
            {focusDownloading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            FOCUS Export
          </Button>
        </div>
      </div>

      {/* Provider filter */}
      <div className="flex flex-wrap gap-2">
        {PROVIDERS.map(p => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              provider === p
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {p === 'all' ? 'All Providers' : p.toUpperCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center text-slate-500">
          <Loader className="h-6 w-6 animate-spin mr-2" /> Loading unit economics...
        </div>
      ) : data ? (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Monthly Cloud Spend', value: fmt(data.summary.total_monthly_cost_usd), icon: DollarSign, color: 'from-blue-500 to-blue-600' },
              { label: 'Estimated Waste', value: fmt(data.summary.estimated_waste_usd), icon: TrendingDown, color: 'from-rose-500 to-rose-600' },
              { label: 'Waste-to-Spend', value: `${data.summary.waste_to_spend_percent.toFixed(1)}%`, icon: BarChart3, color: 'from-amber-500 to-amber-600' },
              { label: 'Dollar Efficiency Score', value: `${(data.summary.dollar_efficiency_score || 0).toFixed(1)}`, icon: Zap, color: 'from-emerald-500 to-emerald-600' },
            ].map(kpi => {
              const Icon = kpi.icon
              return (
                <Card key={kpi.label} className="rounded-xl overflow-hidden">
                  <CardContent className="p-0">
                    <div className={`bg-gradient-to-br ${kpi.color} p-4 text-white`}>
                      <Icon className="h-5 w-5 mb-2 opacity-80" />
                      <p className="text-2xl font-bold">{kpi.value}</p>
                      <p className="text-xs opacity-80 mt-1">{kpi.label}</p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Provider breakdown + business metric form */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Provider metrics */}
            <Card className="xl:col-span-2">
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle>Provider Efficiency Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                {data.provider_metrics.length === 0 ? (
                  <p className="text-sm text-slate-500">Connect cloud providers and run a scan to populate per-provider metrics.</p>
                ) : (
                  data.provider_metrics.map(pm => (
                    <div key={pm.provider} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold uppercase">{pm.provider}</span>
                        <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400">
                          <span>{fmtPrecise(pm.cost_usd)}</span>
                          <span className="text-rose-600 dark:text-rose-400">~{fmtPrecise(pm.estimated_waste_usd)} waste</span>
                          <Badge variant="outline" className="rounded-md text-xs">
                            Efficiency {pm.efficiency_index.toFixed(0)}%
                          </Badge>
                        </div>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
                          style={{ width: `${Math.min(pm.share_percent, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-400">{pm.share_percent.toFixed(1)}% of total cloud spend</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Business metric calculator */}
            <Card>
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="text-base">Cost-Per-Unit Calculator</CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <form onSubmit={(e) => void handleMetricSubmit(e)} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Business Metric</label>
                    <input
                      type="text"
                      value={metricName}
                      onChange={e => setMetricName(e.target.value)}
                      placeholder="e.g. customers, requests"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Volume (this month)</label>
                    <input
                      type="number"
                      min="1"
                      value={metricValue}
                      onChange={e => setMetricValue(e.target.value)}
                      placeholder="e.g. 50000"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Unit Label</label>
                    <input
                      type="text"
                      value={metricUnit}
                      onChange={e => setMetricUnit(e.target.value)}
                      placeholder="units"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                  <Button type="submit" disabled={metricLoading} className="w-full rounded-lg">
                    {metricLoading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Calculate
                  </Button>
                </form>

                {metricResult && (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                    <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Result</p>
                    <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300">{metricResult.cost_per_unit_label}</p>
                    <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">{metricResult.benchmark_note}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Historical trend */}
          {historicalSpend.length > 0 && (
            <Card>
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle>Monthly Spend History</CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="flex items-end gap-2 h-28">
                  {historicalSpend.map((point, i) => {
                    const maxCost = Math.max(...historicalSpend.map(p => p.cost_usd), 1)
                    const height = Math.max(8, (point.cost_usd / maxCost) * 100)
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-blue-600 to-blue-400 transition-all"
                          style={{ height: `${height}%` }}
                          title={fmtPrecise(point.cost_usd)}
                        />
                        <span className="text-xs text-slate-400">{point.month}</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* FOCUS info */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
            <strong>FOCUS Export:</strong> Download your costs in FinOps Open Cost and Usage Specification (FOCUS 1.0) format — the industry-standard schema supported by Harness, Vantage, and all FinOps-certified platforms.
            <button
              onClick={() => void handleFocusDownload()}
              disabled={focusDownloading}
              className="ml-3 underline hover:no-underline disabled:opacity-50"
            >
              {focusDownloading ? 'Downloading…' : 'Download FOCUS CSV'}
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          {error || 'Could not load unit economics data. Check backend connectivity.'}
        </div>
      )}
    </div>
  )
}
