'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle,
  ChevronDown,
  Cloud,
  Clock3,
  Database,
  DollarSign,
  ExternalLink,
  Filter,
  Info,
  Loader,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react'
import { fetchRightsizingRecommendations, forceNextApiRefresh } from '@/lib/api'
import { RightsizingResponse, RightsizingRecommendation } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Expander } from '@/components/ui/expander'

const PROVIDERS = ['all', 'aws', 'azure', 'gcp', 'oci']
const ACTIONS = ['all', 'downsize', 'terminate', 'reserve', 'modernize']
const PRODUCT_LABELS: Record<string, string> = {
  all: 'All products',
  compute: 'Compute',
  storage: 'Storage',
  commitments: 'Commitments',
  database: 'Database',
  network: 'Network',
  kubernetes: 'Kubernetes',
  governance: 'Governance',
  other: 'Other',
}
const PROVIDER_ADVISOR_SOURCES = ['optimizer', 'advisor', 'recommender', 'cost_explorer', 'provider_recommendations']
const OCI_CLOUD_ADVISOR_CONSOLE_URL = 'https://cloud.oracle.com/cloud-advisor/recommendations'

function recommendationText(rec: RightsizingRecommendation): string {
  return [
    rec.provider_recommendation_type,
    rec.provider_recommendation_name,
    rec.provider_recommendation_category,
    rec.provider_recommendation_status,
    rec.provider_recommendation_importance,
    rec.resource_type,
    rec.resource_name,
    rec.current_size,
    rec.recommended_size,
    rec.reason,
    rec.evidence_source,
    rec.action,
  ].join(' ').toLowerCase()
}

function hasProviderAdvisorMetadata(rec: RightsizingRecommendation): boolean {
  return Boolean(
    rec.provider_recommendation_type
      || rec.provider_recommendation_name
      || rec.provider_recommendation_category
      || rec.provider_recommendation_status
      || rec.provider_recommendation_importance
      || (rec.provider_recommendation_resource_count !== null && rec.provider_recommendation_resource_count !== undefined),
  )
}

function isProviderAdvisorFinding(rec: RightsizingRecommendation): boolean {
  if (hasProviderAdvisorMetadata(rec)) return true
  const source = rec.evidence_source.toLowerCase()
  if (PROVIDER_ADVISOR_SOURCES.some((token) => source.includes(token))) return true
  if (rec.provider === 'oci' && source.includes('storage_inventory') && isUnattachedStorageFinding(rec)) return true
  return false
}

function advisorTitle(rec: RightsizingRecommendation): string {
  return rec.provider_recommendation_type
    || rec.provider_recommendation_name
    || (rec.action === 'terminate' && isUnattachedStorageFinding(rec) ? 'Delete unattached storage resources' : rec.resource_name)
}

function advisorCategory(rec: RightsizingRecommendation): string {
  return rec.provider_recommendation_category || PRODUCT_LABELS[productCategory(rec)] || 'Optimization'
}

function advisorStatus(rec: RightsizingRecommendation): string {
  return rec.provider_recommendation_status || (isProviderAdvisorFinding(rec) ? 'Active' : 'Candidate')
}

function advisorImportance(rec: RightsizingRecommendation): string {
  return rec.provider_recommendation_importance || `${rec.confidence.charAt(0).toUpperCase()}${rec.confidence.slice(1)}`
}

function advisorResourceCount(rec: RightsizingRecommendation): number {
  if (rec.provider_recommendation_resource_count !== null && rec.provider_recommendation_resource_count !== undefined) {
    return Math.max(rec.provider_recommendation_resource_count, 0)
  }
  if (rec.resource_id.startsWith('provider-rec-')) return Math.max(rec.analysis_points || 1, 1)
  return 1
}

function isUnattachedStorageFinding(rec: RightsizingRecommendation): boolean {
  const text = recommendationText(rec)
  return /unattached|detached|orphan/.test(text) && /volume|boot|block|storage|disk/.test(text)
}

function statusTone(status: string): 'emerald' | 'blue' | 'amber' | 'slate' | 'rose' | 'violet' {
  const normalized = status.toLowerCase()
  if (normalized.includes('active') || normalized.includes('open')) return 'emerald'
  if (normalized.includes('pending') || normalized.includes('deferred')) return 'amber'
  if (normalized.includes('dismiss') || normalized.includes('inactive') || normalized.includes('closed')) return 'slate'
  return 'blue'
}

function importanceTone(importance: string): 'emerald' | 'blue' | 'amber' | 'slate' | 'rose' | 'violet' {
  const normalized = importance.toLowerCase()
  if (normalized.includes('critical') || normalized.includes('high')) return 'rose'
  if (normalized.includes('medium') || normalized.includes('moderate')) return 'amber'
  if (normalized.includes('low')) return 'slate'
  return 'blue'
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtK(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`
  return fmt(n)
}
function fmtDate(v: string | null) {
  if (!v) return 'n/a'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleString()
}

function compactSource(source?: string): string {
  if (!source) return 'No source yet'
  return source.replace(/_/g, ' ')
}

function scanModeLabel(refreshLive: boolean): string {
  return refreshLive ? 'Live provider scan' : 'Stored scan results'
}

function scanModeDescription(refreshLive: boolean, data: RightsizingResponse | null): string {
  if (refreshLive) {
    return data
      ? `Live refresh completed from ${compactSource(data.data_source)}.`
      : 'Live refresh asks provider APIs for fresh recommendations before using stored signals.'
  }
  return data
    ? `Fast dashboard mode using ${compactSource(data.data_source)}.`
    : 'Fast dashboard mode uses the latest stored scan and imported-cost signals.'
}

function initialProviderFilter(): string {
  if (typeof window === 'undefined') return 'all'
  const value = new URLSearchParams(window.location.search).get('provider')?.toLowerCase() || 'all'
  return PROVIDERS.includes(value) ? value : 'all'
}

function initialLiveRefresh(): boolean {
  if (typeof window === 'undefined') return true
  const params = new URLSearchParams(window.location.search)
  const raw = params.get('refresh_live') || params.get('live')
  if (raw === null) return true
  return !['0', 'false', 'no'].includes(raw.toLowerCase())
}

function sourceQuality(source?: string): { label: string; tone: 'emerald' | 'blue' | 'amber' | 'slate' } {
  const normalized = (source || '').toLowerCase()
  if (!normalized || normalized === 'no_data_available') return { label: 'No data', tone: 'slate' }
  if (normalized.includes('live') || normalized.includes('cloudwatch') || normalized.includes('advisor') || normalized.includes('inventory')) {
    return { label: 'Live provider evidence', tone: 'emerald' }
  }
  if (normalized.includes('multi')) return { label: 'Blended evidence', tone: 'blue' }
  if (normalized.includes('snapshot') || normalized.includes('trend') || normalized.includes('imported')) {
    return { label: 'Stored evidence', tone: 'amber' }
  }
  return { label: 'Backend evidence', tone: 'blue' }
}

function requestErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown request failure.'
  const message = error.message.trim()
  if (!message) return 'Unknown request failure.'
  try {
    const payload = JSON.parse(message) as { detail?: unknown }
    if (typeof payload.detail === 'string' && payload.detail.trim()) {
      return payload.detail.trim()
    }
    if (Array.isArray(payload.detail) && payload.detail.length > 0) {
      return payload.detail.map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg?: unknown }).msg)
        }
        return JSON.stringify(item)
      }).join('; ')
    }
  } catch {
    // Plain text error from requestJson.
  }
  return message
}

function actionColor(action: string) {
  return {
    downsize: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
    terminate: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300',
    reserve: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300',
    modernize: 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-300',
  }[action] ?? 'border-slate-200 bg-slate-50 text-slate-600'
}

function confidenceColor(c: string) {
  return { high: 'text-emerald-600 dark:text-emerald-400', medium: 'text-amber-600 dark:text-amber-400', low: 'text-rose-600 dark:text-rose-400' }[c] ?? ''
}

function effortColor(e: string) {
  return {
    low: 'text-emerald-600 dark:text-emerald-400',
    medium: 'text-amber-600 dark:text-amber-400',
    high: 'text-rose-600 dark:text-rose-400',
  }[e] ?? 'text-slate-500'
}

function toneClasses(tone: 'emerald' | 'blue' | 'amber' | 'slate' | 'rose' | 'violet'): string {
  return {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200',
    blue: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200',
    amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200',
    slate: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    rose: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200',
    violet: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-200',
  }[tone]
}

function StatusTile({
  label,
  value,
  helper,
  icon,
  tone,
}: {
  label: string
  value: string
  helper: string
  icon: ReactNode
  tone: 'emerald' | 'blue' | 'amber' | 'slate' | 'rose' | 'violet'
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <span className={`rounded-lg border p-2 ${toneClasses(tone)}`}>{icon}</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-base font-semibold leading-6 text-slate-950 [overflow-wrap:anywhere] dark:text-white">{value}</p>
          <p className="mt-2 text-sm leading-5 text-slate-600 [overflow-wrap:anywhere] dark:text-slate-400">{helper}</p>
        </div>
      </div>
    </div>
  )
}

function FriendlyNotice({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'emerald' | 'blue' | 'amber' | 'rose'
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <div className={`rounded-lg border p-4 text-sm ${toneClasses(tone)}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <div className="mt-1 leading-6 [overflow-wrap:anywhere]">{children}</div>
        </div>
      </div>
    </div>
  )
}

function InlineDisclosure({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-3 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">{title}</span>
          {description ? <span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span> : null}
        </span>
        <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <div className="border-t border-slate-200 p-3 dark:border-slate-700">{children}</div> : null}
    </div>
  )
}

function providerColor(p: string) {
  return {
    aws: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300',
    azure: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
    gcp: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
    oci: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300',
  }[p] ?? 'border-slate-200 bg-slate-50 text-slate-600'
}

function productCategory(rec: RightsizingRecommendation): string {
  const text = recommendationText(rec)

  if (rec.action === 'reserve' || /reservation|reserved|commitment|savings plan|committed use|coverage/.test(text)) return 'commitments'
  if (/storage|volume|disk|snapshot|backup|bucket|object|blob|archive/.test(text)) return 'storage'
  if (/database|\bdb\b|postgres|mysql|sql|rds|aurora|autonomous|oracle database|cosmos|spanner|bigquery/.test(text)) return 'database'
  if (/kubernetes|\bk8s\b|cluster|nodepool|node pool|container|namespace|pod/.test(text)) return 'kubernetes'
  if (/network|load balancer|nat|gateway|cdn|dns|ip address|egress|bandwidth|firewall|waf/.test(text)) return 'network'
  if (/tag|budget|policy|governance|anomaly|alert|schedule|scheduler/.test(text)) return 'governance'
  if (/compute|instance|virtual machine|\bvm\b|ec2|shape|cpu|memory|rightsizing|downsize/.test(text)) return 'compute'
  return 'other'
}

function productTone(product: string) {
  return {
    compute: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300',
    storage: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
    commitments: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300',
    database: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300',
    network: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-300',
    kubernetes: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
    governance: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
    other: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  }[product] ?? 'border-slate-200 bg-slate-50 text-slate-700'
}

function ociResourceConsoleUrl(rec: RightsizingRecommendation): string | null {
  const resourceId = String(rec.resource_id || '').trim()
  const resourceType = String(rec.resource_type || '').toLowerCase()
  const region = String(rec.region || '').trim()
  const suffix =
    region && !['global', 'unknown', 'n/a'].includes(region.toLowerCase())
      ? `?region=${encodeURIComponent(region)}`
      : ''
  const encoded = encodeURIComponent(resourceId)

  if (resourceId.startsWith('ocid1.bootvolume.') || resourceType.includes('bootvolume') || resourceType.includes('boot volume')) {
    return resourceId.startsWith('ocid1.bootvolume.')
      ? `https://cloud.oracle.com/block-storage/boot-volumes/${encoded}${suffix}`
      : `https://cloud.oracle.com/block-storage/boot-volumes${suffix}`
  }
  if (
    resourceId.startsWith('ocid1.volume.') ||
    resourceType.includes('blockvolume') ||
    resourceType.includes('block volume') ||
    resourceType === 'volume'
  ) {
    return resourceId.startsWith('ocid1.volume.')
      ? `https://cloud.oracle.com/block-storage/volumes/${encoded}${suffix}`
      : `https://cloud.oracle.com/block-storage/volumes${suffix}`
  }
  if (resourceId.startsWith('ocid1.instance.')) {
    return `https://cloud.oracle.com/compute/instances/${encoded}${suffix}`
  }
  if (resourceId.startsWith('ocid1.loadbalancer.')) {
    return `https://cloud.oracle.com/networking/load-balancers/${encoded}${suffix}`
  }
  if (resourceId.startsWith('ocid1.autonomousdatabase.')) {
    return `https://cloud.oracle.com/db/adbs/${encoded}${suffix}`
  }
  if (resourceType.includes('objectstorage') || resourceType.includes('object storage') || resourceType.includes('bucket')) {
    return `https://cloud.oracle.com/object-storage/buckets${suffix}`
  }
  return resourceId.startsWith('ocid1.') ? `https://cloud.oracle.com/resources${suffix}` : null
}

function resourceConsoleUrl(rec: RightsizingRecommendation): string | null {
  if (rec.provider === 'oci') {
    return ociResourceConsoleUrl(rec) || rec.resource_console_url
  }
  if (rec.resource_console_url) return rec.resource_console_url

  const region = (rec.region || '').trim()
  const normalizedRegion = region && !['global', 'unknown', 'n/a'].includes(region.toLowerCase()) ? region : ''
  if (rec.provider === 'aws') {
    const awsRegion = normalizedRegion || 'us-east-1'
    return `https://${awsRegion}.console.aws.amazon.com/ec2/home?region=${encodeURIComponent(awsRegion)}#Instances:`
  }
  if (rec.provider === 'azure') {
    return 'https://portal.azure.com/#view/HubsExtension/BrowseAllResources'
  }
  if (rec.provider === 'gcp') {
    return 'https://console.cloud.google.com/compute/instances'
  }
  return null
}

function providerAdvisorConsoleUrl(rec: RightsizingRecommendation): string | null {
  if (rec.provider === 'oci' && (hasProviderAdvisorMetadata(rec) || rec.evidence_source.toLowerCase().includes('optimizer'))) {
    return ociResourceConsoleUrl(rec) || OCI_CLOUD_ADVISOR_CONSOLE_URL
  }
  return resourceConsoleUrl(rec)
}

function UtilBar({ label, value }: { label: string; value: number | null }) {
  if (value === null || value === undefined) return null
  const color = value < 20 ? 'bg-rose-400' : value < 40 ? 'bg-amber-400' : 'bg-emerald-400'
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 text-slate-500 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className={`w-10 text-right font-mono ${value < 20 ? 'text-rose-600' : 'text-slate-600'} dark:text-slate-400`}>{value.toFixed(0)}%</span>
    </div>
  )
}

function utilizationHealth(value: number | null): string {
  if (value === null || value === undefined) return 'n/a'
  if (value < 20) return 'very low'
  if (value < 40) return 'low'
  if (value < 70) return 'moderate'
  return 'healthy'
}

function implementationSteps(rec: RightsizingRecommendation): string[] {
  if (rec.action === 'downsize') {
    return [
      `Capture baseline performance for ${rec.resource_name} (CPU, memory, latency) for 7 days.`,
      `Apply right-size change from ${rec.current_size} to ${rec.recommended_size} in a maintenance window.`,
      'Observe workload for one full business cycle and watch for throttling or saturation alerts.',
      'Lock in the change and update capacity guardrails/autoscaling thresholds.',
    ]
  }
  if (rec.action === 'terminate') {
    return [
      `Confirm dependency ownership for ${rec.resource_name} and verify no active traffic.`,
      'Take snapshot/backup and set a short hold period before deletion.',
      'Terminate the resource and monitor error budgets for 24-48h.',
      'Close the action after cost delta appears in billing export.',
    ]
  }
  if (rec.action === 'reserve') {
    return [
      `Validate usage stability for ${rec.resource_name} over at least 14-30 days.`,
      'Select term/payment option matching finance policy and flexibility needs.',
      'Purchase reservation/commitment and map coverage to target workload.',
      'Track realized discount versus baseline on the next billing cycles.',
    ]
  }
  return [
    `Evaluate modernization target replacing ${rec.current_size}.`,
    'Run benchmark/A-B canary with production-like traffic.',
    'Migrate progressively with observability and rollback readiness.',
    'Finalize cutover and remove legacy footprint.',
  ]
}

function rollbackPlan(rec: RightsizingRecommendation): string {
  if (rec.action === 'terminate') {
    return 'Restore from latest snapshot/backup and reattach dependencies if regression is detected.'
  }
  if (rec.action === 'reserve') {
    return 'Keep a mixed on-demand baseline and shift only stable capacity first.'
  }
  return `Revert to ${rec.current_size} and restore previous autoscaling/limits if SLO degradation appears.`
}

function ProviderAdvisorFindings({
  findings,
  hasUnfilteredFindings,
  refreshLive,
  loading,
  onSelectAction,
  onSelectProduct,
  onEnableLive,
}: {
  findings: RightsizingRecommendation[]
  hasUnfilteredFindings: boolean
  refreshLive: boolean
  loading: boolean
  onSelectAction: (action: string) => void
  onSelectProduct: (product: string) => void
  onEnableLive: () => void
}) {
  const totalSavings = findings.reduce((sum, rec) => sum + rec.monthly_savings_usd, 0)
  const totalResources = findings.reduce((sum, rec) => sum + advisorResourceCount(rec), 0)
  const storageFindings = findings.filter((rec) => productCategory(rec) === 'storage' || isUnattachedStorageFinding(rec))
  const storageSavings = storageFindings.reduce((sum, rec) => sum + rec.monthly_savings_usd, 0)
  const unattachedVolumeCount = findings
    .filter(isUnattachedStorageFinding)
    .reduce((sum, rec) => sum + advisorResourceCount(rec), 0)

  return (
    <Expander
      title="Provider Advisor Findings"
      description="Provider-native recommendations with Cloud Advisor-style counts, category, savings, importance, and status."
      icon={<Cloud className="h-5 w-5" />}
      defaultOpen
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatusTile
            label="Advisor findings"
            value={findings.length.toLocaleString()}
            helper={`${totalResources.toLocaleString()} resource${totalResources === 1 ? '' : 's'} represented in the visible provider rows.`}
            icon={<Cloud className="h-5 w-5" />}
            tone="blue"
          />
          <StatusTile
            label="Advisor savings"
            value={`${fmtK(totalSavings)}/mo`}
            helper="Estimated monthly savings from provider-native optimizer signals."
            icon={<DollarSign className="h-5 w-5" />}
            tone="emerald"
          />
          <StatusTile
            label="Storage cleanup"
            value={`${fmtK(storageSavings)}/mo`}
            helper={`${storageFindings.length.toLocaleString()} storage cleanup finding${storageFindings.length === 1 ? '' : 's'} in the current view.`}
            icon={<Trash2 className="h-5 w-5" />}
            tone="rose"
          />
          <StatusTile
            label="Unattached volumes"
            value={unattachedVolumeCount.toLocaleString()}
            helper="Block, boot, or disk resources marked unattached, detached, or orphaned."
            icon={<Database className="h-5 w-5" />}
            tone="amber"
          />
        </div>

        {findings.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                    <th className="px-4 py-3">Recommendation type</th>
                    <th className="px-4 py-3 text-right">Count</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Estimated savings</th>
                    <th className="px-4 py-3">Importance</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Scope</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((rec) => {
                    const consoleUrl = providerAdvisorConsoleUrl(rec)
                    const product = productCategory(rec)
                    const status = advisorStatus(rec)
                    const importance = advisorImportance(rec)
                    return (
                      <tr key={`advisor-${rec.provider}-${rec.resource_id}-${rec.region}-${rec.action}-${advisorTitle(rec)}`} className="border-b border-slate-100 align-top dark:border-slate-800">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-white">{advisorTitle(rec)}</div>
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{compactSource(rec.evidence_source)}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{advisorResourceCount(rec).toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{rec.resource_type || 'Cloud service'}</td>
                        <td className="px-4 py-3">
                          <Badge className={`rounded-md border text-xs ${productTone(product)}`}>
                            {advisorCategory(rec)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">{rec.monthly_savings_usd > 0 ? fmt(rec.monthly_savings_usd) : '-'}</td>
                        <td className="px-4 py-3">
                          <Badge className={`rounded-md border text-xs ${toneClasses(importanceTone(importance))}`}>
                            {importance}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`rounded-md border text-xs ${toneClasses(statusTone(status))}`}>
                            {status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                          <div>{rec.provider.toUpperCase()} · {rec.region || 'global'}</div>
                          <div className="mt-0.5 max-w-[18rem] truncate font-mono">{rec.account_id || 'n/a'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-2">
                            {consoleUrl ? (
                              <a
                                href={consoleUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                              >
                                Open provider
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                onSelectProduct(product)
                                onSelectAction(rec.action)
                              }}
                              className="text-xs font-medium text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
                            >
                              Show matching cards
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <FriendlyNotice
            tone={refreshLive ? 'amber' : 'blue'}
            icon={<Info className="h-4 w-4" />}
            title={hasUnfilteredFindings ? 'Advisor findings are hidden by filters' : 'Provider advisor data is not loaded yet'}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {hasUnfilteredFindings
                  ? 'Clear search or product/action filters to show the provider-native findings.'
                  : refreshLive
                    ? 'The current provider response did not include Cloud Advisor rows. Storage inventory cleanup findings still appear when OCI returns unattached volumes.'
                    : 'Run a live provider scan to pull OCI Cloud Advisor and other provider recommendation APIs into this page.'}
              </span>
              {!refreshLive && !hasUnfilteredFindings ? (
                <Button type="button" variant="outline" onClick={onEnableLive} disabled={loading} className="rounded-lg bg-white/70 dark:bg-slate-900/70">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Run live scan
                </Button>
              ) : null}
            </div>
          </FriendlyNotice>
        )}
      </div>
    </Expander>
  )
}

function RecCard({ rec }: { rec: RightsizingRecommendation }) {
  const consoleUrl = resourceConsoleUrl(rec)
  const product = productCategory(rec)
  const providerFinding = isProviderAdvisorFinding(rec)
  const aggregateScope = rec.resource_type.toLowerCase().includes('aggregate')
    || rec.evidence_source.includes('cost_trend')
    || rec.evidence_source.includes('imported')
    || rec.resource_id.startsWith('provider-rec-')
  const monthlyDeltaPct = rec.current_monthly_cost_usd > 0
    ? ((rec.current_monthly_cost_usd - rec.projected_monthly_cost_usd) / rec.current_monthly_cost_usd) * 100
    : 0
  return (
    <Card className="rounded-xl hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex flex-col gap-3">
          {/* Top row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge className={`rounded-md border text-xs ${providerColor(rec.provider)}`}>{rec.provider.toUpperCase()}</Badge>
                <Badge className={`rounded-md border text-xs ${productTone(product)}`}>{PRODUCT_LABELS[product] ?? product}</Badge>
                <Badge className={`rounded-md border text-xs ${actionColor(rec.action)}`}>{rec.action}</Badge>
                {providerFinding && (
                  <Badge className="rounded-md border border-red-200 bg-red-50 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                    Provider advisor
                  </Badge>
                )}
                <span className={`text-xs font-medium ${confidenceColor(rec.confidence)}`}>{rec.confidence} confidence</span>
                <span className={`text-xs font-medium ${effortColor(rec.effort)}`}>effort: {rec.effort}</span>
              </div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{providerFinding ? advisorTitle(rec) : rec.resource_name}</p>
              <p className="text-xs text-slate-400 font-mono break-all">{rec.resource_id} · {rec.resource_type} · {rec.region}</p>
              <p className="text-xs text-slate-500 mt-0.5">account: {rec.account_id || 'n/a'}</p>
              {consoleUrl && (
                <a
                  href={consoleUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Open in cloud console
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {aggregateScope && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  Scope is account/regional aggregate. Pick exact resource targets before executing changes.
                  {' '}
                  <a href={`/dashboard/inventory?provider=${encodeURIComponent(rec.provider)}&region=${encodeURIComponent(rec.region)}`} className="underline hover:no-underline">
                    Open inventory filtered to this scope
                  </a>
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{fmt(rec.monthly_savings_usd)}<span className="text-xs text-slate-400">/mo</span></p>
              <p className="text-xs text-slate-400">{fmtK(rec.annual_savings_usd)}/yr savings</p>
            </div>
          </div>

          {/* Size change */}
          <div className="flex items-center gap-2 text-sm">
            <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono dark:bg-slate-800">{rec.current_size}</code>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            <code className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-mono text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300">{rec.recommended_size}</code>
            <span className="text-xs text-slate-400 ml-auto">{fmt(rec.current_monthly_cost_usd)} → {fmt(rec.projected_monthly_cost_usd)}</span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-xs">
              <p className="text-slate-500">Evidence</p>
              <p className="font-medium text-slate-800 dark:text-slate-200">
                {rec.evidence_source.replace(/_/g, ' ')} · {rec.analysis_points} points
              </p>
              <p className="text-slate-500 mt-0.5">
                Trend: {rec.trend_percent >= 0 ? '+' : ''}{rec.trend_percent.toFixed(2)}% ({fmt(rec.trend_slope_usd)}/period)
              </p>
            </div>
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-xs">
              <p className="text-slate-500">Observed</p>
              <p className="font-medium text-slate-800 dark:text-slate-200">{fmtDate(rec.last_observed_at)}</p>
              <p className="text-slate-500 mt-0.5">
                Latest: {rec.latest_monthly_cost_usd !== null ? fmt(rec.latest_monthly_cost_usd) : 'n/a'} · Peak: {rec.peak_monthly_cost_usd !== null ? fmt(rec.peak_monthly_cost_usd) : 'n/a'}
              </p>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-xs">
            <p className="text-slate-500">Why this is recommended</p>
            <p className="font-medium text-slate-800 dark:text-slate-200 line-clamp-2">{rec.reason}</p>
          </div>

          {providerFinding && (
            <div className="grid grid-cols-2 gap-2 rounded-md border border-red-200 bg-red-50/60 p-2 text-xs dark:border-red-900 dark:bg-red-950/20 sm:grid-cols-4">
              <div>
                <p className="text-red-700/70 dark:text-red-200/70">Advisor count</p>
                <p className="font-semibold text-red-900 dark:text-red-100">{advisorResourceCount(rec).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-red-700/70 dark:text-red-200/70">Category</p>
                <p className="font-semibold text-red-900 dark:text-red-100">{advisorCategory(rec)}</p>
              </div>
              <div>
                <p className="text-red-700/70 dark:text-red-200/70">Importance</p>
                <p className="font-semibold text-red-900 dark:text-red-100">{advisorImportance(rec)}</p>
              </div>
              <div>
                <p className="text-red-700/70 dark:text-red-200/70">Status</p>
                <p className="font-semibold text-red-900 dark:text-red-100">{advisorStatus(rec)}</p>
              </div>
            </div>
          )}

          {(rec.regional_breakdown?.length ?? 0) > 0 && (
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-xs">
              <p className="text-slate-500 mb-1">Regional cost breakdown</p>
              <div className="space-y-1">
                {(rec.regional_breakdown ?? []).slice(0, 4).map((row) => (
                  <div key={`${rec.resource_id}-${row.region}`} className="flex items-center justify-between">
                    <span className="text-slate-700 dark:text-slate-200">{row.region}</span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {fmt(row.monthly_cost_usd)} ({row.share_percent.toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {rec.top_regions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-slate-500 mr-1">Top regions:</span>
              {rec.top_regions.slice(0, 4).map((region) => (
                <Badge key={region} variant="outline" className="rounded-md text-[11px]">
                  {region}
                </Badge>
              ))}
            </div>
          )}

          {rec.risk_note && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              {rec.risk_note}
            </div>
          )}

          {/* Utilization bars */}
          {(rec.cpu_utilization_avg_percent !== null || rec.memory_utilization_avg_percent !== null) && (
            <div className="space-y-1">
              <UtilBar label="CPU" value={rec.cpu_utilization_avg_percent} />
              <UtilBar label="Memory" value={rec.memory_utilization_avg_percent} />
            </div>
          )}

          <InlineDisclosure
            title="Execution details"
            description="Rationale, validation steps, rollout checks, and rollback plan."
          >
            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-3">
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Recommendation rationale</p>
                <p>{rec.reason}</p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2">
                  <p className="text-slate-500">Current monthly cost</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{fmt(rec.current_monthly_cost_usd)}</p>
                </div>
                <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2">
                  <p className="text-slate-500">Projected monthly cost</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{fmt(rec.projected_monthly_cost_usd)}</p>
                </div>
                <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2">
                  <p className="text-slate-500">Monthly savings rate</p>
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">{monthlyDeltaPct.toFixed(1)}%</p>
                </div>
                <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2">
                  <p className="text-slate-500">Annualized opportunity</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{fmt(rec.annual_savings_usd)}</p>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 space-y-1">
                <p className="font-semibold text-slate-800 dark:text-slate-200">Utilization interpretation</p>
                <p>CPU: {rec.cpu_utilization_avg_percent?.toFixed(1) ?? 'n/a'}% ({utilizationHealth(rec.cpu_utilization_avg_percent)})</p>
                <p>Memory: {rec.memory_utilization_avg_percent?.toFixed(1) ?? 'n/a'}% ({utilizationHealth(rec.memory_utilization_avg_percent)})</p>
              </div>

              <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2">
                <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Execution steps</p>
                <ol className="list-decimal pl-4 space-y-1">
                  {implementationSteps(rec).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>

              <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 space-y-1">
                <p className="font-semibold text-slate-800 dark:text-slate-200">Validation and rollback</p>
                <p>Validation window: monitor SLOs and utilization for 24-72h after change.</p>
                <p>Rollback plan: {rollbackPlan(rec)}</p>
              </div>
            </div>
          </InlineDisclosure>
        </div>
      </CardContent>
    </Card>
  )
}

export default function RightsizingPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<RightsizingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState(initialProviderFilter)
  const [actionFilter, setActionFilter] = useState('all')
  const [productFilter, setProductFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [refreshLive, setRefreshLive] = useState(initialLiveRefresh)
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchRightsizingRecommendations({ provider, min_savings: 0, limit: 1000, refresh_live: refreshLive })
      setData(result)
      setLastLoadedAt(new Date())
    } catch (error) {
      const reason = requestErrorMessage(error)
      if (refreshLive) {
        try {
          const fallback = await fetchRightsizingRecommendations({ provider, min_savings: 0, limit: 1000, refresh_live: false })
          setData(fallback)
          setLastLoadedAt(new Date())
          setError(`Live provider scan failed: ${reason}. Showing stored scan results instead.`)
        } catch (fallbackError) {
          setData(null)
          setError(`Unable to load rightsizing recommendations: ${requestErrorMessage(fallbackError)}`)
        }
      } else {
        setData(null)
        setError(`Unable to load rightsizing recommendations: ${reason}`)
      }
    } finally {
      setLoading(false)
    }
  }, [provider, refreshLive])

  useEffect(() => { void load() }, [load])

  const recommendations = data?.recommendations ?? []
  const sourceInfo = sourceQuality(data?.data_source)
  const productSummaries = Object.entries(
    recommendations.reduce<Record<string, { count: number; savings: number }>>((acc, rec) => {
      const product = productCategory(rec)
      acc[product] = acc[product] ?? { count: 0, savings: 0 }
      acc[product].count += 1
      acc[product].savings += rec.monthly_savings_usd
      return acc
    }, {}),
  ).sort((a, b) => b[1].savings - a[1].savings)
  const productFilterOptions = ['all', ...productSummaries.map(([product]) => product)]
  const nonComputeSavings = recommendations
    .filter((rec) => productCategory(rec) !== 'compute')
    .reduce((sum, rec) => sum + rec.monthly_savings_usd, 0)
  const productScoped = recommendations.filter((r) => productFilter === 'all' || productCategory(r) === productFilter)
  const actionScoped = productScoped.filter((r) => actionFilter === 'all' || r.action === actionFilter)
  const searchNormalized = searchQuery.trim().toLowerCase()
  const filtered = searchNormalized
    ? actionScoped.filter((rec) => [
      rec.resource_name,
      rec.resource_id,
      rec.resource_type,
      rec.account_id,
      rec.region,
      rec.provider,
      rec.action,
      rec.evidence_source,
      rec.reason,
      rec.provider_recommendation_type,
      rec.provider_recommendation_name,
      rec.provider_recommendation_category,
      rec.provider_recommendation_status,
      rec.provider_recommendation_importance,
    ].some((value) => String(value || '').toLowerCase().includes(searchNormalized)))
    : actionScoped
  const advisorFindings = filtered.filter(isProviderAdvisorFinding)
  const hasUnfilteredAdvisorFindings = recommendations.some(isProviderAdvisorFinding)
  const selectProductFilter = (product: string) => {
    setProductFilter(product)
    setActionFilter('all')
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-md">Optimization Advisor</Badge>
            <Badge variant="outline" className="rounded-md border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950/30">Cloud Advisor · Storage cleanup · Rightsizing</Badge>
            <Badge className={`rounded-md border ${toneClasses(sourceInfo.tone)}`}>{sourceInfo.label}</Badge>
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Optimization Advisor</h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-3xl">
            Provider-native optimization findings with Cloud Advisor-style counts, categories, estimated savings, importance, and status, plus resource-level drill-down for storage cleanup, compute rightsizing, commitments, and services.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <input
              type="checkbox"
              checked={refreshLive}
              onChange={(event) => setRefreshLive(event.target.checked)}
              disabled={loading}
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            Live provider advisor scan
          </label>
          <Button variant="outline" onClick={() => { forceNextApiRefresh(); void load() }} className="rounded-lg" disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
          </Button>
          <a
            href={`/dashboard/recommendations?provider=${encodeURIComponent(provider)}&status=open`}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-blue-300"
          >
            Track ledger <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>

      <Expander
        title="Scan Status"
        description={scanModeDescription(refreshLive, data)}
        icon={loading ? <Loader className="h-5 w-5 animate-spin" /> : <Database className="h-5 w-5" />}
        defaultOpen={Boolean(error) || loading}
      >
        <div className="space-y-4">
          {error && (
            <FriendlyNotice
              tone={refreshLive ? 'amber' : 'rose'}
              icon={<AlertTriangle className="h-4 w-4" />}
              title={refreshLive ? 'Live scan fell back safely' : 'Optimization advisor data is unavailable'}
            >
              {error}
            </FriendlyNotice>
          )}
          {loading && refreshLive && (
            <FriendlyNotice tone="blue" icon={<Clock3 className="h-4 w-4" />} title="Live provider advisor scan is running">
              Provider recommendation APIs can take around a minute for large OCI or multi-cloud inventories. Stored results remain available if the provider call fails.
            </FriendlyNotice>
          )}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <StatusTile
              label="Mode"
              value={scanModeLabel(refreshLive)}
              helper={refreshLive ? 'Fresh provider APIs first, stored signals second.' : 'Responsive dashboard path from the latest stored evidence.'}
              icon={<RefreshCw className="h-5 w-5" />}
              tone={refreshLive ? 'emerald' : 'blue'}
            />
            <StatusTile
              label="Source"
              value={compactSource(data?.data_source)}
              helper={lastLoadedAt ? `Loaded ${lastLoadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : 'Waiting for the first response.'}
              icon={<Database className="h-5 w-5" />}
              tone={sourceInfo.tone}
            />
            <StatusTile
              label="Provider scope"
              value={provider === 'all' ? 'All configured providers' : provider.toUpperCase()}
              helper="Use filters to isolate one provider before running a live refresh."
              icon={<ShieldCheck className="h-5 w-5" />}
              tone="slate"
            />
            <StatusTile
              label="Visible now"
              value={`${filtered.length.toLocaleString()} items`}
              helper={`${advisorFindings.length.toLocaleString()} provider advisor findings match the current filters.`}
              icon={<BarChart3 className="h-5 w-5" />}
              tone="violet"
            />
          </div>
        </div>
      </Expander>

      <Expander
        title="Filters And Search"
        description="Narrow advisor findings by provider, action, product category, region, account, resource ID, or recommendation type."
        icon={<Filter className="h-5 w-5" />}
        defaultOpen={Boolean(searchQuery) || provider !== 'all' || actionFilter !== 'all' || productFilter !== 'all'}
      >
      <div className="space-y-4">
        <label className="block">
          <span className="sr-only">Search rightsizing recommendations</span>
          <span className="relative block max-w-2xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search recommendation type, resource, OCID, account, region, evidence, or reason"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
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
              {p === 'all' ? 'All' : p.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map(a => (
            <button
              key={a}
              onClick={() => setActionFilter(a)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition capitalize ${
                actionFilter === a
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {a === 'all' ? 'All actions' : a}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          {productFilterOptions.map(product => (
            <button
              key={product}
              onClick={() => selectProductFilter(product)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                productFilter === product
                  ? `${productTone(product === 'all' ? 'other' : product)} ring-2 ring-slate-400`
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {PRODUCT_LABELS[product] ?? product}
            </button>
          ))}
        </div>
      </div>
      </Expander>

      {/* KPI strip */}
      {data && (
        <Expander
          title="Executive Summary"
          description="Top-line impact from provider advisor findings and resource-level optimization signals."
          icon={<DollarSign className="h-5 w-5" />}
          defaultOpen
        >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Resources Analyzed', value: data.total_resources_analyzed.toLocaleString(), icon: Zap, color: 'from-blue-500 to-blue-600' },
            { label: 'Optimization Items', value: data.rightsizable_count.toLocaleString(), icon: AlertTriangle, color: 'from-amber-500 to-amber-600' },
            { label: 'Monthly Savings', value: fmtK(data.total_monthly_savings_usd), icon: DollarSign, color: 'from-emerald-500 to-emerald-600' },
            { label: 'Non-Compute Savings', value: fmtK(nonComputeSavings), icon: CheckCircle, color: 'from-violet-500 to-violet-600' },
          ].map(kpi => {
            const Icon = kpi.icon
            return (
              <Card key={kpi.label} className="rounded-xl overflow-hidden">
                <CardContent className="p-0">
                  <div className={`bg-gradient-to-br ${kpi.color} p-4 text-white`}>
                    <Icon className="h-5 w-5 mb-2 opacity-80" />
                    <p className="text-2xl font-bold">{kpi.value}</p>
                    <p className="text-xs opacity-80 mt-1">{kpi.label}</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
        </Expander>
      )}

      {/* Product breakdown */}
      {data && productSummaries.length > 0 && (
        <Expander
          title="Savings And Action Breakdown"
          description="Explore product categories and action types before opening the provider findings and resource drill-down."
          icon={<DollarSign className="h-5 w-5" />}
        >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Savings by product</h2>
            <span className="text-sm text-slate-500">Non-compute: {fmtK(nonComputeSavings)}/mo</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {productSummaries.map(([product, summary]) => (
              <button
                key={product}
                onClick={() => selectProductFilter(productFilter === product ? 'all' : product)}
                className={`rounded-xl border p-4 text-left transition hover:shadow-sm ${productFilter === product ? 'ring-2 ring-blue-500' : ''} ${productTone(product)}`}
              >
                <p className="text-sm font-semibold">{PRODUCT_LABELS[product] ?? product}</p>
                <p className="mt-2 text-2xl font-bold">{fmtK(summary.savings)}</p>
                <p className="mt-1 text-xs">{summary.count} opportunit{summary.count === 1 ? 'y' : 'ies'} / mo</p>
              </button>
            ))}
          </div>
        </div>
        </Expander>
      )}

      {/* Action breakdown */}
      {data && productScoped.length > 0 && (
        <Expander
          title="Action Mix"
          description="Counts and monthly savings grouped by downsize, terminate, reserve, and modernize actions."
          icon={<AlertTriangle className="h-5 w-5" />}
        >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {ACTIONS.filter(a => a !== 'all').map(action => {
            const count = productScoped.filter(r => r.action === action).length
            const savings = productScoped.filter(r => r.action === action).reduce((s, r) => s + r.monthly_savings_usd, 0)
            return (
              <button
                key={action}
                onClick={() => setActionFilter(actionFilter === action ? 'all' : action)}
                className={`rounded-xl border p-3 text-left transition hover:shadow-sm ${actionFilter === action ? 'ring-2 ring-blue-500' : ''} ${actionColor(action)}`}
              >
                <p className="text-sm font-semibold capitalize">{action}</p>
                <p className="text-xs mt-1">{count} resource{count !== 1 ? 's' : ''}</p>
                <p className="text-xs font-mono mt-0.5">{fmtK(savings)}/mo</p>
              </button>
            )
          })}
        </div>
        </Expander>
      )}

      {data && (
        <ProviderAdvisorFindings
          findings={advisorFindings}
          hasUnfilteredFindings={hasUnfilteredAdvisorFindings}
          refreshLive={refreshLive}
          loading={loading}
          onSelectAction={setActionFilter}
          onSelectProduct={selectProductFilter}
          onEnableLive={() => {
            setRefreshLive(true)
            forceNextApiRefresh()
          }}
        />
      )}

      {/* Recommendations grid */}
      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center text-slate-500">
          <Loader className="h-6 w-6 animate-spin mr-2" /> Loading provider advisor findings...
        </div>
      ) : filtered.length > 0 ? (
        <>
          {data && (
            <p className="text-sm text-slate-500">
              Showing {filtered.length} of {data.rightsizable_count} items · advisor findings: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{advisorFindings.length}</code> · product: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{PRODUCT_LABELS[productFilter] ?? productFilter}</code> · scan: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{refreshLive ? 'live' : 'stored'}</code> · data source: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{data.data_source}</code>
            </p>
          )}
          <Expander
            title="Resource Drill-Down"
            description="Cards show resource-level evidence and execution details behind advisor findings."
            icon={<CheckCircle className="h-5 w-5" />}
            defaultOpen
          >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map(rec => <RecCard key={`${rec.provider}-${rec.resource_id}-${rec.region}-${rec.action}`} rec={rec} />)}
          </div>
          </Expander>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <CheckCircle className="mx-auto h-10 w-10 text-emerald-400 mb-3" />
          <p className="text-sm text-slate-500">
            {productScoped.length > 0 && actionFilter !== 'all'
              ? `No ${PRODUCT_LABELS[productFilter] ?? productFilter} opportunities match the ${actionFilter} action filter.`
              : data && data.total_resources_analyzed > 0
              ? 'No optimization advisor items match the current filters.'
              : 'Connect cloud providers and run a live advisor scan to surface Cloud Advisor and resource-level optimization findings.'}
          </p>
          {productScoped.length > 0 && actionFilter !== 'all' && (
            <Button variant="outline" onClick={() => setActionFilter('all')} className="mt-4 rounded-lg">
              Show all actions
            </Button>
          )}
        </div>
      )}

      {/* Info callout */}
      <Expander
        title="How Advisor Data Is Wired"
        description="Provider APIs and fallback evidence behind the advisor table and resource drill-down."
        icon={<Info className="h-5 w-5" />}
      >
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200">
        <strong>How advisor data is wired:</strong> OptiOra pulls provider-native recommendation APIs first, including OCI Cloud Advisor from the tenancy home region, then adds live inventory, cost trends, and utilization signals. Storage cleanup actions such as unattached boot and block volumes are included alongside VM downsize and commitment opportunities.
      </div>
      </Expander>
    </div>
  )
}
