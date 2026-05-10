'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Box, Calculator, Info, Loader, RefreshCw } from 'lucide-react'
import { fetchKubernetesSummary, calculateKubernetesClusterCost, fetchKubernetesProviderCatalog, syncOpenCostCosts, autoInstallOpenCost } from '@/lib/api'
import {
  KubernetesSummaryResponse,
  KubernetesClusterCostResponse,
  KubernetesProviderCatalogEntry,
  OpenCostInstallResponse,
  OpenCostSyncResponse,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Expander } from '@/components/ui/expander'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type KubernetesProvider = 'aws' | 'azure' | 'gcp' | 'oci'

type ProviderProfile = {
  regions: string[]
  source?: string
  message?: string
  nodeTypes: Array<{ value: string; monthlyCost: number; vcpu?: number | null; memoryGiB?: number | null; source?: string }>
}

const emptyProviderProfiles: Record<KubernetesProvider, ProviderProfile> = {
  aws: { regions: [], nodeTypes: [] },
  azure: { regions: [], nodeTypes: [] },
  gcp: { regions: [], nodeTypes: [] },
  oci: { regions: [], nodeTypes: [] },
}

function providerProfileFromCatalog(entry: KubernetesProviderCatalogEntry): ProviderProfile {
  return {
    regions: entry.regions,
    source: entry.source,
    message: entry.message,
    nodeTypes: entry.node_types.map((nodeType) => ({
      value: nodeType.value,
      monthlyCost: nodeType.monthly_cost_usd,
      vcpu: nodeType.vcpu,
      memoryGiB: nodeType.memory_gib,
      source: nodeType.source,
    })),
  }
}

function formatNodeTypeLabel(option: { value: string; vcpu?: number | null; memoryGiB?: number | null }): string {
  const parts = [option.value]
  if (option.vcpu) {
    parts.push(`${option.vcpu} vCPU`)
  }
  if (option.memoryGiB) {
    parts.push(`${option.memoryGiB} GiB`)
  }
  return parts.join(' · ')
}

const defaultForm = {
  cluster_name: 'production',
  provider: 'oci' as KubernetesProvider,
  region: '',
  node_count: 5,
  node_type: '',
  monthly_node_cost_usd: 0,
}

export default function KubernetesPage() {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<KubernetesSummaryResponse | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [providerProfiles, setProviderProfiles] = useState<Record<KubernetesProvider, ProviderProfile>>(emptyProviderProfiles)
  const [catalogMeta, setCatalogMeta] = useState<{ fetchedAt?: string; liveProviders: number; noDataProviders: number; error?: string }>({
    liveProviders: 0,
    noDataProviders: 4,
  })
  const [form, setForm] = useState(defaultForm)
  const [opencostEnabled, setOpencostEnabled] = useState(false)
  const [opencostUrl, setOpencostUrl] = useState('http://localhost:9003')
  const [opencostWindowDays, setOpencostWindowDays] = useState(7)
  const [opencostSyncLoading, setOpencostSyncLoading] = useState(false)
  const [opencostSyncError, setOpencostSyncError] = useState<string | null>(null)
  const [opencostSyncResult, setOpencostSyncResult] = useState<OpenCostSyncResponse | null>(null)
  const [opencostInstallLoading, setOpencostInstallLoading] = useState(false)
  const [opencostInstallResult, setOpencostInstallResult] = useState<OpenCostInstallResponse | null>(null)
  const [opencostInstallError, setOpencostInstallError] = useState<string | null>(null)
  const [calcResult, setCalcResult] = useState<KubernetesClusterCostResponse | null>(null)
  const [calcLoading, setCalcLoading] = useState(false)
  const [calcError, setCalcError] = useState<string | null>(null)

  async function loadSummary() {
    setLoading(true)
    setSummaryError(null)
    try {
      setSummary(await fetchKubernetesSummary())
    } catch (err) {
      setSummary(null)
      setSummaryError(err instanceof Error ? err.message : 'Unable to load Kubernetes summary.')
    } finally {
      setLoading(false)
    }
  }

  async function loadProviderCatalog() {
    try {
      const catalog = await fetchKubernetesProviderCatalog()
      const mappedProfiles: Partial<Record<KubernetesProvider, ProviderProfile>> = {}
      let liveProviders = 0
      let noDataProviders = 0
      for (const provider of ['aws', 'azure', 'gcp', 'oci'] as KubernetesProvider[]) {
        const entry = catalog.providers[provider]
        if (!entry) {
          mappedProfiles[provider] = emptyProviderProfiles[provider]
          noDataProviders += 1
          continue
        }
        mappedProfiles[provider] = providerProfileFromCatalog(entry)
        if (entry.source === 'live') {
          liveProviders += 1
        } else {
          noDataProviders += 1
        }
      }
      setProviderProfiles(mappedProfiles as Record<KubernetesProvider, ProviderProfile>)
      setCatalogMeta({
        fetchedAt: catalog.generated_at,
        liveProviders,
        noDataProviders,
      })
    } catch (error) {
      setProviderProfiles(emptyProviderProfiles)
      setCatalogMeta({
        liveProviders: 0,
        noDataProviders: 4,
        error: error instanceof Error ? error.message : 'Unable to load provider catalog.',
      })
    }
  }

  useEffect(() => {
    void loadSummary()
    void loadProviderCatalog()
  }, [])

  function handleFormChange(key: keyof typeof defaultForm, value: string | number) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleCalc(e: React.FormEvent) {
    e.preventDefault()
    setCalcLoading(true)
    setCalcError(null)
    try {
      const res = await calculateKubernetesClusterCost({
        cluster_name: form.cluster_name,
        provider: form.provider,
        region: form.region,
        node_count: Number(form.node_count),
        node_type: form.node_type,
        monthly_node_cost_usd: Number(form.monthly_node_cost_usd),
        opencost_enabled: opencostEnabled,
        opencost_url: opencostEnabled ? opencostUrl : undefined,
        opencost_window_days: opencostEnabled ? opencostWindowDays : undefined,
      })
      setCalcResult(res)
    } catch (err) {
      setCalcResult(null)
      setCalcError(err instanceof Error ? err.message : 'Cluster cost calculation failed.')
    } finally {
      setCalcLoading(false)
    }
  }

  async function handleOpenCostSync(e: React.FormEvent) {
    e.preventDefault()
    setOpencostSyncLoading(true)
    setOpencostSyncError(null)
    try {
      const result = await syncOpenCostCosts({
        api_url: opencostUrl,
        cluster_name: form.cluster_name,
        window_days: opencostWindowDays,
      })
      setOpencostSyncResult(result)
    } catch (err) {
      setOpencostSyncError(err instanceof Error ? err.message : 'OpenCost sync failed')
    } finally {
      setOpencostSyncLoading(false)
    }
  }

  async function handleOpenCostAutoInstall() {
    setOpencostInstallLoading(true)
    setOpencostInstallError(null)
    try {
      const result = await autoInstallOpenCost({})
      setOpencostInstallResult(result)
      if (result.api_url) {
        setOpencostUrl(result.api_url)
        setOpencostEnabled(true)
      }
    } catch (err) {
      setOpencostInstallResult(null)
      setOpencostInstallError(err instanceof Error ? err.message : 'OpenCost auto-install failed')
    } finally {
      setOpencostInstallLoading(false)
    }
  }

  const podRows = opencostSyncResult?.pods || []
  const estimatedMonthlyCost = Number(form.node_count || 0) * Number(form.monthly_node_cost_usd || 0)
  const opencostOnLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(opencostUrl.trim())
  const selectedProviderProfile = providerProfiles[form.provider]
  const regionOptions = selectedProviderProfile.regions.includes(form.region)
    ? [...selectedProviderProfile.regions]
    : [form.region, ...selectedProviderProfile.regions]
  const nodeTypeOptions = selectedProviderProfile.nodeTypes.some((option) => option.value === form.node_type)
    ? [...selectedProviderProfile.nodeTypes]
    : [{
      value: form.node_type,
      monthlyCost: Number(form.monthly_node_cost_usd || 0),
      source: 'manual',
    }, ...selectedProviderProfile.nodeTypes]

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-md">Kubernetes Cost Allocation</Badge>
            <Badge variant="outline" className="rounded-md border-purple-300 bg-purple-50 text-purple-800 dark:bg-purple-950/30">OpenCost-Ready</Badge>
            <Badge variant="outline" className="rounded-md border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30">
              {catalogMeta.liveProviders}/4 providers live catalog
            </Badge>
            {catalogMeta.noDataProviders > 0 && (
              <Badge variant="outline" className="rounded-md border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30">
                {catalogMeta.noDataProviders} no data
              </Badge>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-2">Kubernetes Namespace Costs</h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-3xl">
            Estimate and break down Kubernetes cluster costs by namespace. OpenCost sync brings live namespace allocation, and the calculator models any cluster configuration.
          </p>
        </div>
        <Button variant="outline" onClick={() => { void loadSummary(); void loadProviderCatalog() }} className="rounded-lg">
          <RefreshCw className="mr-2 h-4 w-4" />Refresh
        </Button>
      </div>

      {catalogMeta.error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          Provider catalog is unavailable: {catalogMeta.error}
        </div>
      )}
      {catalogMeta.noDataProviders > 0 && !catalogMeta.error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          {catalogMeta.noDataProviders} provider catalog(s) have no live regions or shapes yet. Connect provider credentials in Settings so OptiOra can fetch live catalog data from provider APIs.
        </div>
      )}
      {summaryError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          Kubernetes summary is unavailable: {summaryError}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center text-slate-500">
          <Loader className="h-6 w-6 animate-spin mr-2" /> Loading Kubernetes summary...
        </div>
      ) : summary ? (
        <>
          {/* Summary overview */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'K8s Enabled', value: summary.kubernetes_enabled ? 'Yes' : 'Not yet', color: summary.kubernetes_enabled ? 'from-emerald-500 to-emerald-600' : 'from-slate-400 to-slate-500' },
              { label: 'Clusters Configured', value: summary.clusters_configured.toString(), color: 'from-blue-500 to-blue-600' },
              { label: 'Estimated K8s Share', value: `${summary.estimated_k8s_share_percent.toFixed(1)}%`, color: 'from-purple-500 to-purple-600' },
              { label: 'Estimated K8s Cost', value: fmt(summary.estimated_k8s_cost_usd), color: 'from-indigo-500 to-indigo-600' },
            ].map(kpi => (
              <Card key={kpi.label} className="rounded-xl overflow-hidden">
                <CardContent className="p-0">
                  <div className={`bg-gradient-to-br ${kpi.color} p-4 text-white`}>
                    <p className="text-2xl font-bold">{kpi.value}</p>
                    <p className="text-xs opacity-80 mt-1">{kpi.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {!summary.kubernetes_enabled && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <p className="font-semibold mb-1">{summary.setup_hint}</p>
                  <p>
                    Integrate{' '}
                    <a href={summary.opencost_docs} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
                      OpenCost
                    </a>{' '}
                    to get real-time, per-namespace Kubernetes cost allocation inside Optiora.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}

      <Expander
        title="Cluster Cost Calculator"
        description="Model cluster spend and review calculated namespace, workload, team, and node-pool allocation."
        icon={<Calculator className="h-5 w-5" />}
        defaultOpen
      >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-slate-200 dark:border-slate-700">
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Cluster Cost Calculator
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={(e) => void handleCalc(e)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Cluster Name</label>
                  <input
                    type="text"
                    value={form.cluster_name}
                    onChange={e => handleFormChange('cluster_name', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Provider</label>
                  <select
                    value={form.provider}
                    onChange={e => {
                      const provider = e.target.value as KubernetesProvider
                      const profile = providerProfiles[provider]
                      const defaultNode = profile.nodeTypes[0]
                      setForm((current) => ({
                        ...current,
                        provider,
                        region: profile.regions[0] ?? current.region,
                        node_type: defaultNode?.value ?? current.node_type,
                        monthly_node_cost_usd: defaultNode?.monthlyCost ?? current.monthly_node_cost_usd,
                      }))
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    {(Object.keys(providerProfiles) as KubernetesProvider[]).map((provider) => (
                      <option key={provider} value={provider}>{provider.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Region</label>
                  <select
                    value={form.region}
                    onChange={e => handleFormChange('region', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    {regionOptions.map((region) => (
                      <option key={region} value={region}>{region}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Source: {selectedProviderProfile.source || 'no live catalog'}.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Node Type</label>
                  <select
                    value={form.node_type}
                    onChange={e => {
                      const nodeType = e.target.value
                      const matched = selectedProviderProfile.nodeTypes.find((option) => option.value === nodeType)
                      setForm((current) => ({
                        ...current,
                        node_type: nodeType,
                        monthly_node_cost_usd: matched?.monthlyCost ?? current.monthly_node_cost_usd,
                      }))
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    {nodeTypeOptions.map((nodeType) => (
                      <option key={nodeType.value} value={nodeType.value}>{formatNodeTypeLabel(nodeType)}</option>
                    ))}
                  </select>
                  {selectedProviderProfile.message && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {selectedProviderProfile.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Node Count</label>
                  <input
                    type="number"
                    min="1"
                    value={form.node_count}
                    onChange={e => handleFormChange('node_count', Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Monthly Cost per Node ($)</label>
                  <input
                    type="number"
                    min="1"
                    value={form.monthly_node_cost_usd}
                    onChange={e => handleFormChange('monthly_node_cost_usd', Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                Estimated baseline from inputs:
                {' '}
                <span className="font-semibold">{fmt(estimatedMonthlyCost)}</span>
                {' '}
                per month ({form.node_count} node(s) × {fmt(Number(form.monthly_node_cost_usd || 0))}).
              </div>

              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <label className="mb-3 flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={opencostEnabled}
                    onChange={(e) => setOpencostEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Use live OpenCost allocation
                </label>
                {opencostEnabled && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-400">OpenCost URL</label>
                      <input
                        type="text"
                        value={opencostUrl}
                        onChange={e => setOpencostUrl(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                        placeholder="http://localhost:9003"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-400">Window (days)</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={opencostWindowDays}
                        onChange={e => setOpencostWindowDays(Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      />
                    </div>
                    {opencostOnLocalhost && (
                      <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                        <strong>Important:</strong> `localhost` is resolved on the OptiOra API server (not your laptop browser).
                        Use this only if OpenCost is running on the same VM as OptiOra.
                      </div>
                    )}
                  </div>
                )}
              </div>
              {calcError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                  {calcError}
                </div>
              )}

              <Button type="submit" disabled={calcLoading} className="w-full rounded-lg">
                {calcLoading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                Calculate Cluster Cost
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Calculation result */}
        {calcResult ? (
          <Card>
            <CardHeader className="border-b border-slate-200 dark:border-slate-700">
              <CardTitle className="flex items-center gap-2">
                <Box className="h-5 w-5" />
                {calcResult.cluster_name} — {calcResult.provider.toUpperCase()} {calcResult.region}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3">
                  <p className="text-xs text-slate-500 mb-1">Total Cluster Cost</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{fmt(calcResult.total_cluster_cost_usd)}<span className="text-xs text-slate-400">/mo</span></p>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3">
                  <p className="text-xs text-slate-500 mb-1">Cost per Node</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{fmt(calcResult.cost_per_node_usd)}<span className="text-xs text-slate-400">/mo</span></p>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Namespace Breakdown</p>
                <div className="space-y-2">
                  {calcResult.namespace_breakdown.map(ns => (
                    <div key={ns.namespace}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="font-medium text-slate-700 dark:text-slate-300 font-mono">{ns.namespace}</span>
                        <span className="text-slate-500">{fmt(ns.estimated_cost_usd)} ({ns.share_percent.toFixed(0)}%)</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500"
                          style={{ width: `${Math.min(ns.share_percent, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Team Allocation</p>
                  <div className="space-y-2">
                    {calcResult.team_breakdown.slice(0, 6).map(team => (
                      <div key={team.team} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-white">{team.team}</p>
                            <p className="text-xs text-slate-500">{team.workload_count} workload(s) · {team.namespaces.join(', ')}</p>
                          </div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{fmt(team.estimated_cost_usd)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Node Pools</p>
                  <div className="space-y-2">
                    {calcResult.node_pool_breakdown.map(pool => (
                      <div key={pool.node_pool} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-slate-900 dark:text-white">{pool.node_pool}</span>
                          <span className="text-slate-600 dark:text-slate-300">{pool.utilization_percent.toFixed(1)}% utilized</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {pool.node_count} node(s) · {fmt(pool.estimated_cost_usd)} capacity · {fmt(pool.idle_cost_usd)} idle
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {calcResult.workload_breakdown.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Top Workloads</p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="w-full min-w-[680px] text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60">
                        <tr className="text-left text-slate-500">
                          <th className="px-3 py-2 font-medium">Workload</th>
                          <th className="px-3 py-2 font-medium">Team</th>
                          <th className="px-3 py-2 font-medium">Pool</th>
                          <th className="px-3 py-2 font-medium text-right">Cost</th>
                          <th className="px-3 py-2 font-medium text-right">Req Efficiency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calcResult.workload_breakdown.slice(0, 8).map(row => (
                          <tr key={`${row.namespace}-${row.workload_name}`} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">{row.namespace}/{row.workload_name}</td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.team}</td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.node_pool}</td>
                            <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">{fmt(row.estimated_cost_usd)}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{row.request_efficiency_percent.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {calcResult.recommendations.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Request & Node Pool Recommendations</p>
                  <div className="space-y-2">
                    {calcResult.recommendations.slice(0, 5).map(rec => (
                      <div key={rec.recommendation_id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">{rec.target}</p>
                            <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">{rec.rationale}</p>
                            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{rec.action}</p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold text-amber-900 dark:text-amber-100">{fmt(rec.estimated_monthly_savings_usd)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-950/30">
                <p className="text-xs text-purple-800 dark:text-purple-200">{calcResult.efficiency_note}</p>
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">{calcResult.opencost_integration}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center min-h-[300px] text-slate-400">
              <Box className="h-12 w-12 mb-4" />
              <p className="text-sm">Run the calculator to see namespace cost breakdown.</p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Tip: select your provider first. Presets auto-fill region and node type for faster setup.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
      </Expander>

      <Expander
        title="OpenCost Sync And Live Breakdown"
        description="Install, wire, and sync OpenCost only when live Kubernetes allocation details are needed."
        icon={<Box className="h-5 w-5" />}
      >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-slate-200 dark:border-slate-700">
            <CardTitle>OpenCost Namespace/Pod Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
              <p className="font-semibold">How to use OpenCost</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>Install OpenCost in the Kubernetes cluster you want to measure (or click <strong>Auto-install &amp; Wire OpenCost</strong>).</li>
                <li>Set an OpenCost API URL that is reachable from the OptiOra API server VM.</li>
                <li>If OpenCost runs on the same VM as OptiOra, use <code>http://localhost:9003</code>.</li>
                <li>If OpenCost runs on another host/cluster endpoint, use <code>http://&lt;host-or-lb&gt;:9003</code>, then click <strong>Sync OpenCost</strong>.</li>
              </ol>
              <p className="mt-2 text-[11px] text-blue-700 dark:text-blue-300">
                Note: <code>localhost</code> is always resolved on the OptiOra API VM, not in your browser.
              </p>
            </div>
            <form onSubmit={(e) => void handleOpenCostSync(e)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">OpenCost URL</label>
                <input
                  type="text"
                  value={opencostUrl}
                  onChange={e => setOpencostUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Cluster Name</label>
                  <input
                    type="text"
                    value={form.cluster_name}
                    onChange={e => handleFormChange('cluster_name', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Window (days)</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={opencostWindowDays}
                    onChange={e => setOpencostWindowDays(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
              </div>
              {opencostSyncError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                  {opencostSyncError}
                </div>
              )}
              {opencostInstallError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                  {opencostInstallError}
                </div>
              )}
              {opencostOnLocalhost && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      OpenCost URL uses localhost. This works only when OpenCost runs on the same OptiOra server VM.
                    </span>
                  </div>
                </div>
              )}
              <Button type="button" variant="outline" className="w-full rounded-lg" onClick={() => void handleOpenCostAutoInstall()} disabled={opencostInstallLoading}>
                {opencostInstallLoading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : null}
                Auto-install & Wire OpenCost
              </Button>
              <Button type="submit" className="w-full rounded-lg" disabled={opencostSyncLoading}>
                {opencostSyncLoading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sync OpenCost
              </Button>
              {opencostInstallResult && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <p className="font-semibold">Auto-install status: {opencostInstallResult.status}</p>
                  <p className="mt-1">{opencostInstallResult.message}</p>
                  {opencostInstallResult.api_url && (
                    <p className="mt-1 font-mono">API URL: {opencostInstallResult.api_url}</p>
                  )}
                  {opencostInstallResult.command_log.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-slate-600 dark:text-slate-400">Command log</summary>
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-100 p-2 text-[11px] dark:bg-slate-800">
                        {opencostInstallResult.command_log.join('\n')}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-slate-200 dark:border-slate-700">
            <CardTitle>Namespace & Pod Panel</CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            {opencostSyncResult ? (
              <>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-sm text-slate-600 dark:text-slate-400">Source: {opencostSyncResult.source}</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">
                    {fmt(opencostSyncResult.total_cost_usd)} total / {opencostSyncResult.window_days} days
                  </p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Namespace breakdown (live)</p>
                  <div className="space-y-2">
                    {opencostSyncResult.namespaces.map((row) => (
                      <div key={row.namespace}>
                        <div className="mb-0.5 flex justify-between text-xs">
                          <span className="font-mono text-slate-700 dark:text-slate-300">{row.namespace}</span>
                          <span className="text-slate-500">{fmt(row.cost_usd)} ({row.share_percent.toFixed(1)}%)</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-indigo-500"
                            style={{ width: `${Math.min(row.share_percent, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {podRows.length > 0 ? (
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Pod-level breakdown (compact)</p>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                      <table className="w-full min-w-[520px] text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/60">
                          <tr className="text-left text-slate-500">
                            <th className="px-3 py-2 font-medium">Namespace</th>
                            <th className="px-3 py-2 font-medium">Pod</th>
                            <th className="px-3 py-2 font-medium text-right">Cost</th>
                            <th className="px-3 py-2 font-medium text-right">Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {podRows.slice(0, 12).map((pod, idx) => (
                            <tr key={`${pod.namespace}-${pod.pod_name}-${idx}`} className="border-t border-slate-100 dark:border-slate-800">
                              <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-mono">{pod.namespace}</td>
                              <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-mono">{pod.pod_name}</td>
                              <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">{fmt(pod.cost_usd)}</td>
                              <td className="px-3 py-2 text-right text-slate-500">{pod.share_percent.toFixed(2)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Showing up to 12 pod rows from OpenCost payload.</p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    Pod-level breakdown will appear automatically when OpenCost sync returns pod aggregation fields.
                  </div>
                )}

              </>
            ) : (
              <p className="text-sm text-slate-500">Sync OpenCost to load live namespace breakdown for this cluster.</p>
            )}
          </CardContent>
        </Card>
      </div>
      </Expander>
    </div>
  )
}
