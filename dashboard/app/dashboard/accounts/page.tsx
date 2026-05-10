'use client'

import { useEffect, useState } from 'react'
import { Building2, ChevronDown, ChevronRight, Map, RefreshCw } from 'lucide-react'
import {
  fetchAccountRegionBreakdown,
  fetchProviderAccountInventory,
  fetchProviderAccountRollups,
  forceNextApiRefresh,
} from '@/lib/api'
import {
  AccountRegionBreakdownResponse,
  ProviderAccountInventoryResponse,
  ProviderAccountRollupItem,
  ProviderAccountRollupResponse,
} from '@/lib/types'
import { Expander } from '@/components/ui/expander'

const PROVIDER_COLORS: Record<string, string> = {
  aws: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  azure: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  gcp: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  oci: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function providerBadge(provider: string) {
  const cls = PROVIDER_COLORS[provider.toLowerCase()] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${cls}`}>
      {provider}
    </span>
  )
}

interface RegionPanelProps {
  accountId: number
  scanId?: string | null
}

function RegionPanel({ accountId, scanId }: RegionPanelProps) {
  const [data, setData] = useState<AccountRegionBreakdownResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchAccountRegionBreakdown(accountId, scanId ?? undefined)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [accountId, scanId])

  if (loading) {
    return <p className="text-sm text-slate-500 mt-2 ml-4">Loading region breakdown…</p>
  }
  if (!data || data.regions.length === 0) {
    return <p className="text-sm text-slate-500 mt-2 ml-4">No region breakdown available for this account.</p>
  }

  return (
    <div className="mt-2 ml-4 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800">
          <tr>
            <th className="text-left px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">Region</th>
            <th className="text-right px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {data.regions.map((row) => (
            <tr key={row.region} className="bg-white dark:bg-slate-900">
              <td className="px-3 py-2 text-slate-900 dark:text-white font-medium">{row.region}</td>
              <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">{formatCurrency(row.cost_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface TreeNodeProps {
  item: ProviderAccountRollupItem
  expanded: Set<string>
  toggleExpand: (key: string) => void
  selectedKey: string | null
  setSelectedKey: (key: string | null) => void
  allItems: ProviderAccountRollupItem[]
}

function TreeNode({ item, expanded, toggleExpand, selectedKey, setSelectedKey, allItems }: TreeNodeProps) {
  const key = `${item.provider}-${item.account_identifier}`
  const isExpanded = expanded.has(key)
  const isSelected = selectedKey === key
  const children = allItems.filter(
    (c) => c.parent_account_identifier === item.account_identifier && c.provider === item.provider && c.depth === item.depth + 1,
  )
  const indent = item.depth * 20

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
          isSelected
            ? 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800'
            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
        }`}
        style={{ paddingLeft: `${indent + 12}px` }}
        onClick={() => setSelectedKey(isSelected ? null : key)}
      >
        {children.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleExpand(key)
            }}
            className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        <Building2 className="w-4 h-4 flex-shrink-0 text-slate-400" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {providerBadge(item.provider)}
            <span className="font-medium text-slate-900 dark:text-white truncate">{item.account_name}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{item.account_type}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{item.account_identifier}</div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="font-semibold text-slate-900 dark:text-white text-sm">
            {formatCurrency(item.rolled_up_cost_usd)}
          </div>
          {item.child_count > 0 && (
            <div className="text-xs text-slate-500 dark:text-slate-400">{item.child_count} child(ren)</div>
          )}
        </div>
      </div>

      {isSelected && item.account_type !== 'provider' && (
        <RegionPanel accountId={item.account_id} scanId={item.scan_id} />
      )}

      {isExpanded && children.map((child) => (
        <TreeNode
          key={`${child.provider}-${child.account_identifier}`}
          item={child}
          expanded={expanded}
          toggleExpand={toggleExpand}
          selectedKey={selectedKey}
          setSelectedKey={setSelectedKey}
          allItems={allItems}
        />
      ))}
    </div>
  )
}

interface PageState {
  inventory: ProviderAccountInventoryResponse | null
  rollups: ProviderAccountRollupResponse | null
  loading: boolean
  error: string | null
}

export default function AccountsPage() {
  const [state, setState] = useState<PageState>({ inventory: null, rollups: null, loading: true, error: null })
  const [providerFilter, setProviderFilter] = useState<string>('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  async function load() {
    setState((s) => ({ ...s, loading: true, error: null }))
    const [inv, rol] = await Promise.allSettled([
      fetchProviderAccountInventory(providerFilter || undefined),
      fetchProviderAccountRollups(providerFilter || undefined),
    ])
    setState({
      inventory: inv.status === 'fulfilled' ? inv.value : null,
      rollups: rol.status === 'fulfilled' ? rol.value : null,
      loading: false,
      error: inv.status === 'rejected' && rol.status === 'rejected' ? 'Failed to load account data.' : null,
    })
  }

  useEffect(() => { void load() }, [providerFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const allItems = state.rollups?.items ?? []
  const rootItems = allItems.filter((item) => item.depth === 0)

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function expandAll() {
    setExpanded(new Set(allItems.map((item) => `${item.provider}-${item.account_identifier}`)))
  }

  function collapseAll() {
    setExpanded(new Set())
    setSelectedKey(null)
  }

  const providers = Array.from(new Set(allItems.map((i) => i.provider))).sort()
  const totalAccounts = state.inventory?.total ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Account Hierarchy</h1>
        <p className="text-slate-600 dark:text-slate-400">
          Inventory of provider accounts, subscriptions, projects, and compartments with cost rollups and region breakdowns.
        </p>
      </div>

      {state.error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Total Accounts</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">{totalAccounts}</p>
        </div>
        <div className="card">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Hierarchy Nodes</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">{allItems.length}</p>
        </div>
        <div className="card">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Providers</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">{providers.length}</p>
        </div>
        <div className="card">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Total Rollup</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {formatCurrency(state.rollups?.total_rolled_up_cost_usd ?? 0)}
          </p>
        </div>
      </div>

      <Expander
        title="Account Tree"
        description="Expand only the provider account branches you need, then click a row for region cost detail."
        icon={<Building2 className="w-5 h-5 text-blue-600" />}
        defaultOpen
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2 flex-1">
            <Building2 className="w-5 h-5 text-blue-600" />
            Account Tree
          </h2>
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100"
          >
            <option value="">All providers</option>
            {providers.map((p) => (
              <option key={p} value={p}>{p.toUpperCase()}</option>
            ))}
          </select>
          <button
            onClick={expandAll}
            className="px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
          >
            Collapse
          </button>
          <button
            onClick={() => { forceNextApiRefresh(); void load() }}
            disabled={state.loading}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${state.loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {state.loading ? (
          <div className="flex items-center justify-center h-32 text-slate-500">Loading account hierarchy…</div>
        ) : allItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-slate-500">
            <Building2 className="w-8 h-8 text-slate-300" />
            <p className="text-sm">No account hierarchy data yet. Import a billing CSV or run a scan to populate accounts.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {rootItems.map((item) => (
              <TreeNode
                key={`${item.provider}-${item.account_identifier}`}
                item={item}
                expanded={expanded}
                toggleExpand={toggleExpand}
                selectedKey={selectedKey}
                setSelectedKey={setSelectedKey}
                allItems={allItems}
              />
            ))}
          </div>
        )}

        {selectedKey && (
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Map className="w-3.5 h-3.5" />
            Click an account row to view its region cost breakdown. Click again to collapse.
          </p>
        )}
      </Expander>
    </div>
  )
}
