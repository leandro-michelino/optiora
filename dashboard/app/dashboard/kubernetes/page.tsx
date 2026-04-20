'use client'

import { useEffect, useState } from 'react'
import { Box, Calculator, Info, Loader, RefreshCw } from 'lucide-react'
import { fetchKubernetesSummary, calculateKubernetesClusterCost, syncOpenCostCosts } from '@/lib/api'
import { KubernetesSummaryResponse, KubernetesClusterCostResponse, OpenCostSyncResponse } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const defaultForm = {
  cluster_name: 'production',
  provider: 'aws',
  region: 'us-east-1',
  node_count: 5,
  node_type: 'm5.xlarge',
  monthly_node_cost_usd: 150,
}

export default function KubernetesPage() {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<KubernetesSummaryResponse | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [opencostEnabled, setOpencostEnabled] = useState(false)
  const [opencostUrl, setOpencostUrl] = useState('http://localhost:9003')
  const [opencostWindowDays, setOpencostWindowDays] = useState(7)
  const [opencostSyncLoading, setOpencostSyncLoading] = useState(false)
  const [opencostSyncError, setOpencostSyncError] = useState<string | null>(null)
  const [opencostSyncResult, setOpencostSyncResult] = useState<OpenCostSyncResponse | null>(null)
  const [calcResult, setCalcResult] = useState<KubernetesClusterCostResponse | null>(null)
  const [calcLoading, setCalcLoading] = useState(false)

  async function loadSummary() {
    setLoading(true)
    try {
      setSummary(await fetchKubernetesSummary())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadSummary() }, [])

  function handleFormChange(key: keyof typeof defaultForm, value: string | number) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleCalc(e: React.FormEvent) {
    e.preventDefault()
    setCalcLoading(true)
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

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-md">Kubernetes Cost Allocation</Badge>
            <Badge variant="outline" className="rounded-md border-purple-300 bg-purple-50 text-purple-800 dark:bg-purple-950/30">OpenCost-Ready</Badge>
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Kubernetes Namespace Costs</h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-3xl">
            Estimate and break down Kubernetes cluster costs by namespace. OpenCost sync brings live namespace allocation, and the calculator models any cluster configuration.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadSummary()} className="rounded-lg">
          <RefreshCw className="mr-2 h-4 w-4" />Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center text-slate-500">
          <Loader className="h-6 w-6 animate-spin mr-2" /> Loading Kubernetes summary...
        </div>
      ) : summary ? (
        <>
          {/* Summary overview */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      {/* Cluster cost calculator */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-slate-200 dark:border-slate-700">
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Cluster Cost Calculator
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={(e) => void handleCalc(e)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
                    onChange={e => handleFormChange('provider', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    {['aws', 'azure', 'gcp', 'oci'].map(p => (
                      <option key={p} value={p}>{p.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Region</label>
                  <input
                    type="text"
                    value={form.region}
                    onChange={e => handleFormChange('region', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Node Type</label>
                  <input
                    type="text"
                    value={form.node_type}
                    onChange={e => handleFormChange('node_type', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
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
                  <div className="grid grid-cols-2 gap-3">
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
                  </div>
                )}
              </div>

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
              <p className="text-sm">Run the calculator to see namespace cost breakdown</p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-slate-200 dark:border-slate-700">
            <CardTitle>OpenCost Namespace/Pod Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
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
              <div className="grid grid-cols-2 gap-3">
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
              <Button type="submit" className="w-full rounded-lg" disabled={opencostSyncLoading}>
                {opencostSyncLoading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sync OpenCost
              </Button>
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

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  Pod-level breakdown requires pod aggregation exposure from the OpenCost endpoint. Namespace-level live costs are now fully wired.
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Sync OpenCost to load live namespace breakdown for this cluster.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
