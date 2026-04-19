'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Filter, Loader, RefreshCw, Server } from 'lucide-react'
import { fetchResourceInventory } from '@/lib/api'
import { ResourceInventoryResponse, ResourceInventoryItem } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const PROVIDERS = ['all', 'aws', 'azure', 'gcp', 'oci']

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

function ResourceRow({ item }: { item: ResourceInventoryItem }) {
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/40 transition">
      <td className="py-3 px-4">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-white">{item.resource_name || item.resource_id}</p>
          <p className="text-xs text-slate-400 font-mono">{item.resource_id}</p>
        </div>
      </td>
      <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">{item.resource_type}</td>
      <td className="py-3 px-4"><ProviderBadge provider={item.provider} /></td>
      <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">{item.region}</td>
      <td className="py-3 px-4 text-sm font-semibold text-slate-800 dark:text-slate-200">{fmt(item.cost_usd)}/mo</td>
      <td className="py-3 px-4">
        {item.waste_flag ? (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs text-amber-600 dark:text-amber-400">{item.waste_reason ?? 'Flagged'}</span>
          </div>
        ) : (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">OK</span>
        )}
      </td>
    </tr>
  )
}

export default function InventoryPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ResourceInventoryResponse | null>(null)
  const [provider, setProvider] = useState('all')
  const [wasteOnly, setWasteOnly] = useState(false)
  const [regionFilter, setRegionFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchResourceInventory({
        provider: provider === 'all' ? undefined : provider,
        region: regionFilter || undefined,
        waste_only: wasteOnly,
        limit: 200,
      })
      setData(res)
    } finally {
      setLoading(false)
    }
  }, [provider, regionFilter, wasteOnly])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-md">Multi-Cloud Resource Inventory</Badge>
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Resource Inventory</h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-3xl">
            Unified view of cloud resources across AWS, Azure, GCP, and OCI with per-resource cost attribution and waste flags.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} className="rounded-lg">
          <RefreshCw className="mr-2 h-4 w-4" />Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
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
        <div className="ml-auto flex items-center gap-3">
          <input
            type="text"
            placeholder="Filter by region…"
            value={regionFilter}
            onChange={e => setRegionFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
            <input
              type="checkbox"
              checked={wasteOnly}
              onChange={e => setWasteOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <Filter className="h-3.5 w-3.5 text-amber-500" />
            Waste only
          </label>
        </div>
      </div>

      {/* KPI strip */}
      {data && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Total Resources', value: data.total_resources.toLocaleString(), color: 'from-blue-500 to-blue-600' },
            { label: 'Monthly Cost', value: fmt(data.total_cost_usd), color: 'from-indigo-500 to-indigo-600' },
            { label: 'Waste Flagged', value: data.flagged_waste_count.toLocaleString(), color: 'from-amber-500 to-amber-600' },
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
      )}

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center text-slate-500">
          <Loader className="h-6 w-6 animate-spin mr-2" /> Loading resource inventory...
        </div>
      ) : data && data.items.length > 0 ? (
        <Card>
          <CardHeader className="border-b border-slate-200 dark:border-slate-700">
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Resources ({data.items.length} shown{data.items.length < data.total_resources ? ` of ${data.total_resources}` : ''})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <tr>
                    {['Resource', 'Type', 'Provider', 'Region', 'Monthly Cost', 'Status'].map(h => (
                      <th key={h} className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(item => (
                    <ResourceRow key={item.resource_id} item={item} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : data ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <Server className="mx-auto h-10 w-10 text-slate-400 mb-3" />
          <p className="text-sm text-slate-500">
            {wasteOnly
              ? 'No waste-flagged resources found — great job!'
              : 'No resources found. Connect cloud providers and run a scan to populate the inventory.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Could not load inventory. Check backend connectivity.
        </div>
      )}
    </div>
  )
}
