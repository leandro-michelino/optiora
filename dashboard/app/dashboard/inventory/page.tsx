'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Cloud,
  Filter,
  Layers3,
  Loader,
  MapPin,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Tags,
  X,
} from 'lucide-react'
import { fetchProviderAccountInventory, fetchResourceInventory } from '@/lib/api'
import { ResourceInventoryResponse, ResourceInventoryItem, ProviderAccountInventoryResponse } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Expander } from '@/components/ui/expander'

const PROVIDERS = ['all', 'aws', 'azure', 'gcp', 'oci']

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

function fmtJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return '{}'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function metadataText(meta: Record<string, unknown> | undefined, key: string, fallback = 'n/a') {
  const value = meta?.[key]
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString()
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return fallback
}

function topRegions(meta?: Record<string, unknown>) {
  const raw = meta?.region_breakdown
  if (!Array.isArray(raw)) return []

  return raw
    .map((entry) => {
      if (!isRecord(entry)) return null
      const region = typeof entry.region === 'string' ? entry.region : ''
      const cost = typeof entry.cost_usd === 'number' ? entry.cost_usd : 0
      return region ? { region, cost } : null
    })
    .filter((entry): entry is { region: string; cost: number } => Boolean(entry))
    .slice(0, 3)
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

function StatusPill({ item }: { item: ResourceInventoryItem }) {
  if (item.waste_flag) {
    return (
      <span className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{item.waste_reason ?? 'Review needed'}</span>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
      <ShieldCheck className="h-3.5 w-3.5" />
      Healthy
    </span>
  )
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
  tone: 'blue' | 'emerald' | 'amber' | 'slate'
}) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
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
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{helper}</p>
    </div>
  )
}

function TagsPreview({ tags }: { tags: Record<string, string> }) {
  const entries = Object.entries(tags || {})

  if (entries.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No tags captured for this resource.</p>
  }

  return (
    <div className="flex flex-wrap gap-2">
      {entries.slice(0, 8).map(([key, value]) => (
        <Badge key={`${key}-${value}`} variant="outline" className="rounded-md">
          {key}: {value}
        </Badge>
      ))}
      {entries.length > 8 && (
        <Badge variant="outline" className="rounded-md">
          +{entries.length - 8} more
        </Badge>
      )}
    </div>
  )
}

function AccountContext({ item, accountMeta }: { item: ResourceInventoryItem; accountMeta?: Record<string, unknown> }) {
  const regions = topRegions(accountMeta)

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account</p>
        <p className="mt-2 break-all font-mono text-xs text-slate-700 dark:text-slate-300">{item.account_id || 'n/a'}</p>
        <p className="mt-2 text-xs text-slate-500">Scope: {metadataText(accountMeta, 'scope_type', item.resource_type)}</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hierarchy</p>
        <p className="mt-2 truncate text-sm font-medium text-slate-900 dark:text-white" title={metadataText(accountMeta, 'scope_name', item.resource_name || item.resource_id)}>
          {metadataText(accountMeta, 'scope_name', item.resource_name || item.resource_id)}
        </p>
        <p className="mt-1 text-xs text-slate-500">Parent: {metadataText(accountMeta, 'parent_scope_type', 'none')}</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top Regions</p>
        {regions.length > 0 ? (
          <div className="mt-2 space-y-1">
            {regions.map((region) => (
              <div key={region.region} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-slate-600 dark:text-slate-400">{region.region}</span>
                <span className="font-medium text-slate-900 dark:text-white">{fmtCompact(region.cost)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{item.region || 'No region breakdown'}</p>
        )}
      </div>
    </div>
  )
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
      <button className="flex-1 cursor-default bg-slate-950/45" onClick={onClose} aria-label="Close details drawer" />
      <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <ProviderBadge provider={item.provider} />
                <StatusPill item={item} />
              </div>
              <h3 className="truncate text-xl font-semibold text-slate-950 dark:text-white" title={item.resource_name || item.resource_id}>
                {item.resource_name || item.resource_id}
              </h3>
              <p className="mt-1 break-all font-mono text-xs text-slate-500 dark:text-slate-400">{item.resource_id}</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close details">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-4 p-6">
          <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resource Summary</p>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500">Type</p>
                <p className="mt-1 font-medium text-slate-950 dark:text-white">{item.resource_type}</p>
              </div>
              <div>
                <p className="text-slate-500">Region</p>
                <p className="mt-1 font-medium text-slate-950 dark:text-white">{item.region || 'global'}</p>
              </div>
              <div>
                <p className="text-slate-500">Monthly Cost</p>
                <p className="mt-1 font-medium text-slate-950 dark:text-white">{fmt(item.cost_usd)}</p>
              </div>
              <div>
                <p className="text-slate-500">Waste Signal</p>
                <p className="mt-1 font-medium text-slate-950 dark:text-white">{item.waste_flag ? item.waste_reason ?? 'Flagged' : 'None'}</p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Account Context</p>
            <AccountContext item={item} accountMeta={accountMeta} />
          </section>

          <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Tags</p>
            <TagsPreview tags={item.tags || {}} />
          </section>

          <Expander
            title="Raw account metadata"
            description="Open only when you need to inspect the original payload."
            icon={<Server className="h-5 w-5 text-slate-500" />}
            className="shadow-none"
          >
            <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
              {fmtJson(accountMeta || {})}
            </pre>
          </Expander>
        </div>
      </aside>
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
      <tr className="border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/50">
        <td className="px-4 py-3">
          <div className="flex min-w-[22rem] items-start gap-2">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={toggleExpanded}
              aria-label={expanded ? 'Collapse row details' : 'Expand row details'}
              aria-expanded={expanded}
              className="mt-0.5"
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950 dark:text-white" title={item.resource_name || item.resource_id}>
                {item.resource_name || item.resource_id}
              </p>
              <p className="mt-1 max-w-[34rem] truncate font-mono text-xs text-slate-500 dark:text-slate-400" title={item.resource_id}>
                {item.resource_id}
              </p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="space-y-1">
            <ProviderBadge provider={item.provider} />
            <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <MapPin className="h-3.5 w-3.5" />
              {item.region || 'global'}
            </p>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{item.resource_type}</td>
        <td className="px-4 py-3 text-right text-sm font-semibold text-slate-950 dark:text-white">{fmt(item.cost_usd)}</td>
        <td className="px-4 py-3">
          <StatusPill item={item} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40">
          <td colSpan={5} className="px-4 py-4">
            <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resource Snapshot</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {item.provider.toUpperCase()} {item.resource_type} in {item.region || 'global'} with {fmt(item.cost_usd)} monthly attribution.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={onOpenDetails} className="self-start">
                  Open Details Drawer
                </Button>
              </div>

              <AccountContext item={item} accountMeta={accountMeta} />

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Tags className="h-3.5 w-3.5" />
                  Tags
                </div>
                <TagsPreview tags={item.tags || {}} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function InventoryPage() {
  const didInitFromQuery = useRef(false)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ResourceInventoryResponse | null>(null)
  const [accountInventory, setAccountInventory] = useState<ProviderAccountInventoryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState('all')
  const [wasteOnly, setWasteOnly] = useState(false)
  const [regionFilter, setRegionFilter] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [drawerItem, setDrawerItem] = useState<ResourceInventoryItem | null>(null)

  useEffect(() => {
    if (didInitFromQuery.current) return
    didInitFromQuery.current = true
    const searchParams = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.search : '',
    )
    const providerParam = (searchParams.get('provider') || '').toLowerCase()
    if (PROVIDERS.includes(providerParam)) {
      setProvider(providerParam)
    }
    const regionParam = (searchParams.get('region') || '').trim()
    if (regionParam) {
      setRegionFilter(regionParam)
    }
  }, [])

  const accountMetadataLookup = useMemo(() => {
    const lookup: Record<string, Record<string, unknown>> = {}
    for (const account of accountInventory?.accounts || []) {
      const key = `${account.provider}:${account.account_identifier}`
      lookup[key] = account.metadata || {}
    }
    return lookup
  }, [accountInventory])

  const providerSummary = useMemo(() => {
    const summary: Record<string, { count: number; cost: number; waste: number }> = {}
    for (const item of data?.items || []) {
      const key = item.provider.toLowerCase()
      summary[key] ??= { count: 0, cost: 0, waste: 0 }
      summary[key].count += 1
      summary[key].cost += item.cost_usd
      if (item.waste_flag) summary[key].waste += 1
    }
    return Object.entries(summary).sort((a, b) => b[1].cost - a[1].cost)
  }, [data])

  const rowKey = (item: ResourceInventoryItem) => `${item.provider}:${item.resource_id}`
  const accountKey = (item: ResourceInventoryItem) => `${item.provider}:${item.account_id}`
  const wasteRate = data && data.total_resources > 0 ? (data.flagged_waste_count / data.total_resources) * 100 : 0
  const activeFilterCount = [provider !== 'all', Boolean(regionFilter.trim()), wasteOnly].filter(Boolean).length

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const clearFilters = () => {
    setProvider('all')
    setRegionFilter('')
    setWasteOnly(false)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
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
    } catch (err) {
      setData(null)
      setAccountInventory(null)
      setError(err instanceof Error ? err.message : 'Could not load inventory.')
    } finally {
      setLoading(false)
    }
  }, [provider, regionFilter, wasteOnly])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-4xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-md">
              Multi-cloud inventory
            </Badge>
            <Badge variant="outline" className="rounded-md">
              Updated {fmtDate(data?.generated_at)}
            </Badge>
          </div>
          <h1 className="text-3xl font-semibold text-slate-950 dark:text-white md:text-4xl">Cloud Resource Inventory</h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-400">
            Review cloud assets by provider, account, region, monthly cost, and waste signal without exposing raw metadata until it is needed.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Expander
        title="Filters and scope"
        description={`${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'} - provider ${provider === 'all' ? 'all' : provider.toUpperCase()}${regionFilter ? `, region ${regionFilter}` : ''}${wasteOnly ? ', waste only' : ''}.`}
        icon={<Filter className="h-5 w-5 text-amber-500" />}
        actions={activeFilterCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        ) : null}
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_24rem]">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Provider</p>
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
                  {item === 'all' ? 'All Providers' : item.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] xl:grid-cols-1">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Region</span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="me-abudhabi-1"
                  value={regionFilter}
                  onChange={(event) => setRegionFilter(event.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </span>
            </label>
            <label className="flex h-9 items-center gap-2 self-end rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <input
                type="checkbox"
                checked={wasteOnly}
                onChange={(event) => setWasteOnly(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Waste only
            </label>
          </div>
        </div>
      </Expander>

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTile
              icon={<Server className="h-5 w-5" />}
              label="Resources"
              value={data.total_resources.toLocaleString()}
              helper={`${data.items.length.toLocaleString()} loaded in this view`}
              tone="blue"
            />
            <StatTile
              icon={<CircleDollarSign className="h-5 w-5" />}
              label="Monthly Cost"
              value={fmtCompact(data.total_cost_usd)}
              helper="Attributed to visible inventory scope"
              tone="emerald"
            />
            <StatTile
              icon={<AlertTriangle className="h-5 w-5" />}
              label="Waste Flagged"
              value={data.flagged_waste_count.toLocaleString()}
              helper={`${wasteRate.toFixed(1)}% of total resources`}
              tone={data.flagged_waste_count > 0 ? 'amber' : 'emerald'}
            />
            <StatTile
              icon={<Cloud className="h-5 w-5" />}
              label="Providers Seen"
              value={providerSummary.length.toLocaleString()}
              helper={provider === 'all' ? 'Across loaded resource rows' : provider.toUpperCase()}
              tone="slate"
            />
          </div>

          <Expander
            title="Provider cost mix"
            description="Open for a compact cost, count, and waste breakdown by cloud provider."
            icon={<Layers3 className="h-5 w-5 text-blue-600" />}
          >
            {providerSummary.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {providerSummary.map(([providerName, summary]) => (
                  <div key={providerName} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
                    <div className="flex items-center justify-between gap-2">
                      <ProviderBadge provider={providerName} />
                      <span className="text-sm font-semibold text-slate-950 dark:text-white">{fmtCompact(summary.cost)}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>{summary.count} resources</span>
                      <span>{summary.waste} waste flags</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No provider mix available for the current scope.</p>
            )}
          </Expander>
        </>
      )}

      {loading ? (
        <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          <Loader className="mr-2 h-6 w-6 animate-spin" /> Loading resource inventory...
        </div>
      ) : data && data.items.length > 0 ? (
        <Expander
          title={`Resource table (${data.items.length} shown${data.items.length < data.total_resources ? ` of ${data.total_resources}` : ''})`}
          description="Rows stay compact. Expand a row for account context and tags, or open the drawer for raw metadata."
          icon={<Server className="h-5 w-5" />}
          defaultOpen
          contentClassName="p-0"
        >
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Showing {data.items.length.toLocaleString()} rows, sorted by the backend inventory response.
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Expand only the resource you are investigating.
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <colgroup>
                <col className="w-[45%]" />
                <col className="w-[13%]" />
                <col className="w-[12%]" />
                <col className="w-[13%]" />
                <col className="w-[17%]" />
              </colgroup>
              <thead className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Resource</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Scope</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Type</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Monthly Cost</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Signal</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const key = rowKey(item)
                  const accountMeta = accountMetadataLookup[accountKey(item)]
                  return (
                    <ResourceRow
                      key={key}
                      item={item}
                      expanded={expandedRows.has(key)}
                      toggleExpanded={() => toggleRow(key)}
                      onOpenDetails={() => setDrawerItem(item)}
                      accountMeta={accountMeta}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        </Expander>
      ) : data ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <Server className="mx-auto mb-3 h-10 w-10 text-slate-400" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {wasteOnly ? 'No waste-flagged resources found.' : 'No resources found for this scope.'}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {wasteOnly ? 'Clear the waste-only filter to review the full inventory.' : 'Connect cloud providers, import billing data, or run a scan to populate the table.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          {error || 'Could not load inventory. Check backend connectivity.'}
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
