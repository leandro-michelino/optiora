'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cloud,
  DollarSign,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Layers3,
  Network,
  RefreshCw,
  Server,
  ShieldCheck,
  Tag,
  Target,
} from 'lucide-react'
import { CostChart } from '@/components/CostChart'
import { DataSourceBanner } from '@/components/DataSourceBanner'
import { MonthlyComparisonCard } from '@/components/MonthlyComparisonCard'
import { ServiceBreakdown, ServiceBreakdownPoint } from '@/components/ServiceBreakdown'
import { MetricCard } from '@/components/MetricCard'
import {
  fetchAllocationCoverage,
  fetchAnomalies,
  fetchApiHealth,
  fetchApiInfo,
  fetchChargeback,
  fetchCloudWasteAnalytics,
  fetchCommitmentGap,
  fetchCostsStrict,
  fetchCredentials,
  fetchEfficiencyScore,
  fetchFinOpsAnalytics,
  fetchImportedCostSummary,
  fetchProviderAccountRollups,
  fetchProviderDiagnostics,
  fetchRecommendations,
  fetchScanningPermission,
  fetchCostTrend,
} from '@/lib/api'
import { buildCostDataSourceStatus } from '@/lib/data-source'
import { useCloudVisibility } from '@/lib/cloud-visibility'
import {
  makeFallbackTrendData,
  transformApiTrend,
} from '@/lib/cost-trend'
import {
  AllocationCoverageResponse,
  AnomalyResponse,
  ApiHealth,
  ApiInfo,
  ChargebackResponse,
  CloudWasteResponse,
  CommitmentGapResponse,
  CostResponse,
  EfficiencyScoreResponse,
  FinOpsAnalyticsResponse,
  ImportedCostSummaryResponse,
  ProviderDiagnostic,
  ProviderAccountRollupResponse,
  RecommendationResponse,
  ScanningPermission,
  StoredCredential,
  CostTrendResponse,
} from '@/lib/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress, ProgressIndicator, ProgressTrack } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface DashboardState {
  costs: CostResponse | null
  health: ApiHealth | null
  info: ApiInfo | null
  credentials: StoredCredential[]
  permission: ScanningPermission | null
  accountRollup: ProviderAccountRollupResponse | null
  importedSummary: ImportedCostSummaryResponse | null
  diagnostics: ProviderDiagnostic[]
  anomalies: AnomalyResponse[]
  recommendations: RecommendationResponse[]
  analytics: FinOpsAnalyticsResponse | null
  cloudWaste: CloudWasteResponse | null
  efficiencyScore: EfficiencyScoreResponse | null
  commitmentGap: CommitmentGapResponse | null
  coverage: AllocationCoverageResponse | null
  chargeback: ChargebackResponse | null
  source: 'live' | 'partial' | 'fallback'
  error: string | null
}

const initialState: DashboardState = {
  costs: null,
  health: null,
  info: null,
  credentials: [],
  permission: null,
  accountRollup: null,
  importedSummary: null,
  diagnostics: [],
  anomalies: [],
  recommendations: [],
  analytics: null,
  cloudWaste: null,
  efficiencyScore: null,
  commitmentGap: null,
  coverage: null,
  chargeback: null,
  source: 'live',
  error: null,
}

const providerLabels: Record<string, string> = {
  aws: 'AWS',
  azure: 'Azure',
  gcp: 'GCP',
  oci: 'OCI',
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

function formatCurrencyPrecise(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function statusClass(ok: boolean): string {
  return ok
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
}

function makeBreakdownData(costs: CostResponse | null): ServiceBreakdownPoint[] {
  const breakdown = costs?.breakdown || {}
  return Object.entries(breakdown)
    .filter(([, value]) => value.cost > 0)
    .map(([provider, value]) => ({
      name: provider,
      label: providerLabels[provider] || provider.toUpperCase(),
      value: value.percentage,
      cost: value.cost,
    }))
}

function exportCsv(state: DashboardState) {
  const rows = [
    ['Metric', 'Value'],
    ['Total monthly cost', state.costs?.totalCost ?? 0],
    ['Potential monthly savings', state.costs?.potentialSavings ?? 0],
    ['Active anomalies', state.anomalies.length],
    ['Connected providers', state.credentials.filter((credential) => credential.is_valid).length],
    ['Scan state', state.permission?.state || 'not configured'],
    ['Spend at risk (USD)', state.analytics?.spend_at_risk_usd ?? 0],
    ['Optimization capacity (USD)', state.analytics?.optimization_capacity_usd ?? 0],
    ['Budget utilization (%)', state.analytics?.unit_metrics?.budget_utilization_percent ?? 0],
    [],
    ['Provider', 'Cost', 'Percentage', 'Credential Status'],
  ]

  Object.entries(state.costs?.breakdown || {}).forEach(([provider, value]) => {
    const credential = state.credentials.find((item) => item.provider === provider)
    rows.push([
      providerLabels[provider] || provider.toUpperCase(),
      value.cost,
      `${value.percentage}%`,
      credential?.is_valid ? 'connected' : 'not connected',
    ])
  })

  const csvContent = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const element = document.createElement('a')
  element.setAttribute('href', `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`)
  element.setAttribute('download', `optiora-dashboard-${new Date().toISOString().split('T')[0]}.csv`)
  element.style.display = 'none'
  document.body.appendChild(element)
  element.click()
  document.body.removeChild(element)
}

export default function DashboardPage() {
  const [state, setState] = useState<DashboardState>(initialState)
  const [loading, setLoading] = useState(true)
  const { hiddenProviders, toggleProvider, isVisible } = useCloudVisibility()
  const [trendLookback, setTrendLookback] = useState<3 | 6 | 12>(6)
  const [trendApiData, setTrendApiData] = useState<CostTrendResponse | null>(null)
  const [trendFromArchive, setTrendFromArchive] = useState(false)

  const connectedProviders = useMemo(
    () => state.credentials.filter((credential) => credential.is_valid),
    [state.credentials],
  )
  const supportedProviders = state.info?.supported_providers || ['aws', 'azure', 'gcp', 'oci']
  const scanApproved = state.permission?.state === 'approved' || state.permission?.state === 'running'
  const breakdownData = useMemo(
    () => makeBreakdownData(state.costs).filter((d) => isVisible(d.name)),
    [state.costs, isVisible],
  )
  const trendData = useMemo(() => {
    const raw = trendApiData ? transformApiTrend(trendApiData) : makeFallbackTrendData(state.costs)
    if (hiddenProviders.length === 0) return raw
    return raw.map((point) => {
      const filtered = { ...point }
      hiddenProviders.forEach((provider) => {
        filtered[provider] = 0
      })
      return filtered
    })
  }, [hiddenProviders, state.costs, trendApiData])
  const visibleAnomalies = useMemo(
    () => state.anomalies.filter((a) => isVisible(a.cloud)),
    [state.anomalies, isVisible],
  )
  const visibleRecommendations = useMemo(
    () => state.recommendations.filter((r) => isVisible(r.cloud)),
    [state.recommendations, isVisible],
  )
  const topRecommendation = visibleRecommendations[0]
  const highestAnomaly = visibleAnomalies[0]
  const efficiencyValue = state.efficiencyScore?.overall_score || 0
  const efficiencyColor = efficiencyValue >= 80 ? '#10b981' : efficiencyValue >= 65 ? '#f59e0b' : '#ef4444'
  const efficiencyRingStyle = {
    background: `conic-gradient(${efficiencyColor} ${Math.max(0, Math.min(efficiencyValue, 100))}%, #e2e8f0 0)`,
  }
  const topWasteCategories = (state.cloudWaste?.categories || []).slice(0, 4)
  const topCommitmentGap = state.commitmentGap?.provider_gaps?.[0]
  const accountRollupItems = state.accountRollup?.items.slice(0, 6) || []
  const accountRollupSourceLabel = state.accountRollup
    ? state.accountRollup.scan_id
      ? 'Scan snapshot'
      : state.importedSummary?.has_data
        ? 'Imported CSV active'
        : 'No imported rollup'
    : 'No rollup data'
  const dataSourceStatus = buildCostDataSourceStatus({
    health: state.health,
    importedSummary: state.importedSummary,
    diagnostics: state.diagnostics,
    primaryLoaded: Boolean(state.costs),
    pageName: 'Overview',
  })

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    const [costs, health, info, credentials, permission, accountRollup, importedSummary, diagnostics, anomalies, recommendations, analytics, cloudWaste, efficiencyScore, commitmentGap, coverage, chargeback] =
      await Promise.allSettled([
        fetchCostsStrict(12000),
        fetchApiHealth(),
        fetchApiInfo(),
        fetchCredentials(),
        fetchScanningPermission(),
        fetchProviderAccountRollups(),
        fetchImportedCostSummary(),
        fetchProviderDiagnostics(),
        fetchAnomalies(),
        fetchRecommendations(),
        fetchFinOpsAnalytics(),
        fetchCloudWasteAnalytics(),
        fetchEfficiencyScore(),
        fetchCommitmentGap(),
        fetchAllocationCoverage(),
        fetchChargeback('team'),
      ])

    const nextState: DashboardState = {
      costs: costs.status === 'fulfilled' ? costs.value : null,
      health: health.status === 'fulfilled' ? health.value : null,
      info: info.status === 'fulfilled' ? info.value : null,
      credentials: credentials.status === 'fulfilled' ? credentials.value.credentials || [] : [],
      permission: permission.status === 'fulfilled' ? permission.value : null,
      accountRollup: accountRollup.status === 'fulfilled' ? accountRollup.value : null,
      importedSummary: importedSummary.status === 'fulfilled' ? importedSummary.value : null,
      diagnostics: diagnostics.status === 'fulfilled' ? diagnostics.value : [],
      anomalies: anomalies.status === 'fulfilled' ? anomalies.value.items : [],
      recommendations: recommendations.status === 'fulfilled' ? recommendations.value.items : [],
      analytics: analytics.status === 'fulfilled' ? analytics.value : null,
      cloudWaste: cloudWaste.status === 'fulfilled' ? cloudWaste.value : null,
      efficiencyScore: efficiencyScore.status === 'fulfilled' ? efficiencyScore.value : null,
      commitmentGap: commitmentGap.status === 'fulfilled' ? commitmentGap.value : null,
      coverage: coverage.status === 'fulfilled' ? coverage.value : null,
      chargeback: chargeback.status === 'fulfilled' ? chargeback.value : null,
      source: health.status === 'fulfilled' && credentials.status === 'fulfilled' ? 'live' : 'partial',
      error:
        costs.status === 'rejected'
          ? costs.reason instanceof Error
            ? costs.reason.message
            : 'Unable to load overview cost data from the backend.'
          : health.status === 'rejected'
            ? 'Backend health is unavailable. Verify the API before trusting this workspace view.'
            : null,
    }

    if (!nextState.costs) {
      nextState.source = 'fallback'
    }

    setState(nextState)
    setLoading(false)
  }, [])

  useEffect(() => {
    let mounted = true
    const run = async () => {
      await loadDashboard()
      if (!mounted) return
    }
    void run()
    return () => {
      mounted = false
    }
  }, [loadDashboard])

  useEffect(() => {
    let mounted = true
    const run = async () => {
      try {
        const resp = await fetchCostTrend('monthly', trendLookback)
        if (!mounted) return
        setTrendApiData(resp)
        // data_source === 'computed' can include archive rows; backend sets it the same way
        // We detect archive by checking if any point predates the 90-day hot window
        const hotCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        const hasArchive = resp.points.some((p) => new Date(p.period_start) < hotCutoff)
        setTrendFromArchive(hasArchive)
      } catch {
        // Ignore; chart keeps an empty state until live trend data is available.
      }
    }
    void run()
    return () => { mounted = false }
  }, [trendLookback])

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-10 w-72 rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-slate-200 dark:bg-slate-700" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-slate-200 dark:bg-slate-700" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="h-64 rounded-xl bg-slate-200 dark:bg-slate-700 xl:col-span-2" />
          <div className="h-64 rounded-xl bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>
    )
  }

  const costs = state.costs

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge className={`rounded-md border ${statusClass(state.health?.status === 'healthy')}`}>
              API {state.health?.status || 'unknown'}
            </Badge>
            <Badge variant="outline" className="rounded-md">
              {dataSourceStatus.label}
            </Badge>
            <Badge variant="outline" className="rounded-md">
              {connectedProviders.length}/{supportedProviders.length} providers connected
            </Badge>
            {hiddenProviders.length > 0 && (
              <Badge
                variant="outline"
                className="rounded-md border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
              >
                {hiddenProviders.map((p) => p.toUpperCase()).join(', ')} hidden
              </Badge>
            )}
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            OptiOra Command Center
          </h1>
          <p className="max-w-3xl text-slate-600 dark:text-slate-400">
            Monitor API readiness, cloud billing coverage, active scans, anomalies, and optimization work from one operational view.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => void loadDashboard()} className="rounded-lg">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => exportCsv(state)} className="rounded-lg">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {state.error && (
        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle>Workspace needs attention</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <DataSourceBanner status={dataSourceStatus} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={DollarSign}
          label="Monthly Cloud Cost"
          value={costs ? formatCurrency(costs.totalCost) : '$0'}
          color="bg-gradient-to-br from-blue-500 to-blue-600"
        />
        <MetricCard
          icon={Target}
          label="Monthly Savings Identified"
          value={costs ? formatCurrency(costs.potentialSavings) : '$0'}
          color="bg-gradient-to-br from-emerald-500 to-emerald-600"
        />
        <MetricCard
          icon={AlertCircle}
          label="Active Anomalies"
          value={String(visibleAnomalies.length || costs?.anomalies || 0)}
          color="bg-gradient-to-br from-rose-500 to-rose-600"
        />
        <MetricCard
          icon={ShieldCheck}
          label="Scan Readiness"
          value={scanApproved ? 'Approved' : 'Pending'}
          color={scanApproved ? 'bg-gradient-to-br from-cyan-500 to-cyan-600' : 'bg-gradient-to-br from-amber-500 to-amber-600'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <MetricCard
          icon={Target}
          label="Spend At Risk"
          value={formatCurrency(state.analytics?.spend_at_risk_usd || 0)}
          color="bg-gradient-to-br from-amber-500 to-amber-600"
        />
        <MetricCard
          icon={DollarSign}
          label="Optimization Capacity"
          value={formatCurrency(state.analytics?.optimization_capacity_usd || 0)}
          color="bg-gradient-to-br from-indigo-500 to-indigo-600"
        />
        <MetricCard
          icon={Activity}
          label="Budget Utilization"
          value={`${(state.analytics?.unit_metrics?.budget_utilization_percent || 0).toFixed(1)}%`}
          color="bg-gradient-to-br from-violet-500 to-violet-600"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="rounded-lg border-slate-200 dark:border-slate-700">
          <CardHeader className="border-b border-slate-200 dark:border-slate-700">
            <CardTitle className="text-xl">Efficiency Score</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="mx-auto flex w-full max-w-[220px] flex-col items-center gap-4">
              <div
                className="relative h-36 w-36 rounded-full p-2 transition-all duration-700"
                style={efficiencyRingStyle}
              >
                <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-center dark:bg-slate-900">
                  <div>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">{efficiencyValue.toFixed(1)}</p>
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Grade {state.efficiencyScore?.grade || '—'}
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-center text-sm text-slate-600 dark:text-slate-400">
                {state.efficiencyScore?.interpretation || 'Efficiency analytics unavailable.'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg xl:col-span-2 border-slate-200 dark:border-slate-700">
          <CardHeader className="border-b border-slate-200 dark:border-slate-700">
            <CardTitle className="text-xl">Cloud Waste Categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-md">
                Waste grade: {state.cloudWaste?.waste_grade || '—'}
              </Badge>
              <Badge variant="outline" className="rounded-md">
                {formatCurrency(state.cloudWaste?.total_estimated_waste_usd || 0)} / month
              </Badge>
              <Badge variant="outline" className="rounded-md">
                {(state.cloudWaste?.total_waste_rate_percent || 0).toFixed(1)}% of spend
              </Badge>
            </div>
            {topWasteCategories.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No waste category data available.</p>
            ) : (
              topWasteCategories.map((category) => {
                const width = Math.min(category.estimated_waste_rate_percent * 3, 100)
                return (
                  <div key={category.category} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-900 dark:text-white">
                        {category.category.replace(/_/g, ' ')}
                      </span>
                      <span className="text-slate-600 dark:text-slate-400">
                        {formatCurrency(category.estimated_waste_usd)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-700"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="rounded-lg border-slate-200 dark:border-slate-700">
          <CardHeader className="border-b border-slate-200 dark:border-slate-700">
            <CardTitle className="text-xl">Commitment Gap Opportunity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-6">
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(state.commitmentGap?.total_annual_opportunity_usd || 0)}
              <span className="ml-2 text-sm font-medium text-slate-500 dark:text-slate-400">annual opportunity</span>
            </p>
            {topCommitmentGap ? (
              <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-sm text-slate-600 dark:text-slate-400">Top provider target</p>
                <p className="text-base font-semibold text-slate-900 dark:text-white">
                  {(providerLabels[topCommitmentGap.provider] || topCommitmentGap.provider).toUpperCase()} gap {topCommitmentGap.gap_percent.toFixed(1)}%
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  ~{formatCurrency(topCommitmentGap.scenarios['1_year'].monthly_savings_usd)} monthly savings
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No commitment gap data available.</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-cyan-200 bg-gradient-to-br from-cyan-50 to-blue-50 dark:border-cyan-900 dark:from-cyan-950/30 dark:to-blue-950/20">
          <CardHeader className="border-b border-cyan-200 dark:border-cyan-900">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Activity className="h-5 w-5 animate-pulse text-cyan-600" />
              AI Insight Prompt
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">
              {state.analytics?.genai_advice_prompt || 'Generate an executive summary from cloud waste and efficiency signals to prioritize the next 30-day optimization plan.'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Allocation Coverage Row — always 4 cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Tag}
          label="Allocation Coverage"
          value={state.coverage ? `${state.coverage.coverage_percent.toFixed(1)}%` : '—'}
          color="bg-gradient-to-br from-violet-500 to-purple-600"
        />
        {(['team', 'env', 'project'] as const).map((dim) => {
          const pct = state.coverage?.dimension_coverage[dim]
          return (
            <MetricCard
              key={dim}
              icon={Tag}
              label={`${dim.charAt(0).toUpperCase() + dim.slice(1)} Coverage`}
              value={pct !== undefined ? `${pct.toFixed(1)}%` : '—'}
              color="bg-gradient-to-br from-slate-500 to-slate-600"
            />
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="rounded-lg xl:col-span-2">
          <CardHeader className="border-b border-slate-200 dark:border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Activity className="h-5 w-5" />
                Cost Trend By Provider
                {trendFromArchive && (
                  <Badge
                    variant="outline"
                    className="rounded-md border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-300"
                  >
                    Includes archived data
                  </Badge>
                )}
              </CardTitle>
              <div className="flex gap-1">
                {([3, 6, 12] as const).map((months) => (
                  <Button
                    key={months}
                    variant={trendLookback === months ? 'default' : 'outline'}
                    className="h-7 rounded px-2 text-xs"
                    onClick={() => setTrendLookback(months)}
                  >
                    {months}M
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <CostChart data={trendData} />
          </CardContent>
        </Card>

        <MonthlyComparisonCard
          data={trendData}
          title="Month-over-Month Cost"
          className="rounded-lg"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="rounded-lg xl:col-span-2">
          <CardHeader className="flex flex-col gap-3 border-b border-slate-200 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
            <CardTitle className="flex items-center gap-2 text-xl">
              <KeyRound className="h-5 w-5" />
              Cloud Provider Coverage
            </CardTitle>
            <Link href="/dashboard/settings" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
              Manage credentials
            </Link>
          </CardHeader>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Share</TableHead>
                  <TableHead>Credential</TableHead>
                  <TableHead>Visibility</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supportedProviders.map((provider) => {
                  const cost = costs?.breakdown?.[provider]?.cost || 0
                  const percentage = costs?.breakdown?.[provider]?.percentage || 0
                  const credential = state.credentials.find((item) => item.provider === provider)
                  const connected = Boolean(credential?.is_valid)
                  const visible = isVisible(provider)
                  return (
                    <TableRow key={provider} className={!visible ? 'opacity-50' : undefined}>
                      <TableCell className="font-semibold uppercase">{providerLabels[provider] || provider}</TableCell>
                      <TableCell>{formatCurrency(cost)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Progress value={Math.min(percentage, 100)} className="w-28">
                            <ProgressTrack className="h-2">
                              <ProgressIndicator className="bg-blue-600" />
                            </ProgressTrack>
                          </Progress>
                          <span className="text-sm text-slate-600 dark:text-slate-400">{percentage.toFixed(1)}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`rounded-md border ${statusClass(connected)}`}>
                          {connected ? 'Connected' : 'Missing'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => toggleProvider(provider)}
                          title={visible ? 'Hide from dashboard' : 'Show in dashboard'}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition"
                        >
                          {visible ? (
                            <><Eye className="w-3.5 h-3.5" /><span>Visible</span></>
                          ) : (
                            <><EyeOff className="w-3.5 h-3.5" /><span>Hidden</span></>
                          )}
                        </button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="rounded-lg">
            <CardHeader className="border-b border-slate-200 dark:border-slate-700">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Cloud className="h-5 w-5" />
                Provider Mix
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <ServiceBreakdown data={breakdownData} />
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader className="border-b border-slate-200 dark:border-slate-700">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Server className="h-5 w-5" />
                Deployment Posture
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {[
                {
                  label: 'Terraform network baseline',
                  detail: 'VCN, subnet, routes, gateway, security list',
                  ok: true,
                  icon: Network,
                },
              {
                label: 'Ansible runtime provisioning',
                detail: 'Packages, environment, systemd, health checks',
                ok: true,
                icon: Server,
              },
              {
                label: 'Cloud credentials',
                detail: `${connectedProviders.length} validated provider connection${connectedProviders.length === 1 ? '' : 's'}`,
                ok: connectedProviders.length > 0,
                icon: KeyRound,
              },
                {
                  label: 'Scan approval',
                  detail: state.permission?.state || 'Approval required',
                  ok: scanApproved,
                  icon: ShieldCheck,
                },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="flex gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <Icon className={item.ok ? 'mt-0.5 h-5 w-5 text-emerald-600' : 'mt-0.5 h-5 w-5 text-amber-600'} />
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{item.label}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{item.detail}</p>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="rounded-lg">
        <CardHeader className="flex flex-col gap-3 border-b border-slate-200 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Layers3 className="h-5 w-5" />
              Account Hierarchy Rollup
            </CardTitle>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Rolled-up cost visibility by provider account, subscription, project, or compartment.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-md">
              {state.accountRollup?.items.length || 0} nodes
            </Badge>
            <Badge variant="outline" className="rounded-md">
              {accountRollupSourceLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {state.accountRollup && (
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Total rolled-up spend
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {formatCurrencyPrecise(state.accountRollup.total_rolled_up_cost_usd)}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Direct grouped spend
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {formatCurrencyPrecise(state.accountRollup.total_direct_cost_usd)}
                </p>
              </div>
            </div>
          )}
          {!state.accountRollup || accountRollupItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
              Run a scan or upload a CSV with account identifiers to populate provider rollups. Provider roots, grouped account nodes, and rolled-up totals now render as a hierarchy.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Account Node</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Direct Cost</TableHead>
                  <TableHead>Rolled Up</TableHead>
                  <TableHead>Signals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountRollupItems.map((item) => (
                  <TableRow key={item.account_id}>
                    <TableCell className="font-semibold uppercase">
                      {providerLabels[item.provider] || item.provider}
                    </TableCell>
                    <TableCell>
                      <div
                        className="font-medium text-slate-900 dark:text-white"
                        style={{ paddingLeft: `${item.depth * 16}px` }}
                      >
                        {item.depth > 0 ? '↳ ' : ''}
                        {item.account_name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-500">
                        {item.account_identifier}
                        {item.parent_account_identifier ? ` · parent ${item.parent_account_identifier}` : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-md">
                        {item.account_type}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatCurrencyPrecise(item.direct_cost_usd)}</TableCell>
                    <TableCell className="font-medium">
                      {formatCurrencyPrecise(item.rolled_up_cost_usd)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                      {item.rolled_up_service_count} services · {item.rolled_up_anomalies_count} anomalies
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="rounded-lg">
          <CardHeader className="flex flex-col gap-3 border-b border-slate-200 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
            <CardTitle className="text-xl">Current Risk</CardTitle>
            <Link href="/dashboard/anomalies" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
              Open anomalies <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="pt-6">
            {highestAnomaly ? (
              <Alert className="border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30">
                <AlertCircle className="h-4 w-4 text-rose-600" />
                <AlertTitle>{highestAnomaly.service} cost movement</AlertTitle>
                <AlertDescription>
                  {highestAnomaly.message}. Change detected: {highestAnomaly.change.toFixed(0)}%.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-5 w-5" />
                <div>
                  <p className="font-semibold">No active anomaly feed</p>
                  <p className="text-sm">Connect providers and run scans to populate anomaly detection.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader className="flex flex-col gap-3 border-b border-slate-200 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
            <CardTitle className="text-xl">Next Optimization</CardTitle>
            <Link href="/dashboard/recommendations" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
              Open recommendations <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="pt-6">
            {topRecommendation ? (
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{topRecommendation.title}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{topRecommendation.description}</p>
                  </div>
                  <Badge className="rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                    {formatCurrency(topRecommendation.savings)}/mo
                  </Badge>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  ROI score: {Number.isFinite(topRecommendation.roi) ? `${topRecommendation.roi.toFixed(0)}%` : 'Immediate'}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <p className="font-semibold text-slate-900 dark:text-white">Recommendations need live provider data</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Add credentials, approve scanning, and run analysis to generate provider-specific savings.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chargeback Summary */}
      <Card className="rounded-lg">
        <CardHeader className="flex flex-col gap-3 border-b border-slate-200 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Tag className="h-5 w-5 text-violet-500" />
              Business Mapping &amp; Chargeback
            </CardTitle>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Cost attribution by business dimension. Define mapping rules to drive allocation coverage.
            </p>
          </div>
          <Link href="/dashboard/costs" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
            Full chargeback view <ArrowRight className="h-4 w-4" />
          </Link>
        </CardHeader>
        <CardContent className="pt-4">
          {state.coverage && (
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Overall Coverage</p>
                <p className="text-sm font-semibold text-violet-600">{state.coverage.coverage_percent.toFixed(1)}%</p>
              </div>
              {Object.entries(state.coverage.dimension_coverage).map(([dim, pct]) => (
                <div key={dim} className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {dim.replace('_', ' ')}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{pct.toFixed(1)}%</p>
                </div>
              ))}
            </div>
          )}
          {state.chargeback && state.chargeback.groups.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Providers</TableHead>
                  <TableHead>Records</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.chargeback.groups.slice(0, 6).map((g) => (
                  <TableRow key={g.value}>
                    <TableCell className="font-medium">{g.value}</TableCell>
                    <TableCell>{formatCurrencyPrecise(g.total_cost_usd)}</TableCell>
                    <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                      {Object.entries(g.provider_breakdown)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 3)
                        .map(([p]) => p.toUpperCase())
                        .join(', ')}
                    </TableCell>
                    <TableCell>{g.record_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
              No chargeback data yet. Create tag-based mapping rules and upload tagged cost data to see team-level attribution here.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
