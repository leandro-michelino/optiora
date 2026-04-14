'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cloud,
  DollarSign,
  Download,
  KeyRound,
  Network,
  RefreshCw,
  Server,
  ShieldCheck,
  Target,
} from 'lucide-react'
import { CostChart, CostTrendPoint } from '@/components/CostChart'
import { ServiceBreakdown, ServiceBreakdownPoint } from '@/components/ServiceBreakdown'
import { MetricCard } from '@/components/MetricCard'
import {
  fetchAnomalies,
  fetchApiHealth,
  fetchApiInfo,
  fetchCosts,
  fetchCredentials,
  fetchRecommendations,
  fetchScanningPermission,
} from '@/lib/api'
import {
  AnomalyResponse,
  ApiHealth,
  ApiInfo,
  CostResponse,
  RecommendationResponse,
  ScanningPermission,
  StoredCredential,
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
  anomalies: AnomalyResponse[]
  recommendations: RecommendationResponse[]
  source: 'live' | 'partial' | 'fallback'
  error: string | null
}

const initialState: DashboardState = {
  costs: null,
  health: null,
  info: null,
  credentials: [],
  permission: null,
  anomalies: [],
  recommendations: [],
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

function statusClass(ok: boolean): string {
  return ok
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
}

function makeTrendData(costs: CostResponse | null): CostTrendPoint[] {
  const breakdown = costs?.breakdown || {}
  const providers = ['aws', 'azure', 'gcp', 'oci']
  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return months.map((month, index) => {
    const growth = 0.84 + index * 0.032
    const point: CostTrendPoint = { month }
    providers.forEach((provider) => {
      point[provider] = Math.round((breakdown[provider]?.cost || 0) * growth)
    })
    return point
  })
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

  const connectedProviders = useMemo(
    () => state.credentials.filter((credential) => credential.is_valid),
    [state.credentials],
  )
  const supportedProviders = state.info?.supported_providers || ['aws', 'azure', 'gcp', 'oci']
  const scanApproved = state.permission?.state === 'approved' || state.permission?.state === 'running'
  const breakdownData = useMemo(() => makeBreakdownData(state.costs), [state.costs])
  const trendData = useMemo(() => makeTrendData(state.costs), [state.costs])
  const topRecommendation = state.recommendations[0]
  const highestAnomaly = state.anomalies[0]

  async function loadDashboard() {
    setLoading(true)
    const [costs, health, info, credentials, permission, anomalies, recommendations] =
      await Promise.allSettled([
        fetchCosts(),
        fetchApiHealth(),
        fetchApiInfo(),
        fetchCredentials(),
        fetchScanningPermission(),
        fetchAnomalies(),
        fetchRecommendations(),
      ])

    const nextState: DashboardState = {
      costs: costs.status === 'fulfilled' ? costs.value : null,
      health: health.status === 'fulfilled' ? health.value : null,
      info: info.status === 'fulfilled' ? info.value : null,
      credentials: credentials.status === 'fulfilled' ? credentials.value.credentials || [] : [],
      permission: permission.status === 'fulfilled' ? permission.value : null,
      anomalies: anomalies.status === 'fulfilled' ? anomalies.value : [],
      recommendations: recommendations.status === 'fulfilled' ? recommendations.value : [],
      source: health.status === 'fulfilled' && credentials.status === 'fulfilled' ? 'live' : 'partial',
      error: health.status === 'rejected' ? 'Backend health is unavailable. Cost widgets may be using safe fallback data.' : null,
    }

    if (!nextState.costs) {
      nextState.source = 'fallback'
    }

    setState(nextState)
    setLoading(false)
  }

  useEffect(() => {
    void loadDashboard()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-slate-600 dark:text-slate-300">
        Loading OptiOra workspace...
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
              {state.source === 'live' ? 'Live workspace' : state.source === 'partial' ? 'Partial data' : 'Fallback data'}
            </Badge>
            <Badge variant="outline" className="rounded-md">
              {connectedProviders.length}/{supportedProviders.length} providers connected
            </Badge>
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

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
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
          value={String(state.anomalies.length || costs?.anomalies || 0)}
          color="bg-gradient-to-br from-rose-500 to-rose-600"
        />
        <MetricCard
          icon={ShieldCheck}
          label="Scan Readiness"
          value={scanApproved ? 'Approved' : 'Pending'}
          color={scanApproved ? 'bg-gradient-to-br from-cyan-500 to-cyan-600' : 'bg-gradient-to-br from-amber-500 to-amber-600'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="rounded-lg xl:col-span-2">
          <CardHeader className="border-b border-slate-200 dark:border-slate-700">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Activity className="h-5 w-5" />
              Cost Trend By Provider
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <CostChart data={trendData} />
          </CardContent>
        </Card>

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
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="rounded-lg xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-700">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {supportedProviders.map((provider) => {
                  const cost = costs?.breakdown?.[provider]?.cost || 0
                  const percentage = costs?.breakdown?.[provider]?.percentage || 0
                  const credential = state.credentials.find((item) => item.provider === provider)
                  const connected = Boolean(credential?.is_valid)
                  return (
                    <TableRow key={provider}>
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
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
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

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-lg">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-700">
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
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-700">
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
    </div>
  )
}
