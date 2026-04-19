'use client'

import { useEffect, useState } from 'react'
import { Eye, Loader, Plus, RefreshCw, Tag, Trash2, X } from 'lucide-react'
import {
  fetchVirtualTagRules,
  createVirtualTagRule,
  updateVirtualTagRule,
  deleteVirtualTagRule,
  previewVirtualTags,
} from '@/lib/api'
import {
  VirtualTagRuleOut,
  VirtualTagRuleCreate,
  VirtualTagRulesResponse,
  VirtualTagPreviewResponse,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const BLANK: VirtualTagRuleCreate = {
  tag_key: '',
  tag_value: '',
  match_provider: '',
  match_service: '',
  match_region: '',
  match_account_id: '',
  match_resource_type: '',
  match_resource_name_contains: '',
  match_team: '',
  match_environment: '',
  priority: 100,
  is_active: true,
  description: '',
}

function ProviderBadge({ p }: { p: string }) {
  const colors: Record<string, string> = {
    aws: 'bg-orange-50 text-orange-700 border-orange-200',
    azure: 'bg-blue-50 text-blue-700 border-blue-200',
    gcp: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    oci: 'bg-red-50 text-red-700 border-red-200',
  }
  return <Badge className={`rounded-md border text-xs ${colors[p] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>{p.toUpperCase()}</Badge>
}

function ConditionPill({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      <span className="font-medium">{label}:</span> {value}
    </span>
  )
}

interface RuleFormProps {
  initial?: VirtualTagRuleCreate
  onSave: (data: VirtualTagRuleCreate) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function RuleForm({ initial = BLANK, onSave, onCancel, saving }: RuleFormProps) {
  const [form, setForm] = useState<VirtualTagRuleCreate>(initial)

  function set(key: keyof VirtualTagRuleCreate, value: string | number | boolean) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function field(key: keyof VirtualTagRuleCreate, label: string, placeholder?: string, type = 'text') {
    const val = form[key] as string | number | boolean | undefined
    return (
      <div>
        <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-400">{label}</label>
        <input
          type={type}
          value={val === undefined || val === null ? '' : String(val)}
          onChange={e => set(key, type === 'number' ? Number(e.target.value) : e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    )
  }

  return (
    <form
      onSubmit={async e => { e.preventDefault(); await onSave(form) }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        {field('tag_key', 'Tag Key *', 'e.g. team')}
        {field('tag_value', 'Tag Value *', 'e.g. platform')}
      </div>

      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">Match Conditions (all are AND, leave blank to match everything)</p>
      <div className="grid grid-cols-2 gap-3">
        {field('match_provider', 'Provider', 'aws | azure | gcp | oci')}
        {field('match_service', 'Service contains', 'e.g. AmazonEC2')}
        {field('match_region', 'Region contains', 'e.g. us-east-1')}
        {field('match_account_id', 'Account ID', 'exact match')}
        {field('match_resource_type', 'Resource type contains', 'e.g. EC2 Instance')}
        {field('match_resource_name_contains', 'Resource name contains', 'e.g. prod-api')}
        {field('match_team', 'Team contains', 'e.g. platform')}
        {field('match_environment', 'Environment contains', 'e.g. production')}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {field('priority', 'Priority (higher = applied first)', '100', 'number')}
        <div>
          <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-400">Description</label>
          <input
            type="text"
            value={form.description ?? ''}
            onChange={e => set('description', e.target.value)}
            placeholder="Optional note"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_active"
          checked={!!form.is_active}
          onChange={e => set('is_active', e.target.checked)}
          className="h-4 w-4 rounded"
        />
        <label htmlFor="is_active" className="text-sm text-slate-700 dark:text-slate-300">Active</label>
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={saving || !form.tag_key || !form.tag_value} className="rounded-lg">
          {saving && <Loader className="mr-2 h-4 w-4 animate-spin" />}
          Save Rule
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-lg">
          Cancel
        </Button>
      </div>
    </form>
  )
}

export default function VirtualTagsPage() {
  const [rulesData, setRulesData] = useState<VirtualTagRulesResponse | null>(null)
  const [preview, setPreview] = useState<VirtualTagPreviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingRule, setEditingRule] = useState<VirtualTagRuleOut | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  async function loadRules() {
    setLoading(true)
    try { setRulesData(await fetchVirtualTagRules()) } finally { setLoading(false) }
  }

  async function loadPreview() {
    setPreviewLoading(true)
    try { setPreview(await previewVirtualTags(50)) } finally { setPreviewLoading(false) }
  }

  useEffect(() => { void loadRules() }, [])

  async function handleSave(data: VirtualTagRuleCreate) {
    setSaving(true)
    try {
      if (editingRule) {
        await updateVirtualTagRule(editingRule.id, data)
      } else {
        await createVirtualTagRule(data)
      }
      setShowForm(false)
      setEditingRule(null)
      await loadRules()
      if (preview) await loadPreview()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id)
    try {
      await deleteVirtualTagRule(id)
      await loadRules()
      if (preview) await loadPreview()
    } finally {
      setDeletingId(null)
    }
  }

  const rules = rulesData?.rules ?? []

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-md">Virtual Tag Engine</Badge>
            <Badge variant="outline" className="rounded-md border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30">No cloud permissions needed</Badge>
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Virtual Tags</h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-3xl">
            Define tag assignment rules that apply to cost records without touching cloud resources. Use virtual tags to achieve consistent allocation across providers where native tagging is inconsistent or missing.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadRules()} className="rounded-lg">
            <RefreshCw className="mr-2 h-4 w-4" />Refresh
          </Button>
          <Button onClick={() => { setEditingRule(null); setShowForm(true) }} className="rounded-lg">
            <Plus className="mr-2 h-4 w-4" />New Rule
          </Button>
        </div>
      </div>

      {/* Create / edit form */}
      {showForm && (
        <Card className="border-2 border-blue-200 dark:border-blue-800">
          <CardHeader className="border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                {editingRule ? 'Edit Virtual Tag Rule' : 'New Virtual Tag Rule'}
              </CardTitle>
              <button onClick={() => { setShowForm(false); setEditingRule(null) }}>
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <RuleForm
              initial={editingRule ? {
                tag_key: editingRule.tag_key,
                tag_value: editingRule.tag_value,
                match_provider: editingRule.match_provider ?? '',
                match_service: editingRule.match_service ?? '',
                match_region: editingRule.match_region ?? '',
                match_account_id: editingRule.match_account_id ?? '',
                match_resource_type: editingRule.match_resource_type ?? '',
                match_resource_name_contains: editingRule.match_resource_name_contains ?? '',
                match_team: editingRule.match_team ?? '',
                match_environment: editingRule.match_environment ?? '',
                priority: editingRule.priority,
                is_active: editingRule.is_active,
                description: editingRule.description ?? '',
              } : BLANK}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditingRule(null) }}
              saving={saving}
            />
          </CardContent>
        </Card>
      )}

      {/* Rules table */}
      <Card>
        <CardHeader className="border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Tag Rules ({rules.length})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex min-h-[150px] items-center justify-center text-slate-500">
              <Loader className="h-5 w-5 animate-spin mr-2" /> Loading rules...
            </div>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[180px] text-center">
              <Tag className="h-10 w-10 text-slate-300 mb-3 dark:text-slate-600" />
              <p className="text-sm text-slate-500 mb-2">No virtual tag rules yet</p>
              <p className="text-xs text-slate-400 max-w-sm">
                Create a rule to automatically assign tags like <code className="bg-slate-100 rounded px-1">team=platform</code> to matching cost records without modifying your cloud resources.
              </p>
              <Button onClick={() => setShowForm(true)} className="mt-4 rounded-lg" size="sm">
                <Plus className="mr-2 h-4 w-4" />Create first rule
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <tr>
                    {['Virtual Tag', 'Match Conditions', 'Priority', 'Status', ''].map(h => (
                      <th key={h} className="py-3 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rules.map(rule => (
                    <tr key={rule.id} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/40 transition">
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white font-mono">
                            <span className="text-blue-600 dark:text-blue-400">{rule.tag_key}</span>
                            <span className="text-slate-400 mx-1">=</span>
                            <span className="text-emerald-700 dark:text-emerald-400">{rule.tag_value}</span>
                          </p>
                          {rule.description && (
                            <p className="text-xs text-slate-400 mt-0.5">{rule.description}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {rule.match_provider && <ProviderBadge p={rule.match_provider} />}
                          <ConditionPill label="service" value={rule.match_service} />
                          <ConditionPill label="region" value={rule.match_region} />
                          <ConditionPill label="type" value={rule.match_resource_type} />
                          <ConditionPill label="name∋" value={rule.match_resource_name_contains} />
                          <ConditionPill label="team" value={rule.match_team} />
                          <ConditionPill label="env" value={rule.match_environment} />
                          {!rule.match_provider && !rule.match_service && !rule.match_region && !rule.match_resource_type && !rule.match_resource_name_contains && !rule.match_team && !rule.match_environment && (
                            <span className="text-xs text-slate-400 italic">matches all resources</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">{rule.priority}</td>
                      <td className="py-3 px-4">
                        {rule.is_active ? (
                          <Badge className="rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">Active</Badge>
                        ) : (
                          <Badge className="rounded-md border border-slate-200 bg-slate-50 text-slate-500 text-xs">Inactive</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setEditingRule(rule); setShowForm(true) }}
                            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => void handleDelete(rule.id)}
                            disabled={deletingId === rule.id}
                            className="text-rose-500 hover:text-rose-700 disabled:opacity-50"
                          >
                            {deletingId === rule.id ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Tag Coverage Preview</h2>
            <p className="text-sm text-slate-500">See which resources would be tagged by active rules without committing any changes.</p>
          </div>
          <Button variant="outline" onClick={() => void loadPreview()} disabled={previewLoading} className="rounded-lg">
            {previewLoading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
            Run Preview
          </Button>
        </div>

        {preview && (
          <>
            {/* Coverage KPIs */}
            <div className="grid gap-4 sm:grid-cols-3 mb-5">
              {[
                { label: 'Resources Analyzed', value: preview.total_resources.toLocaleString(), color: 'from-blue-500 to-blue-600' },
                { label: 'Would Be Tagged', value: preview.tagged_resources.toLocaleString(), color: 'from-emerald-500 to-emerald-600' },
                { label: 'Coverage', value: `${preview.coverage_percent.toFixed(1)}%`, color: 'from-indigo-500 to-indigo-600' },
              ].map(k => (
                <Card key={k.label} className="rounded-xl overflow-hidden">
                  <CardContent className="p-0">
                    <div className={`bg-gradient-to-br ${k.color} p-4 text-white`}>
                      <p className="text-2xl font-bold">{k.value}</p>
                      <p className="text-xs opacity-80 mt-1">{k.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Preview table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                      <tr>
                        {['Resource', 'Provider', 'Cost/mo', 'Virtual Tags Applied'].map(h => (
                          <th key={h} className="py-3 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.preview.map(item => (
                        <tr key={item.resource_id} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/40">
                          <td className="py-3 px-4">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">{item.resource_name}</p>
                            <p className="text-xs text-slate-400 font-mono">{item.resource_type}</p>
                          </td>
                          <td className="py-3 px-4">{item.provider && <ProviderBadge p={item.provider} />}</td>
                          <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300">
                            ${item.cost_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4">
                            {Object.keys(item.applied_tags).length === 0 ? (
                              <span className="text-xs text-slate-400 italic">no rules match</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(item.applied_tags).map(([k, v]) => (
                                  <span key={k} className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-mono text-blue-800 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300">
                                    {k}=<strong>{v}</strong>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Info callout */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
        <strong>How virtual tags work:</strong> Rules are evaluated in priority order (highest first). The first matching rule for each tag key wins. Virtual tags are applied at query time to cost records — your actual cloud resources are never modified. This enables consistent allocation across providers and retroactive tagging of historical cost data.
      </div>
    </div>
  )
}
