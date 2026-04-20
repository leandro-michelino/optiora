'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Filter, Loader, RefreshCw, Server, X } from 'lucide-react'
import { fetchProviderAccountInventory, fetchResourceInventory } from '@/lib/api'
import { ResourceInventoryResponse, ResourceInventoryItem, ProviderAccountInventoryResponse } from '@/lib/types'
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

function fmtJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return '{}'
  }
}

function ResourceDetailsDrawer({
  item,
  accountMeta,
  onClose,
}: {
  item: ResourceInventoryItem
  accountMeta?: Record<string, unknown>
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-slate-900/40" onClick={onClose} />
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Resource Details</p>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{item.resource_name || item.resource_id}</h3>
            <p className="font-mono text-xs text-slate-500">{item.resource_id}</p>
          </div>
          <button
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={onClose}
            aria-label="Close details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-slate-500">Provider</p>
                <p className="font-medium text-slate-900 dark:text-white">{item.provider.toUpperCase()}</p>
              </div>
              <div>
                <p className="text-slate-500">Region</p>
                <p className="font-medium text-slate-900 dark:text-white">{item.region}</p>
              </div>
              <div>
                <p className="text-slate-500">Type</p>
                <p className="font-medium text-slate-900 dark:text-white">{item.resource_type}</p>
              </div>
              <div>
                <p className="text-slate-500">Monthly Cost</p>
                <p className="font-medium text-slate-900 dark:text-white">{fmt(item.cost_usd)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-500">Account Identifier</p>
                <p className="font-mono text-xs text-slate-800 dark:text-slate-200">{item.account_id || 'n/a'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Tags</p>
            {Object.keys(item.tags || {}).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(item.tags).map(([k, v]) => (
                  <Badge key={`${k}-${v}`} variant="outline" className="rounded-md">{k}: {v}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No tags found for this resource.</p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Account Metadata JSON</p>
            <pre className="overflow-x-auto rounded bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {fmtJson(accountMeta || {})}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}

function ResourceRow({
  item,
  expanded,
  toggleExpanded,
  onOpenDetails,
  accountMeta,
}: {
  item: ResourceInventoryItem
  expanded: boolean
  toggleExpanded: () => void
  onOpenDetails: () => void
  accountMeta?: Record<string, unknown>
}) {
  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/40 transition">
        <td className="py-3 px-4">
          <div className="flex items-start gap-2">
            <button
              onClick={toggleExpanded}
              className="mt-0.5 rounded p-0.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label={expanded ? 'Collapse row details' : 'Expand row details'}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">{item.resource_name || item.resource_id}</p>
              <p className="text-xs text-slate-400 font-mono">{item.resource_id}</p>
            </div>
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
      {expanded && (
        <tr className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40">
          <td colSpan={6} className="px-4 pb-4 pt-2">
            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Account: <span className="font-mono">{item.account_id || 'n/a'}</span>
                </div>
                <button
                  onClick={onOpenDetails}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Open Details Drawer
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Tags</p>
                  {Object.keys(item.tags || {}).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(item.tags).map(([k, v]) => (
                        <Badge key={`${item.resource_id}-${k}-${v}`} variant="outline" className="rounded-md">{k}: {v}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No tags available.</p>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Account Metadata JSON</p>
                  <pre className="max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {fmtJson(accountMeta || {})}
                  </pre>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function InventoryPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ResourceInventoryResponse | null>(null)
  const [accountInventory, setAccountInventory] = useState<ProviderAccountInventoryResponse | null>(null)
  const [provider, setProvider] = useState('all')
  const [wasteOnly, setWasteOnly] = useState(false)
  const [regionFilter, setRegionFilter] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [drawerItem, setDrawerItem] = useState<ResourceInventoryItem | null>(null)

  const accountMetadataLookup = useMemo(() => {
    const lookup: Record<string, Record<string, unknown>> = {}
    for (const account of accountInventory?.accounts || []) {
      const key = `${account.provider}:${account.account_identifier}`
      lookup[key] = account.metadata || {}
    }
    return lookup
  }, [accountInventory])

  const rowKey = (item: ResourceInventoryItem) => `${item.provider}:${item.resource_id}`
  const accountKey = (item: ResourceInventoryItem) => `${item.provider}:${item.account_id}`

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [inventoryRes, accountsRes] = await Promise.all([
        fetchResourceInventory({
          provider: provider === 'all' ? undefined : provider,
          region: regionFilter || undefined,
          waste_only: wasteOnly,
          limit: 200,
        }),
        fetchProviderAccountInventory(provider === 'all' ? undefined : provider),
      ])
      setData(inventoryRes)
      setAccountInventory(accountsRes)
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
                  {data.items.map(item => {
                    const key = rowKey(item)
                    const accMeta = accountMetadataLookup[accountKey(item)]
                    return (
                      <ResourceRow
                        key={key}
                        item={item}
                        expanded={expandedRows.has(key)}
                        toggleExpanded={() => toggleRow(key)}
                        onOpenDetails={() => setDrawerItem(item)}
                        accountMeta={accMeta}
                      />
                    )
                  })}
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

      {drawerItem && (
        <ResourceDetailsDrawer
          item={drawerItem}
          accountMeta={accountMetadataLookup[accountKey(drawerItem)]}
          onClose={() => setDrawerItem(null)}
        />
      )}
    </div>
  )
}
