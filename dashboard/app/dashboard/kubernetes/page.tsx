'use client'

import type { FormEvent, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Box,
  Calculator,
  CheckCircle2,
  Cloud,
  Cpu,
  DollarSign,
  Loader,
  Network,
  RefreshCw,
  Search,
  Server,
  Settings2,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { fetchKubernetesSummary, calculateKubernetesClusterCost, fetchKubernetesProviderCatalog, syncOpenCostCosts, autoInstallOpenCost } from '@/lib/api'
import {
  KubernetesSummaryResponse,
  KubernetesClusterCostResponse,
  KubernetesContainerServiceCost,
  KubernetesProviderServiceRollup,
  KubernetesProviderCatalogEntry,
  OpenCostInstallResponse,
  OpenCostSyncResponse,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Expander } from '@/components/ui/expander'

function fmt(n: number) {
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
  const parts = [option.value || 'Manual node type']
  if (option.vcpu) parts.push(`${option.vcpu} vCPU`)
  if (option.memoryGiB) parts.push(`${option.memoryGiB} GiB`)
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

function emptyKubernetesSummary(setupHint: string): KubernetesSummaryResponse {
  return {
    generated_at: new Date().toISOString(),
    kubernetes_enabled: false,
    clusters_configured: 0,
    estimated_k8s_share_percent: 0,
    estimated_k8s_cost_usd: 0,
    total_cloud_cost_usd: 0,
    container_service_count: 0,
    provider_count_with_container_spend: 0,
    highest_cost_provider: null,
    highest_cost_service: null,
    container_services: [],
    provider_breakdown: (['aws', 'azure', 'gcp', 'oci'] as KubernetesProvider[]).map((provider) => ({
      provider,
      configured: false,
      source: 'none',
      total_monthly_cost_usd: 0,
      share_percent: 0,
      service_count: 0,
      services: [],
    })),
    data_source: 'unavailable',
    setup_hint: setupHint,
    opencost_docs: 'https://www.opencost.io/docs/',
  }
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
  tone: 'blue' | 'emerald' | 'amber' | 'purple' | 'slate'
}) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
    purple: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300',
    slate: 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
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

function Notice({
  tone,
  icon,
  children,
}: {
  tone: 'amber' | 'blue' | 'red'
  icon: ReactNode
  children: ReactNode
}) {
  const cls = {
    amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
    blue: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200',
    red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300',
  }

  return (
    <div className={`rounded-lg border p-3 text-sm ${cls[tone]}`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}

function providerLabel(provider: string) {
  const labels: Record<string, string> = {
    aws: 'AWS',
    azure: 'Azure',
    gcp: 'Google Cloud',
    oci: 'Oracle Cloud',
  }
  return labels[provider] ?? provider.toUpperCase()
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    managed_kubernetes: 'Managed Kubernetes',
    container_runtime: 'Container runtime',
    container_registry: 'Container registry',
    docker: 'Docker',
    container_platform: 'Container platform',
  }
  return labels[category] ?? category.replace(/_/g, ' ')
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    live_provider_api: 'Live provider API',
    live_resource_inventory: 'Live resource inventory',
    cost_snapshots_live: 'Latest scan snapshot',
    csv_import: 'Imported billing CSV',
    none: 'No cost signal',
  }
  return labels[source] ?? source.replace(/_/g, ' ')
}

function categoryClasses(category: string) {
  if (category === 'managed_kubernetes') return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300'
  if (category === 'container_runtime') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
  if (category === 'container_registry') return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300'
  if (category === 'docker') return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300'
  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function ProviderRollupStrip({ rollups }: { rollups: KubernetesProviderServiceRollup[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {rollups.map((provider) => (
        <div key={provider.provider} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-950 dark:text-white">{providerLabel(provider.provider)}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sourceLabel(provider.source)}</p>
            </div>
            <Badge variant="outline" className="shrink-0 rounded-md">{provider.configured ? 'Connected' : 'Not connected'}</Badge>
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">{fmtCompact(provider.total_monthly_cost_usd)}</p>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>{provider.service_count} service(s)</span>
            <span>{provider.share_percent.toFixed(1)}% of container spend</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white dark:bg-slate-900">
            <div
              className="h-2 rounded-full bg-blue-500"
              style={{ width: `${Math.min(provider.share_percent, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function ContainerServicesPanel({
  summary,
  providerFilter,
  onProviderFilterChange,
  serviceSearch,
  onServiceSearchChange,
}: {
  summary: KubernetesSummaryResponse
  providerFilter: string
  onProviderFilterChange: (value: string) => void
  serviceSearch: string
  onServiceSearchChange: (value: string) => void
}) {
  const services = summary.container_services ?? []
  const rollups = summary.provider_breakdown ?? []
  const normalizedSearch = serviceSearch.trim().toLowerCase()
  const filteredServices = services.filter((service) => {
    if (providerFilter !== 'all' && service.provider !== providerFilter) return false
    if (!normalizedSearch) return true
    return [
      service.provider,
      service.service,
      service.category,
      service.source,
      service.evidence,
      ...(service.regions ?? []),
    ].some((value) => String(value).toLowerCase().includes(normalizedSearch))
  })
  const providerOptions = ['all', ...rollups.map((provider) => provider.provider)]

  return (
    <Expander
      title="Kubernetes, Containers, and Docker Services"
      description="Provider-by-provider inventory and spend signals for EKS, AKS, GKE, OKE, ECS, Fargate, Cloud Run, registries, Docker, and similar container services."
      icon={<Box className="h-5 w-5 text-blue-600" />}
      defaultOpen
      className="scroll-mt-4"
    >
      <div className="space-y-4" data-testid="kubernetes-container-services">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Container Spend</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{fmt(summary.estimated_k8s_cost_usd)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{summary.estimated_k8s_share_percent.toFixed(1)}% of cloud baseline, including live run-rate estimates</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Services Found</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{summary.container_service_count}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{summary.provider_count_with_container_spend} provider(s) with live or billing signals</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Largest Signal</p>
            <p className="mt-2 truncate text-lg font-semibold text-slate-950 dark:text-white">{summary.highest_cost_service?.service ?? 'No service yet'}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {summary.highest_cost_service ? `${providerLabel(summary.highest_cost_service.provider)} · ${fmt(summary.highest_cost_service.monthly_cost_usd)}` : sourceLabel(summary.data_source)}
            </p>
          </div>
        </div>

        <ProviderRollupStrip rollups={rollups} />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              aria-label="Search Kubernetes and container services"
              value={serviceSearch}
              onChange={(event) => onServiceSearchChange(event.target.value)}
              placeholder="Search service, provider, source, region..."
              className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <select
            value={providerFilter}
            onChange={(event) => onProviderFilterChange(event.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {providerOptions.map((provider) => (
              <option key={provider} value={provider}>{provider === 'all' ? 'All providers' : providerLabel(provider)}</option>
            ))}
          </select>
        </div>

        {filteredServices.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800" data-testid="kubernetes-container-services-table">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Provider</th>
                  <th className="px-3 py-2 font-semibold">Service</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 text-right font-semibold">Monthly Cost</th>
                  <th className="px-3 py-2 text-right font-semibold">Share</th>
                  <th className="px-3 py-2 font-semibold">Source</th>
                  <th className="px-3 py-2 font-semibold">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {filteredServices.map((service: KubernetesContainerServiceCost) => (
                  <tr key={`${service.provider}-${service.service}-${service.source}`} className="border-t border-slate-100 align-top dark:border-slate-800">
                    <td className="px-3 py-3 font-semibold text-slate-950 dark:text-white">{providerLabel(service.provider)}</td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{service.service}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {service.account_count ? `${service.account_count} account(s)` : 'Account detail pending'}
                        {service.regions.length ? ` · ${service.regions.join(', ')}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge className={`rounded-md border ${categoryClasses(service.category)}`}>{categoryLabel(service.category)}</Badge>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-950 dark:text-white">{fmt(service.monthly_cost_usd)}</td>
                    <td className="px-3 py-3 text-right text-slate-600 dark:text-slate-300">{service.share_percent.toFixed(1)}%</td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{sourceLabel(service.source)}</td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400">{service.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Notice tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
            <p className="font-semibold">No Kubernetes/container/Docker services matched the current filters.</p>
            <p className="mt-1 text-xs opacity-80">{summary.setup_hint}</p>
          </Notice>
        )}
      </div>
    </Expander>
  )
}

function EmptyResultPanel() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
      <Box className="mx-auto mb-4 h-12 w-12 text-slate-400" />
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No cluster result yet</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
        Fill the calculator and run it to see namespace, team, workload, node pool, and recommendation breakdowns here.
      </p>
    </div>
  )
}

function ClusterResultPanel({ result }: { result: KubernetesClusterCostResponse }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Calculated Cluster</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
              {result.cluster_name} · {result.provider.toUpperCase()} · {result.region || 'region unset'}
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{result.node_count} node(s) · {result.node_type || 'manual node type'}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60">
              <p className="text-xs text-slate-500">Cluster Cost</p>
              <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{fmt(result.total_cluster_cost_usd)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60">
              <p className="text-xs text-slate-500">Per Node</p>
              <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{fmt(result.cost_per_node_usd)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Namespace Allocation</p>
        <div className="space-y-2">
          {result.namespace_breakdown.map((namespace) => (
            <div key={namespace.namespace}>
              <div className="mb-1 flex justify-between gap-3 text-xs">
                <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{namespace.namespace}</span>
                <span className="text-slate-500">{fmt(namespace.estimated_cost_usd)} · {namespace.share_percent.toFixed(0)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                  style={{ width: `${Math.min(namespace.share_percent, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Team Allocation</p>
          <div className="space-y-2">
            {result.team_breakdown.slice(0, 6).map((team) => (
              <div key={team.team} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-950 dark:text-white">{team.team}</p>
                    <p className="truncate text-xs text-slate-500">{team.workload_count} workload(s) · {team.namespaces.join(', ')}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-slate-950 dark:text-white">{fmt(team.estimated_cost_usd)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Node Pools</p>
          <div className="space-y-2">
            {result.node_pool_breakdown.map((pool) => (
              <div key={pool.node_pool} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-950 dark:text-white">{pool.node_pool}</span>
                  <span className="text-slate-600 dark:text-slate-300">{pool.utilization_percent.toFixed(1)}%</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {pool.node_count} node(s) · {fmt(pool.estimated_cost_usd)} capacity · {fmt(pool.idle_cost_usd)} idle
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {result.workload_breakdown.length > 0 && (
        <Expander
          title="Workloads"
          description="Open for pod/workload-level allocation detail."
          icon={<Server className="h-5 w-5 text-blue-600" />}
        >
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[680px] text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr className="text-left text-slate-500">
                  <th className="px-3 py-2 font-medium">Workload</th>
                  <th className="px-3 py-2 font-medium">Team</th>
                  <th className="px-3 py-2 font-medium">Pool</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-3 py-2 text-right font-medium">Req Efficiency</th>
                </tr>
              </thead>
              <tbody>
                {result.workload_breakdown.slice(0, 8).map((row) => (
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
        </Expander>
      )}

      {result.recommendations.length > 0 && (
        <Expander
          title="Optimization Recommendations"
          description={`${result.recommendations.length} request, workload, or node-pool actions detected.`}
          icon={<Sparkles className="h-5 w-5 text-amber-600" />}
          defaultOpen
        >
          <div className="space-y-2">
            {result.recommendations.slice(0, 5).map((recommendation) => (
              <div key={recommendation.recommendation_id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">{recommendation.target}</p>
                    <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">{recommendation.rationale}</p>
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{recommendation.action}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-amber-900 dark:text-amber-100">{fmt(recommendation.estimated_monthly_savings_usd)}</p>
                </div>
              </div>
            ))}
          </div>
        </Expander>
      )}

      <Notice tone="blue" icon={<CheckCircle2 className="h-4 w-4" />}>
        <p>{result.efficiency_note}</p>
        <p className="mt-1 opacity-80">{result.opencost_integration}</p>
      </Notice>
    </div>
  )
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
  const [serviceProviderFilter, setServiceProviderFilter] = useState('all')
  const [serviceSearch, setServiceSearch] = useState('')

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
        if (entry.source === 'live') liveProviders += 1
        else noDataProviders += 1
      }
      setProviderProfiles(mappedProfiles as Record<KubernetesProvider, ProviderProfile>)
      setCatalogMeta({ fetchedAt: catalog.generated_at, liveProviders, noDataProviders })
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
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleCalc(event: FormEvent) {
    event.preventDefault()
    setCalcLoading(true)
    setCalcError(null)
    try {
      const result = await calculateKubernetesClusterCost({
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
      setCalcResult(result)
    } catch (err) {
      setCalcResult(null)
      setCalcError(err instanceof Error ? err.message : 'Cluster cost calculation failed.')
    } finally {
      setCalcLoading(false)
    }
  }

  async function handleOpenCostSync(event: FormEvent) {
    event.preventDefault()
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
    : [form.region, ...selectedProviderProfile.regions].filter((region, index, list) => region || index === list.length - 1)
  const nodeTypeOptions = selectedProviderProfile.nodeTypes.some((option) => option.value === form.node_type)
    ? [...selectedProviderProfile.nodeTypes]
    : [{
      value: form.node_type,
      monthlyCost: Number(form.monthly_node_cost_usd || 0),
      source: 'manual',
    }, ...selectedProviderProfile.nodeTypes]

  const catalogStatus = useMemo(() => {
    if (catalogMeta.error) return { label: 'Catalog unavailable', tone: 'red' as const }
    if (catalogMeta.liveProviders === 4) return { label: 'All catalogs live', tone: 'emerald' as const }
    if (catalogMeta.liveProviders > 0) return { label: 'Partially live', tone: 'amber' as const }
    return { label: 'Manual mode', tone: 'slate' as const }
  }, [catalogMeta])
  const catalogStatusClasses = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
    red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300',
    slate: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  }[catalogStatus.tone]
  const visibleSummary = summary ?? (
    summaryError
      ? emptyKubernetesSummary('Kubernetes summary did not load. The service estate panel remains available; refresh after provider data returns.')
      : null
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-4xl">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-md">Single Kubernetes workspace</Badge>
            <Badge variant="outline" className="rounded-md border-purple-300 bg-purple-50 text-purple-800 dark:bg-purple-950/30">OpenCost-ready</Badge>
            <Badge variant="outline" className="rounded-md">Catalog updated {fmtDate(catalogMeta.fetchedAt)}</Badge>
          </div>
          <h1 className="text-3xl font-semibold text-slate-950 dark:text-white md:text-4xl">Kubernetes Cost Allocation</h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-400">
            One workspace for Kubernetes cluster modeling, namespace allocation, OpenCost sync, and workload optimization signals.
          </p>
        </div>
        <Button variant="outline" onClick={() => { void loadSummary(); void loadProviderCatalog() }} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_0.72fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Estate Scope</p>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
                AWS, Azure, Google Cloud, and Oracle Cloud container services are normalized into one cost view, with provider source and evidence kept visible for each row.
              </p>
            </div>
            <Badge className="w-fit rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              Unified view
            </Badge>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Catalog Readiness</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <Badge className={`rounded-md border ${catalogStatusClasses}`}>{catalogStatus.label}</Badge>
            <Badge variant="outline" className="rounded-md">{catalogMeta.liveProviders}/4 live</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{catalogMeta.noDataProviders} provider catalog(s) still need credentials or provider API data.</p>
        </div>
      </div>

      {catalogMeta.error && (
        <Notice tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
          Provider catalog is unavailable: {catalogMeta.error}
        </Notice>
      )}
      {catalogMeta.noDataProviders > 0 && !catalogMeta.error && (
        <Notice tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
          <p>{catalogMeta.noDataProviders} provider catalog(s) have no live regions or shapes yet.</p>
          <p className="mt-1 text-xs opacity-80">Connect provider credentials in Settings to fetch live catalog data. The calculator still supports manual modeling.</p>
        </Notice>
      )}
      {summaryError && (
        <Notice tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
          Kubernetes summary is unavailable: {summaryError}
        </Notice>
      )}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <Loader className="h-4 w-4 animate-spin" />
            Loading Kubernetes summary...
          </div>
        </div>
      ) : visibleSummary ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTile
              icon={visibleSummary.kubernetes_enabled ? <CheckCircle2 className="h-5 w-5" /> : <Settings2 className="h-5 w-5" />}
              label="Kubernetes"
              value={visibleSummary.kubernetes_enabled ? 'Enabled' : 'Setup needed'}
              helper={visibleSummary.setup_hint}
              tone={visibleSummary.kubernetes_enabled ? 'emerald' : 'slate'}
            />
            <StatTile
              icon={<Cloud className="h-5 w-5" />}
              label="Container Services"
              value={visibleSummary.container_service_count.toString()}
              helper={`${visibleSummary.provider_count_with_container_spend} provider(s) with Kubernetes, container, registry, or Docker spend`}
              tone="blue"
            />
            <StatTile
              icon={<DollarSign className="h-5 w-5" />}
              label="Container Spend"
              value={`${visibleSummary.estimated_k8s_share_percent.toFixed(1)}%`}
              helper={`${fmtCompact(visibleSummary.estimated_k8s_cost_usd)} estimated monthly service cost`}
              tone="purple"
            />
            <StatTile
              icon={<Network className="h-5 w-5" />}
              label="Cloud Baseline"
              value={fmtCompact(visibleSummary.total_cloud_cost_usd)}
              helper="Total cloud cost used for Kubernetes share"
              tone="amber"
            />
          </div>

          {!visibleSummary.kubernetes_enabled && (
            <Notice tone="blue" icon={<Wrench className="h-4 w-4" />}>
              <p className="font-semibold">{visibleSummary.setup_hint}</p>
              <p className="mt-1 text-xs opacity-80">
                Add OpenCost when you need live namespace and pod allocation. Manual calculator mode remains available for planning.
              </p>
            </Notice>
          )}
        </>
      ) : null}

      {visibleSummary && (
        <ContainerServicesPanel
          summary={visibleSummary}
          providerFilter={serviceProviderFilter}
          onProviderFilterChange={setServiceProviderFilter}
          serviceSearch={serviceSearch}
          onServiceSearchChange={setServiceSearch}
        />
      )}

      <Expander
        title="Cluster calculator"
        description="Model cluster cost and generate namespace, team, workload, node-pool, and savings breakdowns."
        icon={<Calculator className="h-5 w-5 text-blue-600" />}
        defaultOpen
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <form onSubmit={(event) => void handleCalc(event)} className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Cluster name</span>
                <input
                  type="text"
                  value={form.cluster_name}
                  onChange={(event) => handleFormChange('cluster_name', event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Provider</span>
                <select
                  value={form.provider}
                  onChange={(event) => {
                    const provider = event.target.value as KubernetesProvider
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
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {(Object.keys(providerProfiles) as KubernetesProvider[]).map((provider) => (
                    <option key={provider} value={provider}>{provider.toUpperCase()}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Region</span>
                <select
                  value={form.region}
                  onChange={(event) => handleFormChange('region', event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {regionOptions.map((region) => (
                    <option key={region || 'manual-region'} value={region}>{region || 'Manual region'}</option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Source: {selectedProviderProfile.source || 'manual'}.</span>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Node type</span>
                <select
                  value={form.node_type}
                  onChange={(event) => {
                    const nodeType = event.target.value
                    const matched = selectedProviderProfile.nodeTypes.find((option) => option.value === nodeType)
                    setForm((current) => ({
                      ...current,
                      node_type: nodeType,
                      monthly_node_cost_usd: matched?.monthlyCost ?? current.monthly_node_cost_usd,
                    }))
                  }}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {nodeTypeOptions.map((nodeType) => (
                    <option key={nodeType.value || 'manual-node'} value={nodeType.value}>{formatNodeTypeLabel(nodeType)}</option>
                  ))}
                </select>
                {selectedProviderProfile.message && (
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{selectedProviderProfile.message}</span>
                )}
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Node count</span>
                <input
                  type="number"
                  min="1"
                  value={form.node_count}
                  onChange={(event) => handleFormChange('node_count', Number(event.target.value))}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Monthly cost per node</span>
                <input
                  type="number"
                  min="0"
                  value={form.monthly_node_cost_usd}
                  onChange={(event) => handleFormChange('monthly_node_cost_usd', Number(event.target.value))}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              Estimated baseline: <span className="font-semibold">{fmt(estimatedMonthlyCost)}</span> / month ({form.node_count} node(s) x {fmt(Number(form.monthly_node_cost_usd || 0))}).
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={opencostEnabled}
                  onChange={(event) => setOpencostEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Use live OpenCost allocation
              </label>
              {opencostEnabled && (
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">OpenCost URL</span>
                    <input
                      type="text"
                      value={opencostUrl}
                      onChange={(event) => setOpencostUrl(event.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                      placeholder="http://localhost:9003"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Window days</span>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={opencostWindowDays}
                      onChange={(event) => setOpencostWindowDays(Number(event.target.value))}
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  </label>
                  {opencostOnLocalhost && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300 md:col-span-2">
                      localhost resolves on the OptiOra API server, not the browser.
                    </div>
                  )}
                </div>
              )}
            </div>

            {calcError && (
              <Notice tone="red" icon={<AlertTriangle className="h-4 w-4" />}>
                {calcError}
              </Notice>
            )}

            <Button type="submit" disabled={calcLoading} className="w-full">
              {calcLoading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
              Calculate Cluster Cost
            </Button>
          </form>

          {calcResult ? <ClusterResultPanel result={calcResult} /> : <EmptyResultPanel />}
        </div>
      </Expander>

      <Expander
        title="OpenCost sync"
        description="Install, wire, and sync OpenCost when live namespace and pod allocation is needed."
        icon={<Box className="h-5 w-5 text-violet-600" />}
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <form onSubmit={(event) => void handleOpenCostSync(event)} className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
            <Notice tone="blue" icon={<Box className="h-4 w-4" />}>
              <p className="font-semibold">OpenCost runs from the API server perspective.</p>
              <p className="mt-1 text-xs opacity-80">Use localhost only when OpenCost is running on the same OptiOra VM.</p>
            </Notice>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">OpenCost URL</span>
              <input
                type="text"
                value={opencostUrl}
                onChange={(event) => setOpencostUrl(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Cluster name</span>
                <input
                  type="text"
                  value={form.cluster_name}
                  onChange={(event) => handleFormChange('cluster_name', event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Window days</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={opencostWindowDays}
                  onChange={(event) => setOpencostWindowDays(Number(event.target.value))}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
            </div>

            {opencostSyncError && (
              <Notice tone="red" icon={<AlertTriangle className="h-4 w-4" />}>
                {opencostSyncError}
              </Notice>
            )}
            {opencostInstallError && (
              <Notice tone="red" icon={<AlertTriangle className="h-4 w-4" />}>
                {opencostInstallError}
              </Notice>
            )}
            {opencostOnLocalhost && (
              <Notice tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
                OpenCost URL uses localhost. This works only when OpenCost runs on the same OptiOra server VM.
              </Notice>
            )}

            <Button type="button" variant="outline" className="w-full" onClick={() => void handleOpenCostAutoInstall()} disabled={opencostInstallLoading}>
              {opencostInstallLoading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
              Auto-install and Wire OpenCost
            </Button>
            <Button type="submit" className="w-full" disabled={opencostSyncLoading}>
              {opencostSyncLoading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Sync OpenCost
            </Button>

            {opencostInstallResult && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <p className="font-semibold">Auto-install status: {opencostInstallResult.status}</p>
                <p className="mt-1">{opencostInstallResult.message}</p>
                {opencostInstallResult.api_url && <p className="mt-1 font-mono">API URL: {opencostInstallResult.api_url}</p>}
                {opencostInstallResult.command_log.length > 0 && (
                  <Expander
                    title="Command log"
                    description="Open for install command output."
                    icon={<Server className="h-5 w-5" />}
                    className="mt-3 shadow-none"
                  >
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-100 p-2 text-[11px] dark:bg-slate-800">
                      {opencostInstallResult.command_log.join('\n')}
                    </pre>
                  </Expander>
                )}
              </div>
            )}
          </form>

          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            {opencostSyncResult ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live OpenCost Result</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{fmt(opencostSyncResult.total_cost_usd)} / {opencostSyncResult.window_days} days</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{opencostSyncResult.namespace_count} namespace(s) · source {opencostSyncResult.source}</p>
                  </div>
                  <Badge variant="outline" className="rounded-md">{opencostSyncResult.cluster_name}</Badge>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">Namespace Breakdown</p>
                  <div className="space-y-2">
                    {opencostSyncResult.namespaces.map((row) => (
                      <div key={row.namespace}>
                        <div className="mb-1 flex justify-between gap-3 text-xs">
                          <span className="font-mono text-slate-700 dark:text-slate-300">{row.namespace}</span>
                          <span className="text-slate-500">{fmt(row.cost_usd)} · {row.share_percent.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-indigo-500"
                            style={{ width: `${Math.min(row.share_percent, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {podRows.length > 0 ? (
                  <Expander
                    title="Pod Breakdown"
                    description="Compact pod-level cost rows from OpenCost."
                    icon={<Cpu className="h-5 w-5 text-blue-600" />}
                  >
                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                      <table className="w-full min-w-[520px] text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/60">
                          <tr className="text-left text-slate-500">
                            <th className="px-3 py-2 font-medium">Namespace</th>
                            <th className="px-3 py-2 font-medium">Pod</th>
                            <th className="px-3 py-2 text-right font-medium">Cost</th>
                            <th className="px-3 py-2 text-right font-medium">Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {podRows.slice(0, 12).map((pod, idx) => (
                            <tr key={`${pod.namespace}-${pod.pod_name}-${idx}`} className="border-t border-slate-100 dark:border-slate-800">
                              <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">{pod.namespace}</td>
                              <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">{pod.pod_name}</td>
                              <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">{fmt(pod.cost_usd)}</td>
                              <td className="px-3 py-2 text-right text-slate-500">{pod.share_percent.toFixed(2)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Expander>
                ) : (
                  <Notice tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
                    Pod-level breakdown will appear automatically when OpenCost sync returns pod aggregation fields.
                  </Notice>
                )}
              </div>
            ) : (
              <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
                <Box className="mb-4 h-12 w-12 text-slate-400" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No live OpenCost sync yet</p>
                <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
                  Sync OpenCost to load live namespace and pod cost allocation for this cluster.
                </p>
              </div>
            )}
          </div>
        </div>
      </Expander>
    </div>
  )
}
