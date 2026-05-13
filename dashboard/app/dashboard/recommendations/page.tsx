'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  ExternalLink,
  FileDown,
  Layers3,
  Loader,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  UserCheck,
  Zap,
} from 'lucide-react'
import {
  downloadRecommendationLedgerCsv,
  fetchApiHealth,
  fetchDecisionGradeRecommendations,
  fetchImportedCostSummary,
  fetchProviderDiagnostics,
  fetchRecommendationLedger,
  fetchRecommendationsStrict,
  fetchRightsizingRecommendations,
  forceNextApiRefresh,
  updateRecommendationLedgerItem,
} from '@/lib/api'
import { DataSourceBanner } from '@/components/DataSourceBanner'
import { buildCostDataSourceStatus } from '@/lib/data-source'
import {
  ApiHealth,
  DecisionRecommendationItem,
  ImportedCostSummaryResponse,
  ProviderDiagnostic,
  RecommendationLedgerItem,
  RecommendationLedgerResponse,
  RecommendationLedgerStatus,
  RecommendationResponse,
  RightsizingRecommendation,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Expander } from '@/components/ui/expander'

const PROVIDERS = ['all', 'aws', 'azure', 'gcp', 'oci']
const LEDGER_STATUSES = ['all', 'open', 'planned', 'approved', 'executed', 'verified', 'rejected', 'expired'] as const
const MUTABLE_LEDGER_STATUSES = LEDGER_STATUSES.filter(
  (item): item is RecommendationLedgerStatus => item !== 'all'
)

type LedgerStatusFilter = (typeof LEDGER_STATUSES)[number]

interface LedgerDraft {
  status: RecommendationLedgerStatus
  owner: string
  realizedMonthlySavings: string
  varianceReason: string
}

interface RecommendationState {
  items: RecommendationResponse[]
  ledger: RecommendationLedgerResponse | null
  health: ApiHealth | null
  importedSummary: ImportedCostSummaryResponse | null
  diagnostics: ProviderDiagnostic[]
  rightsizingTop: RightsizingRecommendation[]
  rightsizingCount: number
  rightsizingMonthlySavings: number
  decisionTop: DecisionRecommendationItem[]
  loaded: boolean
  error: string | null
  ledgerError: string | null
  rightsizingSource: string
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

function fmtK(n: number) {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`
  return fmt(n)
}

function providerTone(provider: string): string {
  return (
    {
      aws: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300',
      azure:
        'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
      gcp: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
      oci: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300',
      'multi-cloud':
        'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    }[provider] ??
    'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
  )
}

function difficultyTone(difficulty: string): string {
  return (
    {
      easy: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
      medium:
        'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
      hard: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300',
    }[difficulty] ??
    'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
  )
}

function sourceLabel(source?: string): string {
  const normalized = String(source || 'cost_context').replace(/_/g, ' ')
  return normalized.replace(/\b\w/g, letter => letter.toUpperCase())
}

function sourceTone(source?: string): string {
  const text = String(source || '').toLowerCase()
  if (
    text.includes('oci') ||
    text.includes('advisor') ||
    text.includes('recommender') ||
    text.includes('optimizer')
  ) {
    return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-300'
  }
  if (
    text.includes('rightsizing') ||
    text.includes('inventory') ||
    text.includes('cloudwatch') ||
    text.includes('monitor')
  ) {
    return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300'
  }
  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
}

function productCategory(text: string): string {
  const lower = text.toLowerCase()
  if (/reservation|reserved|commitment|savings plan|committed use|coverage/.test(lower))
    return 'Commitment'
  if (/storage|volume|bootvolume|blockvolume|snapshot|backup|bucket|object|archive/.test(lower))
    return 'Storage'
  if (/database|\bdb\b|autonomous|postgres|mysql|sql|rds|aurora|cosmos/.test(lower))
    return 'Database'
  if (/network|load balancer|loadbalancer|nat|gateway|egress|cdn|dns|waf|firewall/.test(lower))
    return 'Network'
  if (/kubernetes|\bk8s\b|cluster|node pool|nodepool|container|pod/.test(lower)) return 'Kubernetes'
  if (
    /compute|instance|virtual machine|\bvm\b|ec2|shape|cpu|memory|rightsiz|downsize|resize/.test(
      lower
    )
  )
    return 'Compute'
  return 'Optimization'
}

function ociResourceConsoleUrl(resourceId: string, resourceType: string, region: string): string | null {
  const rid = resourceId.trim()
  const type = resourceType.toLowerCase()
  const suffix =
    region && !['global', 'unknown', 'n/a'].includes(region.toLowerCase())
      ? `?region=${encodeURIComponent(region)}`
      : ''
  const encoded = encodeURIComponent(rid)

  if (rid.startsWith('ocid1.bootvolume.') || type.includes('bootvolume') || type.includes('boot volume')) {
    return rid.startsWith('ocid1.bootvolume.')
      ? `https://cloud.oracle.com/block-storage/boot-volumes/${encoded}${suffix}`
      : `https://cloud.oracle.com/block-storage/boot-volumes${suffix}`
  }
  if (
    rid.startsWith('ocid1.volume.') ||
    type.includes('blockvolume') ||
    type.includes('block volume') ||
    type === 'volume'
  ) {
    return rid.startsWith('ocid1.volume.')
      ? `https://cloud.oracle.com/block-storage/volumes/${encoded}${suffix}`
      : `https://cloud.oracle.com/block-storage/volumes${suffix}`
  }
  if (rid.startsWith('ocid1.instance.')) {
    return `https://cloud.oracle.com/compute/instances/${encoded}${suffix}`
  }
  if (rid.startsWith('ocid1.loadbalancer.')) {
    return `https://cloud.oracle.com/networking/load-balancers/${encoded}${suffix}`
  }
  if (rid.startsWith('ocid1.autonomousdatabase.')) {
    return `https://cloud.oracle.com/db/adbs/${encoded}${suffix}`
  }
  if (type.includes('objectstorage') || type.includes('object storage') || type.includes('bucket')) {
    return `https://cloud.oracle.com/object-storage/buckets${suffix}`
  }
  return rid.startsWith('ocid1.') ? `https://cloud.oracle.com/resources${suffix}` : null
}

function resourceConsoleUrl(
  row: RecommendationResponse | RightsizingRecommendation
): string | null {
  const provider = 'cloud' in row ? row.cloud : row.provider
  const resourceId = String('resource_id' in row ? row.resource_id || '' : '').trim()
  const service = String('service' in row ? row.service : row.resource_type).toLowerCase()
  const region = String('region' in row ? row.region : '').trim()
  const resourceType = String('resource_type' in row ? row.resource_type || '' : service).trim()
  const existingConsoleUrl = String(
    'resource_console_url' in row ? row.resource_console_url || '' : ''
  ).trim()
  const suffix =
    region && !['global', 'unknown', 'n/a'].includes(region.toLowerCase())
      ? `?region=${encodeURIComponent(region)}`
      : ''

  if (provider === 'aws') {
    const awsRegion = region || 'us-east-1'
    if (resourceId.startsWith('vol-'))
      return `https://${awsRegion}.console.aws.amazon.com/ec2/home?region=${encodeURIComponent(awsRegion)}#VolumeDetails:volumeId=${encodeURIComponent(resourceId)}`
    if (resourceId.startsWith('i-'))
      return `https://${awsRegion}.console.aws.amazon.com/ec2/home?region=${encodeURIComponent(awsRegion)}#InstanceDetails:instanceId=${encodeURIComponent(resourceId)}`
    return `https://${awsRegion}.console.aws.amazon.com/costmanagement/home?region=${encodeURIComponent(awsRegion)}`
  }
  if (provider === 'azure') {
    if (resourceId.startsWith('/subscriptions/'))
      return `https://portal.azure.com/#resource${resourceId}/overview`
    return 'https://portal.azure.com/#view/Microsoft_Azure_Expert/AdvisorMenuBlade/~/Recommendations'
  }
  if (provider === 'gcp') {
    return 'https://console.cloud.google.com/recommender'
  }
  if (provider === 'oci') {
    const directUrl = ociResourceConsoleUrl(resourceId, `${resourceType} ${service}`, region)
    if (directUrl) return directUrl
    if (existingConsoleUrl) return existingConsoleUrl
    return `https://cloud.oracle.com/optimizer/recommendations${suffix}`
  }
  return null
}

function connectedProviderCount(diagnostics: ProviderDiagnostic[]) {
  return diagnostics.filter(item => item.configured).length
}

function isOciVmCandidate(rec: RightsizingRecommendation): boolean {
  if (rec.provider !== 'oci') return false

  const resourceId = String(rec.resource_id || '').trim()
  const resourceType = String(rec.resource_type || '').toLowerCase()
  const evidenceSource = String(rec.evidence_source || '').toLowerCase()
  const resourceName = String(rec.resource_name || '').trim()

  if (resourceName.startsWith('ocid1.tenancy.') || resourceName.startsWith('oci-acct-')) {
    return false
  }
  if (
    resourceId.startsWith('oci-acct-') ||
    resourceType.includes('aggregate') ||
    resourceType.includes('segment')
  ) {
    return false
  }

  return evidenceSource === 'oci_compute_inventory' && resourceId.startsWith('ocid1.instance.')
}

function topOciVmCandidates(recommendations: RightsizingRecommendation[]) {
  return [...recommendations]
    .filter(isOciVmCandidate)
    .sort((a, b) => b.monthly_savings_usd - a.monthly_savings_usd)
    .slice(0, 12)
}

function initialProviderFilter(): string {
  if (typeof window === 'undefined') return 'all'
  const value = new URLSearchParams(window.location.search).get('provider')?.toLowerCase() || 'all'
  return PROVIDERS.includes(value) ? value : 'all'
}

function initialLedgerStatusFilter(): LedgerStatusFilter {
  if (typeof window === 'undefined') return 'all'
  const value = new URLSearchParams(window.location.search).get('status')?.toLowerCase() || 'all'
  return LEDGER_STATUSES.includes(value as LedgerStatusFilter) ? (value as LedgerStatusFilter) : 'all'
}

function initialLedgerSearch(): string {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('q')?.trim() || ''
}

function draftFromLedgerItem(item: RecommendationLedgerItem): LedgerDraft {
  return {
    status: item.status,
    owner: item.owner || '',
    realizedMonthlySavings:
      item.realized_monthly_savings_usd > 0 ? String(item.realized_monthly_savings_usd) : '',
    varianceReason: item.variance_reason || '',
  }
}

function statusTone(status: string): string {
  return (
    {
      open: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      planned: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
      approved:
        'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300',
      executed:
        'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
      verified:
        'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
      rejected:
        'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300',
      expired:
        'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
    }[status] ??
    'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
  )
}

function readableDate(value: string | null): string {
  if (!value) return 'n/a'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function RecommendationsPage() {
  const [provider, setProvider] = useState('all')
  const [ledgerStatus, setLedgerStatus] = useState<LedgerStatusFilter>('all')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [includeLive, setIncludeLive] = useState(true)
  const [loading, setLoading] = useState(true)
  const [ledgerForms, setLedgerForms] = useState<Record<number, LedgerDraft>>({})
  const [ledgerSavingId, setLedgerSavingId] = useState<number | null>(null)
  const [ledgerExporting, setLedgerExporting] = useState(false)
  const [state, setState] = useState<RecommendationState>({
    items: [],
    ledger: null,
    health: null,
    importedSummary: null,
    diagnostics: [],
    rightsizingTop: [],
    rightsizingCount: 0,
    rightsizingMonthlySavings: 0,
    decisionTop: [],
    loaded: false,
    error: null,
    ledgerError: null,
    rightsizingSource: 'no_data_available',
  })

  useEffect(() => {
    setProvider(initialProviderFilter())
    setLedgerStatus(initialLedgerStatusFilter())
    setLedgerSearch(initialLedgerSearch())
  }, [])

  const loadRecommendations = useCallback(async () => {
    setLoading(true)
    setState(current => ({ ...current, error: null }))
    const recommendationsRequest = fetchRecommendationsStrict({
      limit: 120,
      offset: 0,
      cloud_provider: provider,
      include_provider_recommendations: includeLive,
    })
    const importedRequest = fetchImportedCostSummary()
    const healthRequest = fetchApiHealth()
    const diagnosticsRequest = fetchProviderDiagnostics()
    const ledgerRequest = fetchRecommendationLedger({
      provider,
      status: ledgerStatus,
      limit: 100,
    })

    const [response, importedResult, healthResult, diagnosticsResult, ledgerResult] = await Promise.allSettled([
      recommendationsRequest,
      importedRequest,
      healthRequest,
      diagnosticsRequest,
      ledgerRequest,
    ])
    const ledger = ledgerResult.status === 'fulfilled' ? ledgerResult.value : null
    if (ledger) {
      setLedgerForms(current => {
        const next = { ...current }
        ledger.items.forEach(item => {
          if (!next[item.id]) next[item.id] = draftFromLedgerItem(item)
        })
        return next
      })
    }
    setState(current => ({
      ...current,
      items: response.status === 'fulfilled' ? response.value.items : [],
      ledger,
      health: healthResult.status === 'fulfilled' ? healthResult.value : null,
      importedSummary: importedResult.status === 'fulfilled' ? importedResult.value : null,
      diagnostics: diagnosticsResult.status === 'fulfilled' ? diagnosticsResult.value : [],
      loaded: response.status === 'fulfilled',
      error:
        response.status === 'rejected'
          ? response.reason instanceof Error
            ? response.reason.message
            : 'Unable to load recommendations.'
          : null,
      ledgerError:
        ledgerResult.status === 'rejected'
          ? ledgerResult.reason instanceof Error
            ? ledgerResult.reason.message
            : 'Unable to load recommendation ledger.'
          : null,
    }))
    setLoading(false)

    const rightsizingProvider = provider === 'all' ? 'oci' : provider
    const rightsizingRequest = fetchRightsizingRecommendations({
      provider: rightsizingProvider,
      limit: 120,
      min_savings: 0,
      refresh_live: includeLive && (provider === 'all' || provider === 'oci'),
    })
    const decisionRequest = fetchDecisionGradeRecommendations({
      provider,
      top_n: 8,
      min_monthly_savings: 0,
    })
    const [rightsizingResult, decisionResult] = await Promise.allSettled([
      rightsizingRequest,
      decisionRequest,
    ])
    const rightsizingRecommendations =
      rightsizingResult.status === 'fulfilled' ? rightsizingResult.value.recommendations || [] : []
    const ociVmCandidates = topOciVmCandidates(rightsizingRecommendations)
    setState(current => ({
      ...current,
      rightsizingTop: ociVmCandidates,
      rightsizingCount: ociVmCandidates.length,
      rightsizingMonthlySavings: ociVmCandidates.reduce(
        (sum, item) => sum + Number(item.monthly_savings_usd || 0),
        0
      ),
      rightsizingSource:
        rightsizingResult.status === 'fulfilled'
          ? rightsizingResult.value.data_source
          : 'no_data_available',
      decisionTop:
        decisionResult.status === 'fulfilled' ? decisionResult.value.top_recommendations || [] : [],
    }))
  }, [includeLive, ledgerStatus, provider])

  useEffect(() => {
    void loadRecommendations()
  }, [loadRecommendations])

  const handleLedgerDraftChange = useCallback(
    (ledgerId: number, patch: Partial<LedgerDraft>) => {
      setLedgerForms(current => ({
        ...current,
        [ledgerId]: {
          ...(current[ledgerId] || {
            status: 'open',
            owner: '',
            realizedMonthlySavings: '',
            varianceReason: '',
          }),
          ...patch,
        },
      }))
    },
    []
  )

  const handleSaveLedgerItem = useCallback(
    async (item: RecommendationLedgerItem) => {
      const draft = ledgerForms[item.id] || draftFromLedgerItem(item)
      const realizedText = draft.realizedMonthlySavings.trim()
      const realized = realizedText.length > 0 ? Number(realizedText) : undefined
      if (realized !== undefined && !Number.isFinite(realized)) {
        setState(current => ({
          ...current,
          ledgerError: 'Realized monthly savings must be a valid number.',
        }))
        return
      }

      setLedgerSavingId(item.id)
      setState(current => ({ ...current, ledgerError: null }))
      try {
        await updateRecommendationLedgerItem(item.id, {
          status: draft.status,
          owner: draft.owner,
          variance_reason: draft.varianceReason,
          ...(realized !== undefined ? { realized_monthly_savings_usd: Math.max(0, realized) } : {}),
        })
        await loadRecommendations()
      } catch (error) {
        setState(current => ({
          ...current,
          ledgerError:
            error instanceof Error ? error.message : 'Unable to update recommendation ledger row.',
        }))
      } finally {
        setLedgerSavingId(null)
      }
    },
    [ledgerForms, loadRecommendations]
  )

  const handleDownloadLedger = useCallback(async () => {
    setLedgerExporting(true)
    setState(current => ({ ...current, ledgerError: null }))
    try {
      await downloadRecommendationLedgerCsv({ provider, status: ledgerStatus })
      await loadRecommendations()
    } catch (error) {
      setState(current => ({
        ...current,
        ledgerError: error instanceof Error ? error.message : 'Unable to export recommendation ledger.',
      }))
    } finally {
      setLedgerExporting(false)
    }
  }, [ledgerStatus, loadRecommendations, provider])

  const dataSourceStatus = buildCostDataSourceStatus({
    health: state.health,
    importedSummary: state.importedSummary,
    diagnostics: state.diagnostics,
    primaryLoaded: state.loaded,
    pageName: 'Action Ledger',
    isLoading: loading,
  })

  const monthlyProviderSavings = useMemo(
    () => state.items.reduce((sum, rec) => sum + Number(rec.savings || 0), 0),
    [state.items]
  )
  const providerNativeCount = state.items.filter(item => {
    const source = String(item.source || '').toLowerCase()
    return (
      source.includes('optimizer') || source.includes('advisor') || source.includes('recommender')
    )
  }).length
  const ociCloudAdvisorItems = state.items.filter(item => {
    const source = String(item.source || '').toLowerCase()
    return item.cloud === 'oci' && source.includes('oci_optimizer')
  })
  const ociCloudAdvisorSummaries = ociCloudAdvisorItems.filter(
    item => item.source === 'oci_optimizer'
  )
  const ociCloudAdvisorActions = ociCloudAdvisorItems.filter(
    item => item.source === 'oci_optimizer_resource_action'
  )

  const awsCeItems = state.items.filter(item => {
    const source = String(item.source || '').toLowerCase()
    return (
      item.cloud === 'aws' &&
      (source.includes('aws_cost_explorer') ||
        source.includes('aws_ce') ||
        source.includes('aws_rightsizing'))
    )
  })
  const azureAdvisorItems = state.items.filter(item => {
    const source = String(item.source || '').toLowerCase()
    return item.cloud === 'azure' && source.includes('azure_advisor')
  })
  const gcpRecommenderItems = state.items.filter(item => {
    const source = String(item.source || '').toLowerCase()
    return item.cloud === 'gcp' && source.includes('gcp_recommender')
  })
  const sourceSummary = Object.entries(
    state.items.reduce<Record<string, { count: number; savings: number }>>((acc, item) => {
      const source = item.source || 'cost_context'
      acc[source] = acc[source] ?? { count: 0, savings: 0 }
      acc[source].count += 1
      acc[source].savings += Number(item.savings || 0)
      return acc
    }, {})
  ).sort((a, b) => b[1].savings - a[1].savings)
  const ledger = state.ledger
  const allLedgerItems = ledger?.items ?? []
  const ledgerSearchNormalized = ledgerSearch.trim().toLowerCase()
  const ledgerItems = ledgerSearchNormalized
    ? allLedgerItems.filter(item =>
        [
          item.provider,
          item.resource_id,
          item.resource_name,
          item.resource_type,
          item.account_id,
          item.region,
          item.recommendation_source,
          item.action,
          item.status,
          item.owner,
          item.reason,
          item.variance_reason,
        ]
          .join(' ')
          .toLowerCase()
          .includes(ledgerSearchNormalized)
      )
    : allLedgerItems
  const verifiedLedgerCount = ledgerItems.filter(item => item.status === 'verified').length
  const ledgerRealizationRate =
    ledger && ledger.total_planned_monthly_savings_usd > 0
      ? (ledger.total_realized_monthly_savings_usd / ledger.total_planned_monthly_savings_usd) * 100
      : 0

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-md">
              Action Ledger
            </Badge>
            <Badge
              variant="outline"
              className="rounded-md border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950/30"
            >
              Provider APIs · Execution queue · Decision score
            </Badge>
          </div>
          <h1 className="mb-2 text-4xl font-bold text-slate-900 dark:text-white">Action Ledger</h1>
          <p className="max-w-3xl text-slate-600 dark:text-slate-400">
            Ranked optimization actions from provider-native optimizers, rightsizing inventory, cost
            context, and decision-grade scoring. Use this as the owner follow-through queue after
            investigating details in Optimization Advisor.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <input
              type="checkbox"
              checked={includeLive}
              onChange={event => setIncludeLive(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            Live provider sync
          </label>
          <Button
            variant="outline"
            onClick={() => {
              forceNextApiRefresh()
              void loadRecommendations()
            }}
            className="rounded-lg"
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map(item => (
            <button
              key={item}
              onClick={() => setProvider(item)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                provider === item
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {item === 'all' ? 'All providers' : item.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Ledger status
          </span>
          {LEDGER_STATUSES.map(item => (
            <button
              key={item}
              onClick={() => setLedgerStatus(item)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium capitalize transition ${
                ledgerStatus === item
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <DataSourceBanner status={dataSourceStatus} />

      {state.error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {state.error}
        </div>
      )}

      {state.ledgerError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
          {state.ledgerError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          {
            label: 'Provider Recommendations',
            value: state.items.length.toLocaleString(),
            detail: `${providerNativeCount} native`,
            icon: Sparkles,
            color: 'from-blue-500 to-blue-600',
          },
          {
            label: 'Provider Monthly Savings',
            value: fmtK(monthlyProviderSavings),
            detail: includeLive ? 'live sync on' : 'stored context',
            icon: DollarSign,
            color: 'from-emerald-500 to-emerald-600',
          },
          {
            label: 'OCI VM Candidates',
            value: state.rightsizingCount.toLocaleString(),
            detail: state.rightsizingSource.replace(/_/g, ' '),
            icon: Zap,
            color: 'from-amber-500 to-amber-600',
          },
          {
            label: 'Tracked Ledger Rows',
            value: (ledger?.total_count ?? 0).toLocaleString(),
            detail: `${verifiedLedgerCount} verified · ${ledgerRealizationRate.toFixed(0)}% realized`,
            icon: ClipboardList,
            color: 'from-teal-500 to-teal-600',
          },
          {
            label: 'Connected Providers',
            value: connectedProviderCount(state.diagnostics).toLocaleString(),
            detail: `${state.diagnostics.length || PROVIDERS.length - 1} checked`,
            icon: ShieldCheck,
            color: 'from-violet-500 to-violet-600',
          },
        ].map(kpi => {
          const Icon = kpi.icon
          return (
            <div
              key={kpi.label}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <div className={`bg-gradient-to-br ${kpi.color} p-4 text-white`}>
                <Icon className="mb-2 h-5 w-5 opacity-85" />
                <p className="text-2xl font-bold">{kpi.value}</p>
                <p className="mt-1 text-xs opacity-85">{kpi.label}</p>
              </div>
              <div className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                {kpi.detail}
              </div>
            </div>
          )
        })}
      </div>

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center text-slate-500">
          <Loader className="mr-2 h-6 w-6 animate-spin" /> Loading provider recommendations...
        </div>
      ) : (
        <div className="space-y-8">
          <Expander
            title="Recommendation Workbench"
            description="Owner-ready provider opportunities, exact resource candidates, rankings, and source feeds."
            icon={<Sparkles className="h-5 w-5" />}
            defaultOpen
          >
            <div className="space-y-4">
              <Expander
                title="Execution Board"
                description="Persisted recommendation ledger rows for owner assignment, approvals, realization, and finance export."
                icon={<ClipboardList className="h-5 w-5" />}
                actions={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={event => {
                      event.stopPropagation()
                      void handleDownloadLedger()
                    }}
                    className="rounded-lg"
                    disabled={ledgerExporting || ledgerItems.length === 0}
                  >
                    <FileDown className={`mr-2 h-4 w-4 ${ledgerExporting ? 'animate-pulse' : ''}`} />
                    Export CSV
                  </Button>
                }
                defaultOpen
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {[
                      {
                        label: 'Planned / mo',
                        value: fmtK(ledger?.total_planned_monthly_savings_usd ?? 0),
                      },
                      {
                        label: 'Realized / mo',
                        value: fmtK(ledger?.total_realized_monthly_savings_usd ?? 0),
                      },
                      {
                        label: 'Variance / mo',
                        value: fmtK(ledger?.total_variance_monthly_usd ?? 0),
                      },
                    ].map(item => (
                      <div
                        key={item.label}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"
                      >
                        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {item.label}
                        </p>
                        <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {ledgerItems.length.toLocaleString()} visible row
                        {ledgerItems.length === 1 ? '' : 's'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Filtered from {(ledger?.items.length ?? 0).toLocaleString()} persisted
                        ledger row{ledger?.items.length === 1 ? '' : 's'}.
                      </p>
                    </div>
                    <input
                      value={ledgerSearch}
                      onChange={event => setLedgerSearch(event.target.value)}
                      placeholder="Search owner, provider, resource, reason"
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 md:max-w-md"
                    />
                  </div>

                  {ledgerItems.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                      <div className="overflow-x-auto">
                        <table className="min-w-[1180px] text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                              <th className="px-4 py-3">Recommendation</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3">Owner</th>
                              <th className="px-4 py-3 text-right">Plan / mo</th>
                              <th className="px-4 py-3">Realized / mo</th>
                              <th className="px-4 py-3 text-right">Variance</th>
                              <th className="px-4 py-3">Evidence note</th>
                              <th className="px-4 py-3">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ledgerItems.map(item => {
                              const draft = ledgerForms[item.id] || draftFromLedgerItem(item)
                              const saving = ledgerSavingId === item.id
                              return (
                                <tr
                                  key={`ledger-${item.id}`}
                                  className="border-b border-slate-100 align-top dark:border-slate-800"
                                >
                                  <td className="px-4 py-3">
                                    <div className="mb-2 flex flex-wrap gap-2">
                                      <Badge
                                        className={`rounded-md border text-xs ${providerTone(item.provider)}`}
                                      >
                                        {item.provider.toUpperCase()}
                                      </Badge>
                                      <Badge
                                        className={`rounded-md border text-xs ${sourceTone(item.recommendation_source)}`}
                                      >
                                        {sourceLabel(item.recommendation_source)}
                                      </Badge>
                                      <Badge
                                        className={`rounded-md border text-xs ${statusTone(item.status)}`}
                                      >
                                        {item.status}
                                      </Badge>
                                    </div>
                                    <div className="font-medium text-slate-900 dark:text-white">
                                      {item.resource_name || item.resource_id}
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                      {productCategory(`${item.resource_type} ${item.action}`)} ·{' '}
                                      {item.action} · seen {item.times_seen}x · last{' '}
                                      {readableDate(item.last_seen_at)}
                                    </div>
                                    <div className="mt-1 max-w-[34rem] break-all font-mono text-xs leading-5 text-slate-500 dark:text-slate-400">
                                      {item.resource_id}
                                    </div>
                                    {item.reason && (
                                      <p className="mt-2 max-w-[34rem] text-xs leading-5 text-slate-600 dark:text-slate-300">
                                        {item.reason}
                                      </p>
                                    )}
                                    {item.resource_console_url && (
                                      <a
                                        href={item.resource_console_url}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                                      >
                                        Open cloud console <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <select
                                      value={draft.status}
                                      onChange={event =>
                                        handleLedgerDraftChange(item.id, {
                                          status: event.target.value as RecommendationLedgerStatus,
                                        })
                                      }
                                      className="h-9 w-32 rounded-lg border border-slate-300 bg-white px-2 text-sm capitalize text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                    >
                                      {MUTABLE_LEDGER_STATUSES.map(status => (
                                        <option key={status} value={status}>
                                          {status}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="relative">
                                      <UserCheck className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                                      <input
                                        value={draft.owner}
                                        onChange={event =>
                                          handleLedgerDraftChange(item.id, {
                                            owner: event.target.value,
                                          })
                                        }
                                        placeholder="Owner"
                                        className="h-9 w-40 rounded-lg border border-slate-300 bg-white pl-8 pr-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                                    {fmt(item.planned_monthly_savings_usd)}
                                  </td>
                                  <td className="px-4 py-3">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={draft.realizedMonthlySavings}
                                      onChange={event =>
                                        handleLedgerDraftChange(item.id, {
                                          realizedMonthlySavings: event.target.value,
                                        })
                                      }
                                      placeholder="0.00"
                                      className="h-9 w-32 rounded-lg border border-slate-300 bg-white px-2 text-right text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                    />
                                  </td>
                                  <td
                                    className={`px-4 py-3 text-right font-semibold ${
                                      item.variance_monthly_usd >= 0
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-rose-600 dark:text-rose-400'
                                    }`}
                                  >
                                    {fmt(item.variance_monthly_usd)}
                                  </td>
                                  <td className="px-4 py-3">
                                    <textarea
                                      value={draft.varianceReason}
                                      onChange={event =>
                                        handleLedgerDraftChange(item.id, {
                                          varianceReason: event.target.value,
                                        })
                                      }
                                      placeholder="Approval note or finance evidence"
                                      className="min-h-[72px] w-56 resize-none rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <Button
                                      type="button"
                                      onClick={() => void handleSaveLedgerItem(item)}
                                      className="rounded-lg"
                                      disabled={saving}
                                    >
                                      <Save className={`mr-2 h-4 w-4 ${saving ? 'animate-pulse' : ''}`} />
                                      Save
                                    </Button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700">
                      No persisted recommendation ledger rows match this filter yet. Run
                      Optimization Advisor or refresh provider recommendations to populate planned
                      savings rows, then assign owners and record realized savings here.
                    </div>
                  )}
                </div>
              </Expander>

              <Expander
                title="Top OCI VM Candidates"
                description="Live OCI compute instance actions from VM inventory and Cloud Advisor signals."
                icon={<Zap className="h-5 w-5" />}
                actions={
                  <a
                    href="/dashboard/rightsizing?provider=oci"
                    className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    View OCI rightsizing list
                  </a>
                }
                defaultOpen
              >
                {state.rightsizingTop.length > 0 ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                            <th className="px-4 py-3">Resource</th>
                            <th className="px-4 py-3">Product</th>
                            <th className="px-4 py-3">Action</th>
                            <th className="px-4 py-3">Provider</th>
                            <th className="px-4 py-3 text-right">Savings / mo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {state.rightsizingTop.map(row => {
                            const consoleUrl = resourceConsoleUrl(row)
                            const product = productCategory(
                              `${row.resource_type} ${row.resource_name} ${row.reason} ${row.action}`
                            )
                            return (
                              <tr
                                key={`${row.provider}-${row.resource_id}-${row.action}`}
                                className="border-b border-slate-100 dark:border-slate-800"
                              >
                                <td className="px-4 py-3">
                                  <div className="font-medium text-slate-900 dark:text-white">
                                    {row.resource_name}
                                  </div>
                                  <div className="max-w-[44rem] break-all font-mono text-xs leading-5 text-slate-500 dark:text-slate-400">
                                    {row.resource_id}
                                  </div>
                                  {consoleUrl && (
                                    <a
                                      href={consoleUrl}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                                    >
                                      Open in cloud console <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {product}
                                </td>
                                <td className="px-4 py-3 capitalize text-slate-700 dark:text-slate-200">
                                  {row.action}
                                </td>
                                <td className="px-4 py-3">
                                  <Badge
                                    className={`rounded-md border text-xs ${providerTone(row.provider)}`}
                                  >
                                    {row.provider.toUpperCase()}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                  {fmt(row.monthly_savings_usd)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700">
                    No live OCI VM instance candidates were returned by the current provider
                    response. Account, tenancy, and service-level aggregates are kept out of this
                    table so only cloud-provider resource names appear here.
                  </div>
                )}
              </Expander>

              <Expander
                title="Decision-Grade Ranking"
                description="Prioritized by savings, confidence, urgency, and payback."
                icon={<TrendingDown className="h-5 w-5" />}
                actions={
                  <Badge variant="outline" className="rounded-md">
                    Model: deterministic ensemble
                  </Badge>
                }
                defaultOpen={state.decisionTop.length > 0}
              >
                {state.decisionTop.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {state.decisionTop.slice(0, 6).map(item => (
                      <div
                        key={item.recommendation_id}
                        className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div>
                            <div className="mb-1 flex flex-wrap gap-2">
                              <Badge
                                className={`rounded-md border text-xs ${providerTone(item.provider)}`}
                              >
                                {item.provider.toUpperCase()}
                              </Badge>
                              <Badge variant="outline" className="rounded-md text-xs">
                                {item.category}
                              </Badge>
                            </div>
                            <h3 className="font-semibold text-slate-900 dark:text-white">
                              {item.title}
                            </h3>
                          </div>
                          <div className="rounded-lg bg-blue-50 px-3 py-2 text-right text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                            <p className="text-lg font-bold">{item.decision_score.toFixed(0)}</p>
                            <p className="text-[11px]">score</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900">
                            <p className="text-xs text-slate-500">Savings</p>
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {fmt(item.estimated_monthly_savings_usd)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900">
                            <p className="text-xs text-slate-500">Confidence</p>
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {item.confidence_score.toFixed(0)}%
                            </p>
                          </div>
                          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900">
                            <p className="text-xs text-slate-500">Payback</p>
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {item.payback_months.toFixed(1)} mo
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700">
                    No decision-grade ranking is available for the current provider filter.
                  </div>
                )}
              </Expander>

              <Expander
                title="OCI Cloud Advisor"
                description="Native OCI Optimizer recommendation summaries and resource actions from the live provider feed."
                icon={<ShieldCheck className="h-5 w-5" />}
                actions={
                  <Badge variant="outline" className="rounded-md">
                    {ociCloudAdvisorSummaries.length} summaries · {ociCloudAdvisorActions.length}{' '}
                    resources
                  </Badge>
                }
                defaultOpen={provider === 'oci'}
              >
                {ociCloudAdvisorSummaries.length > 0 ? (
                  <div className="overflow-hidden rounded-xl border border-red-200 bg-white dark:border-red-900 dark:bg-slate-800">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                            <th className="px-4 py-3">Recommendation type</th>
                            <th className="px-4 py-3 text-right">Count</th>
                            <th className="px-4 py-3">Service</th>
                            <th className="px-4 py-3">Category</th>
                            <th className="px-4 py-3 text-right">Estimated savings</th>
                            <th className="px-4 py-3">Importance</th>
                            <th className="px-4 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ociCloudAdvisorSummaries.map(item => {
                            const consoleUrl =
                              'https://cloud.oracle.com/cloud-advisor/recommendations'
                            return (
                              <tr
                                key={`oci-advisor-summary-${item.id}-${item.title}`}
                                className="border-b border-slate-100 dark:border-slate-800"
                              >
                                <td className="px-4 py-3">
                                  <div className="font-medium text-slate-900 dark:text-white">
                                    {item.title}
                                  </div>
                                  {consoleUrl && (
                                    <a
                                      href={consoleUrl}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                                    >
                                      Open OCI console <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                                  {item.resource_count ?? 0}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {item.service}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {item.category || 'Cost management'}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                  {item.savings > 0 ? fmt(item.savings) : '-'}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {item.importance || 'Medium'}
                                </td>
                                <td className="px-4 py-3">
                                  <Badge className="rounded-md border border-emerald-200 bg-emerald-50 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                                    {item.status || 'Active'}
                                  </Badge>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700">
                    No OCI Cloud Advisor items were returned by the current provider filter. Select
                    OCI or All providers and keep live provider sync enabled.
                  </div>
                )}
              </Expander>

              {awsCeItems.length > 0 && (
                <Expander
                  title="AWS Cost Explorer"
                  description="Savings Plans and Reserved Instance commitment recommendations from AWS Cost Explorer."
                  icon={<DollarSign className="h-5 w-5" />}
                  actions={
                    <Badge variant="outline" className="rounded-md">
                      {awsCeItems.length} recommendation{awsCeItems.length === 1 ? '' : 's'} ·{' '}
                      {fmtK(awsCeItems.reduce((s, i) => s + Number(i.savings || 0), 0))}/mo
                    </Badge>
                  }
                >
                  <div className="overflow-hidden rounded-xl border border-orange-200 bg-white dark:border-orange-800 dark:bg-slate-800">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                            <th className="px-4 py-3">Recommendation</th>
                            <th className="px-4 py-3">Service</th>
                            <th className="px-4 py-3">Source</th>
                            <th className="px-4 py-3">Difficulty</th>
                            <th className="px-4 py-3 text-right">Savings / mo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {awsCeItems.map(item => {
                            const consoleUrl = resourceConsoleUrl(item)
                            return (
                              <tr
                                key={`aws-ce-${item.id}-${item.source}`}
                                className="border-b border-slate-100 dark:border-slate-800"
                              >
                                <td className="px-4 py-3">
                                  <div className="font-medium text-slate-900 dark:text-white">
                                    {item.title}
                                  </div>
                                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    {item.description}
                                  </div>
                                  {consoleUrl && (
                                    <a
                                      href={consoleUrl}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                                    >
                                      Open AWS console <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {item.service}
                                </td>
                                <td className="px-4 py-3">
                                  <Badge
                                    className={`rounded-md border text-xs ${sourceTone(item.source)}`}
                                  >
                                    {sourceLabel(item.source)}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge
                                    className={`rounded-md border text-xs ${difficultyTone(item.difficulty)}`}
                                  >
                                    {item.difficulty}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                  {fmt(item.savings)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Expander>
              )}

              {azureAdvisorItems.length > 0 && (
                <Expander
                  title="Azure Advisor"
                  description="Cost recommendations from Azure Advisor across connected subscriptions."
                  icon={<Sparkles className="h-5 w-5" />}
                  actions={
                    <Badge variant="outline" className="rounded-md">
                      {azureAdvisorItems.length} recommendation
                      {azureAdvisorItems.length === 1 ? '' : 's'} ·{' '}
                      {fmtK(azureAdvisorItems.reduce((s, i) => s + Number(i.savings || 0), 0))}/mo
                    </Badge>
                  }
                >
                  <div className="overflow-hidden rounded-xl border border-blue-200 bg-white dark:border-blue-800 dark:bg-slate-800">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                            <th className="px-4 py-3">Recommendation</th>
                            <th className="px-4 py-3">Service</th>
                            <th className="px-4 py-3">Resource</th>
                            <th className="px-4 py-3">Difficulty</th>
                            <th className="px-4 py-3 text-right">Savings / mo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {azureAdvisorItems.map(item => {
                            const consoleUrl = resourceConsoleUrl(item)
                            return (
                              <tr
                                key={`azure-advisor-${item.id}-${item.source}`}
                                className="border-b border-slate-100 dark:border-slate-800"
                              >
                                <td className="px-4 py-3">
                                  <div className="font-medium text-slate-900 dark:text-white">
                                    {item.title}
                                  </div>
                                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    {item.description}
                                  </div>
                                  {consoleUrl && (
                                    <a
                                      href={consoleUrl}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                                    >
                                      Open Azure portal <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {item.service}
                                </td>
                                <td className="px-4 py-3">
                                  {item.resource_name ? (
                                    <div className="font-medium text-slate-900 dark:text-white">
                                      {item.resource_name}
                                    </div>
                                  ) : null}
                                  {item.resource_id ? (
                                    <div className="max-w-[300px] truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                                      {item.resource_id}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="px-4 py-3">
                                  <Badge
                                    className={`rounded-md border text-xs ${difficultyTone(item.difficulty)}`}
                                  >
                                    {item.difficulty}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                  {fmt(item.savings)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Expander>
              )}

              {gcpRecommenderItems.length > 0 && (
                <Expander
                  title="GCP Recommender"
                  description="Machine type, idle resource, commitment, and storage recommendations from the GCP Recommender API."
                  icon={<Zap className="h-5 w-5" />}
                  actions={
                    <Badge variant="outline" className="rounded-md">
                      {gcpRecommenderItems.length} recommendation
                      {gcpRecommenderItems.length === 1 ? '' : 's'} ·{' '}
                      {fmtK(gcpRecommenderItems.reduce((s, i) => s + Number(i.savings || 0), 0))}/mo
                    </Badge>
                  }
                >
                  <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white dark:border-emerald-800 dark:bg-slate-800">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                            <th className="px-4 py-3">Recommendation</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3">Region</th>
                            <th className="px-4 py-3">Resource</th>
                            <th className="px-4 py-3 text-right">Savings / mo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gcpRecommenderItems.map(item => {
                            const consoleUrl = resourceConsoleUrl(item)
                            return (
                              <tr
                                key={`gcp-rec-${item.id}-${item.source}`}
                                className="border-b border-slate-100 dark:border-slate-800"
                              >
                                <td className="px-4 py-3">
                                  <div className="font-medium text-slate-900 dark:text-white">
                                    {item.title}
                                  </div>
                                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    {item.description}
                                  </div>
                                  {consoleUrl && (
                                    <a
                                      href={consoleUrl}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                                    >
                                      Open GCP console <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {productCategory(`${item.service} ${item.title}`)}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {item.region || 'global'}
                                </td>
                                <td className="px-4 py-3">
                                  {item.resource_name ? (
                                    <div className="font-medium text-slate-900 dark:text-white">
                                      {item.resource_name}
                                    </div>
                                  ) : null}
                                  {item.resource_id ? (
                                    <div className="max-w-[260px] truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                                      {item.resource_id}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                  {fmt(item.savings)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Expander>
              )}

              <Expander
                title="Provider Recommendation Feed"
                description="Themes and native recommendations grouped from connected cloud providers."
                icon={<Layers3 className="h-5 w-5" />}
                actions={
                  <div className="text-sm text-slate-500">
                    OCI VM candidate total: {fmtK(state.rightsizingMonthlySavings)}/mo
                  </div>
                }
              >
                <div className="space-y-3">
                  {sourceSummary.length > 0 && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {sourceSummary.slice(0, 4).map(([source, summary]) => (
                        <div key={source} className={`rounded-xl border p-4 ${sourceTone(source)}`}>
                          <p className="text-sm font-semibold">{sourceLabel(source)}</p>
                          <p className="mt-2 text-2xl font-bold">{fmtK(summary.savings)}</p>
                          <p className="mt-1 text-xs">
                            {summary.count} recommendation{summary.count === 1 ? '' : 's'} / mo
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {state.items.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
                      <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
                      <p className="text-sm text-slate-500">
                        No recommendation themes are available yet. Keep live provider sync enabled,
                        connect providers, or run a fresh scan.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {state.items.map(rec => {
                        const consoleUrl = resourceConsoleUrl(rec)
                        const product = productCategory(
                          `${rec.service} ${rec.title} ${rec.description}`
                        )
                        return (
                          <div
                            key={`${rec.cloud}-${rec.id}-${rec.source}`}
                            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                          >
                            <div className="mb-3 flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                  <Badge
                                    className={`rounded-md border text-xs ${providerTone(rec.cloud)}`}
                                  >
                                    {rec.cloud.toUpperCase()}
                                  </Badge>
                                  <Badge
                                    className={`rounded-md border text-xs ${sourceTone(rec.source)}`}
                                  >
                                    {sourceLabel(rec.source)}
                                  </Badge>
                                  <Badge
                                    className={`rounded-md border text-xs ${difficultyTone(rec.difficulty)}`}
                                  >
                                    {rec.difficulty}
                                  </Badge>
                                </div>
                                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                                  {rec.title}
                                </h3>
                                <p className="mt-1 text-xs text-slate-500">
                                  {product} · {rec.service}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="flex items-center justify-end gap-1 text-emerald-600 dark:text-emerald-400">
                                  <DollarSign className="h-4 w-4" />
                                  <span className="text-xl font-bold">
                                    {rec.savings.toLocaleString(undefined, {
                                      maximumFractionDigits: 0,
                                    })}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500">monthly</p>
                              </div>
                            </div>

                            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
                              {rec.description}
                            </p>

                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-3 text-sm">
                                <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                  <TrendingDown className="h-4 w-4" /> ROI {rec.roi.toFixed(0)}%
                                </span>
                                {rec.resource_id && (
                                  <span className="min-w-0 max-w-full break-all font-mono text-xs leading-5 text-slate-500">
                                    {rec.resource_id}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {consoleUrl && (
                                  <a
                                    href={consoleUrl}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                                  >
                                    Open console <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                )}
                                <a
                                  href={`/dashboard/rightsizing?provider=${encodeURIComponent(rec.cloud)}`}
                                  className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-blue-600 dark:text-slate-200 dark:hover:text-blue-400"
                                >
                                  Details <ArrowRight className="h-3.5 w-3.5" />
                                </a>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </Expander>

              <Expander
                title="Page Wiring"
                description="How provider APIs, rightsizing, and decision scoring feed this screen."
                icon={<Layers3 className="h-5 w-5" />}
              >
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200">
                  <div className="flex items-start gap-3">
                    <Layers3 className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <strong>How this page is wired:</strong> provider-native APIs populate the
                      feed, rightsizing supplies exact resources, decision-grade scoring ranks the
                      actions, and the persisted recommendation ledger stores owner, status,
                      realized savings, variance notes, and export timestamps. Use the provider and
                      status filters to isolate OCI, AWS, Azure, or GCP execution work.
                    </div>
                  </div>
                </div>
              </Expander>
            </div>
          </Expander>
        </div>
      )}
    </div>
  )
}
