'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle, DollarSign, ExternalLink, Loader, RefreshCw, Zap } from 'lucide-react'
import { fetchRightsizingRecommendations } from '@/lib/api'
import { RightsizingResponse, RightsizingRecommendation } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const PROVIDERS = ['all', 'aws', 'azure', 'gcp', 'oci']
const ACTIONS = ['all', 'downsize', 'terminate', 'reserve', 'modernize']

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtK(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`
  return fmt(n)
}
function fmtDate(v: string | null) {
  if (!v) return 'n/a'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleString()
}

function actionColor(action: string) {
  return {
    downsize: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
    terminate: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300',
    reserve: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300',
    modernize: 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-300',
  }[action] ?? 'border-slate-200 bg-slate-50 text-slate-600'
}

function confidenceColor(c: string) {
  return { high: 'text-emerald-600 dark:text-emerald-400', medium: 'text-amber-600 dark:text-amber-400', low: 'text-rose-600 dark:text-rose-400' }[c] ?? ''
}

function effortColor(e: string) {
  return {
    low: 'text-emerald-600 dark:text-emerald-400',
    medium: 'text-amber-600 dark:text-amber-400',
    high: 'text-rose-600 dark:text-rose-400',
  }[e] ?? 'text-slate-500'
}

function providerColor(p: string) {
  return {
    aws: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300',
    azure: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
    gcp: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
    oci: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300',
  }[p] ?? 'border-slate-200 bg-slate-50 text-slate-600'
}

function resourceConsoleUrl(rec: RightsizingRecommendation): string | null {
  if (rec.resource_console_url) return rec.resource_console_url

  const region = (rec.region || '').trim()
  const normalizedRegion = region && !['global', 'unknown', 'n/a'].includes(region.toLowerCase()) ? region : ''
  if (rec.provider === 'aws') {
    const awsRegion = normalizedRegion || 'us-east-1'
    return `https://${awsRegion}.console.aws.amazon.com/ec2/home?region=${encodeURIComponent(awsRegion)}#Instances:`
  }
  if (rec.provider === 'azure') {
    return 'https://portal.azure.com/#view/HubsExtension/BrowseAllResources'
  }
  if (rec.provider === 'gcp') {
    return 'https://console.cloud.google.com/compute/instances'
  }
  if (rec.provider === 'oci') {
    return normalizedRegion
      ? `https://cloud.oracle.com/compute/instances?region=${encodeURIComponent(normalizedRegion)}`
      : 'https://cloud.oracle.com/compute/instances'
  }
  return null
}

function UtilBar({ label, value }: { label: string; value: number | null }) {
  if (value === null || value === undefined) return null
  const color = value < 20 ? 'bg-rose-400' : value < 40 ? 'bg-amber-400' : 'bg-emerald-400'
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 text-slate-500 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className={`w-10 text-right font-mono ${value < 20 ? 'text-rose-600' : 'text-slate-600'} dark:text-slate-400`}>{value.toFixed(0)}%</span>
    </div>
  )
}

function utilizationHealth(value: number | null): string {
  if (value === null || value === undefined) return 'n/a'
  if (value < 20) return 'very low'
  if (value < 40) return 'low'
  if (value < 70) return 'moderate'
  return 'healthy'
}

function implementationSteps(rec: RightsizingRecommendation): string[] {
  if (rec.action === 'downsize') {
    return [
      `Capture baseline performance for ${rec.resource_name} (CPU, memory, latency) for 7 days.`,
      `Apply right-size change from ${rec.current_size} to ${rec.recommended_size} in a maintenance window.`,
      'Observe workload for one full business cycle and watch for throttling or saturation alerts.',
      'Lock in the change and update capacity guardrails/autoscaling thresholds.',
    ]
  }
  if (rec.action === 'terminate') {
    return [
      `Confirm dependency ownership for ${rec.resource_name} and verify no active traffic.`,
      'Take snapshot/backup and set a short hold period before deletion.',
      'Terminate the resource and monitor error budgets for 24-48h.',
      'Close the action after cost delta appears in billing export.',
    ]
  }
  if (rec.action === 'reserve') {
    return [
      `Validate usage stability for ${rec.resource_name} over at least 14-30 days.`,
      'Select term/payment option matching finance policy and flexibility needs.',
      'Purchase reservation/commitment and map coverage to target workload.',
      'Track realized discount versus baseline on the next billing cycles.',
    ]
  }
  return [
    `Evaluate modernization target replacing ${rec.current_size}.`,
    'Run benchmark/A-B canary with production-like traffic.',
    'Migrate progressively with observability and rollback readiness.',
    'Finalize cutover and remove legacy footprint.',
  ]
}

function rollbackPlan(rec: RightsizingRecommendation): string {
  if (rec.action === 'terminate') {
    return 'Restore from latest snapshot/backup and reattach dependencies if regression is detected.'
  }
  if (rec.action === 'reserve') {
    return 'Keep a mixed on-demand baseline and shift only stable capacity first.'
  }
  return `Revert to ${rec.current_size} and restore previous autoscaling/limits if SLO degradation appears.`
}

function RecCard({ rec }: { rec: RightsizingRecommendation }) {
  const [expanded, setExpanded] = useState(true)
  const consoleUrl = resourceConsoleUrl(rec)
  const aggregateScope = rec.resource_type.toLowerCase().includes('aggregate')
    || rec.evidence_source.includes('cost_trend')
    || rec.evidence_source.includes('imported')
  const monthlyDeltaPct = rec.current_monthly_cost_usd > 0
    ? ((rec.current_monthly_cost_usd - rec.projected_monthly_cost_usd) / rec.current_monthly_cost_usd) * 100
    : 0
  return (
    <Card className="rounded-xl hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex flex-col gap-3">
          {/* Top row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge className={`rounded-md border text-xs ${providerColor(rec.provider)}`}>{rec.provider.toUpperCase()}</Badge>
                <Badge className={`rounded-md border text-xs ${actionColor(rec.action)}`}>{rec.action}</Badge>
                <span className={`text-xs font-medium ${confidenceColor(rec.confidence)}`}>{rec.confidence} confidence</span>
                <span className={`text-xs font-medium ${effortColor(rec.effort)}`}>effort: {rec.effort}</span>
              </div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{rec.resource_name}</p>
              <p className="text-xs text-slate-400 font-mono break-all">{rec.resource_id} · {rec.resource_type} · {rec.region}</p>
              <p className="text-xs text-slate-500 mt-0.5">account: {rec.account_id || 'n/a'}</p>
              {consoleUrl && (
                <a
                  href={consoleUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Open resource in cloud console
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {aggregateScope && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  Scope is account/regional aggregate. Pick exact resource targets before executing changes.
                  {' '}
                  <a href={`/dashboard/inventory?provider=${encodeURIComponent(rec.provider)}&region=${encodeURIComponent(rec.region)}`} className="underline hover:no-underline">
                    Open inventory filtered to this scope
                  </a>
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{fmt(rec.monthly_savings_usd)}<span className="text-xs text-slate-400">/mo</span></p>
              <p className="text-xs text-slate-400">{fmtK(rec.annual_savings_usd)}/yr savings</p>
            </div>
          </div>

          {/* Size change */}
          <div className="flex items-center gap-2 text-sm">
            <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono dark:bg-slate-800">{rec.current_size}</code>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            <code className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-mono text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300">{rec.recommended_size}</code>
            <span className="text-xs text-slate-400 ml-auto">{fmt(rec.current_monthly_cost_usd)} → {fmt(rec.projected_monthly_cost_usd)}</span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-xs">
              <p className="text-slate-500">Evidence</p>
              <p className="font-medium text-slate-800 dark:text-slate-200">
                {rec.evidence_source.replace(/_/g, ' ')} · {rec.analysis_points} points
              </p>
              <p className="text-slate-500 mt-0.5">
                Trend: {rec.trend_percent >= 0 ? '+' : ''}{rec.trend_percent.toFixed(2)}% ({fmt(rec.trend_slope_usd)}/period)
              </p>
            </div>
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-xs">
              <p className="text-slate-500">Observed</p>
              <p className="font-medium text-slate-800 dark:text-slate-200">{fmtDate(rec.last_observed_at)}</p>
              <p className="text-slate-500 mt-0.5">
                Latest: {rec.latest_monthly_cost_usd !== null ? fmt(rec.latest_monthly_cost_usd) : 'n/a'} · Peak: {rec.peak_monthly_cost_usd !== null ? fmt(rec.peak_monthly_cost_usd) : 'n/a'}
              </p>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-xs">
            <p className="text-slate-500">Why this is recommended</p>
            <p className="font-medium text-slate-800 dark:text-slate-200 line-clamp-2">{rec.reason}</p>
          </div>

          {(rec.regional_breakdown?.length ?? 0) > 0 && (
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-xs">
              <p className="text-slate-500 mb-1">Regional cost breakdown</p>
              <div className="space-y-1">
                {(rec.regional_breakdown ?? []).slice(0, 4).map((row) => (
                  <div key={`${rec.resource_id}-${row.region}`} className="flex items-center justify-between">
                    <span className="text-slate-700 dark:text-slate-200">{row.region}</span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {fmt(row.monthly_cost_usd)} ({row.share_percent.toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {rec.top_regions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-slate-500 mr-1">Top regions:</span>
              {rec.top_regions.slice(0, 4).map((region) => (
                <Badge key={region} variant="outline" className="rounded-md text-[11px]">
                  {region}
                </Badge>
              ))}
            </div>
          )}

          {rec.risk_note && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              {rec.risk_note}
            </div>
          )}

          {/* Utilization bars */}
          {(rec.cpu_utilization_avg_percent !== null || rec.memory_utilization_avg_percent !== null) && (
            <div className="space-y-1">
              <UtilBar label="CPU" value={rec.cpu_utilization_avg_percent} />
              <UtilBar label="Memory" value={rec.memory_utilization_avg_percent} />
            </div>
          )}

          {/* Expand button */}
          <button onClick={() => setExpanded(e => !e)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline text-left">
            {expanded ? 'Hide full details ▲' : 'Show full details ▼'}
          </button>
          {expanded && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-xs text-slate-600 dark:text-slate-400 space-y-3">
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Recommendation rationale</p>
                <p>{rec.reason}</p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2">
                  <p className="text-slate-500">Current monthly cost</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{fmt(rec.current_monthly_cost_usd)}</p>
                </div>
                <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2">
                  <p className="text-slate-500">Projected monthly cost</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{fmt(rec.projected_monthly_cost_usd)}</p>
                </div>
                <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2">
                  <p className="text-slate-500">Monthly savings rate</p>
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">{monthlyDeltaPct.toFixed(1)}%</p>
                </div>
                <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2">
                  <p className="text-slate-500">Annualized opportunity</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{fmt(rec.annual_savings_usd)}</p>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 space-y-1">
                <p className="font-semibold text-slate-800 dark:text-slate-200">Utilization interpretation</p>
                <p>CPU: {rec.cpu_utilization_avg_percent?.toFixed(1) ?? 'n/a'}% ({utilizationHealth(rec.cpu_utilization_avg_percent)})</p>
                <p>Memory: {rec.memory_utilization_avg_percent?.toFixed(1) ?? 'n/a'}% ({utilizationHealth(rec.memory_utilization_avg_percent)})</p>
              </div>

              <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2">
                <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Execution steps</p>
                <ol className="list-decimal pl-4 space-y-1">
                  {implementationSteps(rec).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>

              <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 space-y-1">
                <p className="font-semibold text-slate-800 dark:text-slate-200">Validation and rollback</p>
                <p>Validation window: monitor SLOs and utilization for 24-72h after change.</p>
                <p>Rollback plan: {rollbackPlan(rec)}</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function RightsizingPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<RightsizingResponse | null>(null)
  const [provider, setProvider] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [minSavings, setMinSavings] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchRightsizingRecommendations({ provider, min_savings: minSavings, limit: 200 }))
    } finally {
      setLoading(false)
    }
  }, [provider, minSavings])

  useEffect(() => { void load() }, [load])

  const filtered = data?.recommendations.filter(r => actionFilter === 'all' || r.action === actionFilter) ?? []

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-md">Resource-Level Rightsizing</Badge>
            <Badge variant="outline" className="rounded-md border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950/30">Instance · Volume · Service</Badge>
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Rightsizing</h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-3xl">
            Per-resource optimization recommendations from live provider inventory and utilization signals. Downsize idle instances, clean unattached boot/block volumes, convert stable workloads to reserved capacity, or migrate to newer generations.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} className="rounded-lg">
          <RefreshCw className="mr-2 h-4 w-4" />Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
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
              {p === 'all' ? 'All' : p.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 ml-4">
          {ACTIONS.map(a => (
            <button
              key={a}
              onClick={() => setActionFilter(a)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition capitalize ${
                actionFilter === a
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {a === 'all' ? 'All actions' : a}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <label className="shrink-0">Min savings $</label>
          <input
            type="number"
            min="0"
            value={minSavings}
            onChange={e => setMinSavings(Number(e.target.value))}
            className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <span className="text-xs text-slate-400">/mo</span>
        </div>
      </div>

      {/* KPI strip */}
      {data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Resources Analyzed', value: data.total_resources_analyzed.toLocaleString(), icon: Zap, color: 'from-blue-500 to-blue-600' },
            { label: 'Rightsizable', value: data.rightsizable_count.toLocaleString(), icon: AlertTriangle, color: 'from-amber-500 to-amber-600' },
            { label: 'Monthly Savings', value: fmtK(data.total_monthly_savings_usd), icon: DollarSign, color: 'from-emerald-500 to-emerald-600' },
            { label: 'Annual Opportunity', value: fmtK(data.total_annual_savings_usd), icon: CheckCircle, color: 'from-indigo-500 to-indigo-600' },
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
      )}

      {/* Action breakdown */}
      {data && filtered.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-4">
          {ACTIONS.filter(a => a !== 'all').map(action => {
            const count = data.recommendations.filter(r => r.action === action).length
            const savings = data.recommendations.filter(r => r.action === action).reduce((s, r) => s + r.monthly_savings_usd, 0)
            return (
              <button
                key={action}
                onClick={() => setActionFilter(actionFilter === action ? 'all' : action)}
                className={`rounded-xl border p-3 text-left transition hover:shadow-sm ${actionFilter === action ? 'ring-2 ring-blue-500' : ''} ${actionColor(action)}`}
              >
                <p className="text-sm font-semibold capitalize">{action}</p>
                <p className="text-xs mt-1">{count} resource{count !== 1 ? 's' : ''}</p>
                <p className="text-xs font-mono mt-0.5">{fmtK(savings)}/mo</p>
              </button>
            )
          })}
        </div>
      )}

      {/* Recommendations grid */}
      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center text-slate-500">
          <Loader className="h-6 w-6 animate-spin mr-2" /> Analyzing resources...
        </div>
      ) : filtered.length > 0 ? (
        <>
          {data && (
            <p className="text-sm text-slate-500">
              Showing {filtered.length} of {data.rightsizable_count} recommendations · data source: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{data.data_source}</code>
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map(rec => <RecCard key={`${rec.provider}-${rec.resource_id}-${rec.region}-${rec.action}`} rec={rec} />)}
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <CheckCircle className="mx-auto h-10 w-10 text-emerald-400 mb-3" />
          <p className="text-sm text-slate-500">
            {data && data.total_resources_analyzed > 0
              ? 'No rightsizing opportunities found with current filters — your resources are well-sized!'
              : 'Connect cloud providers and run a scan to surface per-resource rightsizing opportunities.'}
          </p>
        </div>
      )}

      {/* Info callout */}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200">
        <strong>How rightsizing works:</strong> Optiora combines live provider inventory, provider recommendation APIs, cost trends, and utilization signals. Storage cleanup actions such as unattached boot/block volumes are included alongside VM downsize and commitment opportunities.
      </div>
    </div>
  )
}
