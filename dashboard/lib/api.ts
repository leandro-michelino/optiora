import {
  AccountRegionBreakdownResponse,
  AlertEvent,
  AlertExecutiveSummary,
  AlertOpsPolicy,
  AlertRoutingPolicy,
  AdminDiagnosticsSnapshot,
  AllocationCoverageResponse,
  AuditLogEntry,
  BusinessMappingRule,
  BusinessMappingRuleListResponse,
  ChargebackResponse,
  CostResponse,
  AnomalyResponse,
  PaginatedResponse,
  ProviderAccountInventoryResponse,
  ProviderAccountRollupResponse,
  RecommendationResponse,
  ScanDiffResponse,
  ScanHistoryItem,
  ApiHealth,
  ApiInfo,
  CredentialListResponse,
  ScanningPermission,
  SchedulerStatusResponse,
  ScanStartResponse,
  ForecastResponse,
  ForecastModelDiagnosticsResponse,
  ForecastStressTestResponse,
  FinOpsAnalyticsResponse,
  CloudWasteResponse,
  EfficiencyScoreResponse,
  CommitmentGapResponse,
  OptimizationPortfolioResponse,
  HybridAdvisorResponse,
  GenAICopilotPackResponse,
  ImportedCostSummaryResponse,
  ImportedCostUploadResponse,
  ImportPreviewResponse,
  ReportShareTokenResponse,
  ProviderDiagnostic,
  NotificationDestinationsResponse,
  NotificationDestinationTestResponse,
  DataFreshnessResponse,
  ExportJob,
  ExportJobRun,
  CostTrendResponse,
  PeriodSummaryComputeResponse,
  FocusExportResponse,
  UnitEconomicsCockpitResponse,
  UnitEconomicsMetricResult,
  ScorecardsResponse,
  ResourceInventoryResponse,
  KubernetesClusterCostResponse,
  KubernetesSummaryResponse,
  PartnerCustomerPortfolioResponse,
  OpenCostSyncResponse,
  VirtualTagRulesResponse,
  VirtualTagRuleOut,
  VirtualTagRuleCreate,
  VirtualTagPreviewResponse,
  RightsizingResponse,
  TagQualityScoreResponse,
  DecisionRecommendationResponse,
  FederationCostResponse,
  RemediationLoopRequestPayload,
  RemediationLoopResponse,
  AlertRoutingPolicySimulationRequest,
  AlertRoutingPolicySimulationResponse,
  TaggingCoverageResponse,
  SustainabilityResponse,
  CrossProviderComparisonResponse,
  AnomalyIntelligenceResponse,
  ChargebackSummaryResponse,
} from './types'
import { backendUrl } from './backend-url'
import { authorizedFetch } from './auth-fetch'

const DEFAULT_TIMEOUT_MS = 10000

const safeFallbackCostData = {
  totalCost: 0,
  trend: 0,
  anomalies: 0,
  potentialSavings: 0,
  breakdown: {
    aws: { cost: 0, percentage: 0 },
    azure: { cost: 0, percentage: 0 },
    gcp: { cost: 0, percentage: 0 },
    oci: { cost: 0, percentage: 0 },
  },
  regionBreakdown: [],
}

interface ListQuery {
  limit?: number
  offset?: number
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  options: { authenticated?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )

  try {
    const headers = new Headers(init.headers)
    headers.set('Content-Type', 'application/json')

    const requestInit: RequestInit = {
      ...init,
      headers,
      signal: controller.signal,
    }
    const url = backendUrl(path)
    const response = options.authenticated === false
      ? await fetch(url, requestInit)
      : await authorizedFetch(url, requestInit)

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(detail || `Request failed with ${response.status}`)
    }

    return await response.json() as T
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export async function fetchCosts(): Promise<CostResponse> {
  try {
    return await fetchCostsStrict()
  } catch (error) {
    console.warn('Failed to fetch costs from backend, using safe fallback data', error)
    return safeFallbackCostData as CostResponse
  }
}

export async function fetchCostsStrict(): Promise<CostResponse> {
  return requestJson<CostResponse>('/api/v1/costs')
}

function paginate<T>(items: T[], query: ListQuery = {}): PaginatedResponse<T> {
  const limit = Math.max(1, query.limit ?? (items.length || 1))
  const offset = Math.max(0, query.offset ?? 0)
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    limit,
    offset,
  }
}

function toQueryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value))
    }
  }
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

async function requestBlob(path: string): Promise<Blob> {
  const url = backendUrl(path)
  const response = await authorizedFetch(url, { method: 'GET' })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail || `Download failed with ${response.status}`)
  }
  return response.blob()
}

function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(href)
}

export async function fetchAnomalies(query: ListQuery = {}): Promise<PaginatedResponse<AnomalyResponse>> {
  try {
    return await fetchAnomaliesStrict(query)
  } catch (error) {
    console.warn('Failed to fetch anomalies, using empty list', error)
    return paginate([], query)
  }
}

export async function fetchAnomaliesStrict(query: ListQuery = {}): Promise<PaginatedResponse<AnomalyResponse>> {
  const rows = await requestJson<AnomalyResponse[]>('/api/v1/anomalies')
  return paginate(rows, query)
}

export async function fetchRecommendations(query: ListQuery = {}): Promise<PaginatedResponse<RecommendationResponse>> {
  try {
    return await fetchRecommendationsStrict(query)
  } catch (error) {
    console.warn('Failed to fetch recommendations, using empty list', error)
    return paginate([], query)
  }
}

export async function fetchRecommendationsStrict(query: ListQuery = {}): Promise<PaginatedResponse<RecommendationResponse>> {
  const rows = await requestJson<RecommendationResponse[]>(
    '/api/v1/recommendations',
    {},
  )
  return paginate(rows, query)
}

export async function fetchApiHealth(): Promise<ApiHealth> {
  return requestJson<ApiHealth>('/health', {}, { authenticated: false, timeoutMs: 5000 })
}

export async function fetchApiInfo(): Promise<ApiInfo> {
  return requestJson<ApiInfo>('/api/v1/info', {}, { authenticated: false, timeoutMs: 5000 })
}

export async function fetchCredentials(): Promise<CredentialListResponse> {
  return requestJson<CredentialListResponse>('/api/v1/credentials')
}

export async function fetchScanningPermission(): Promise<ScanningPermission | null> {
  try {
    return await requestJson<ScanningPermission>('/api/v1/scanning/permission')
  } catch {
    return null
  }
}

export async function startScan(providers?: string[], targetAccounts?: string[]): Promise<ScanStartResponse> {
  return requestJson<ScanStartResponse>('/api/v1/scanning/start', {
    method: 'POST',
    body: JSON.stringify({ providers, target_accounts: targetAccounts }),
  })
}

export async function fetchForecast(months = 12): Promise<ForecastResponse> {
  return requestJson<ForecastResponse>(
    `/api/v1/forecast?months=${encodeURIComponent(String(months))}`,
    {},
  )
}

export async function fetchForecastModelDiagnostics(months = 12): Promise<ForecastModelDiagnosticsResponse> {
  return requestJson<ForecastModelDiagnosticsResponse>(
    `/api/v1/forecast/model-diagnostics?months=${encodeURIComponent(String(months))}`,
    {},
  )
}

export async function fetchForecastStressTest(payload: {
  months?: number
  cloud_provider?: string
  severity?: 'low' | 'medium' | 'high'
} = {}): Promise<ForecastStressTestResponse> {
  return requestJson<ForecastStressTestResponse>(
    '/api/v1/forecast/stress-test',
    {
      method: 'POST',
      body: JSON.stringify({
        months: payload.months ?? 12,
        cloud_provider: payload.cloud_provider ?? 'all',
        severity: payload.severity ?? 'medium',
      }),
    },
  )
}

export async function fetchFinOpsAnalytics(): Promise<FinOpsAnalyticsResponse> {
  return requestJson<FinOpsAnalyticsResponse>(
    '/api/v1/analytics',
    {},
  )
}

export async function fetchCloudWasteAnalytics(): Promise<CloudWasteResponse> {
  return requestJson<CloudWasteResponse>(
    '/api/v1/analytics/cloud-waste',
    {},
  )
}

export async function fetchEfficiencyScore(): Promise<EfficiencyScoreResponse> {
  return requestJson<EfficiencyScoreResponse>(
    '/api/v1/analytics/efficiency-score',
    {},
  )
}

export async function fetchCommitmentGap(): Promise<CommitmentGapResponse> {
  return requestJson<CommitmentGapResponse>(
    '/api/v1/analytics/commitment-gap',
    {},
  )
}

export async function fetchOptimizationPortfolio(): Promise<OptimizationPortfolioResponse> {
  return requestJson<OptimizationPortfolioResponse>(
    '/api/v1/analytics/optimization-portfolio',
    {},
  )
}

export async function fetchHybridAdvisor(
  narrativeType: 'waste_insights' | 'optimization_roadmap' | 'executive_narrative' = 'optimization_roadmap',
): Promise<HybridAdvisorResponse> {
  return requestJson<HybridAdvisorResponse>(
    `/api/v1/advisor/hybrid${toQueryString({ narrative_type: narrativeType })}`,
    {},
  )
}

export async function fetchGenAICopilotPack(payload: {
  cloud_provider?: string
  include?: Array<
    'spend'
    | 'budget_risk'
    | 'waste_insights'
    | 'optimization_roadmap'
    | 'executive_narrative'
    | 'commitment_strategy'
    | 'tagging_strategy'
    | 'sustainability_narrative'
    | 'chargeback_narrative'
    | 'rightsizing_brief'
    | 'vendor_negotiation_brief'
    | 'forecast_model_diagnostics'
  >
} = {}): Promise<GenAICopilotPackResponse> {
  return requestJson<GenAICopilotPackResponse>('/api/v1/genai/copilot-pack', {
    method: 'POST',
    body: JSON.stringify({
      cloud_provider: payload.cloud_provider ?? 'all',
      include: payload.include ?? ['waste_insights', 'optimization_roadmap', 'executive_narrative', 'commitment_strategy'],
    }),
  })
}

export async function fetchScanHistory(limit = 20, offset = 0): Promise<ScanHistoryItem[]> {
  return requestJson<ScanHistoryItem[]>(
    `/api/v1/scanning/history${toQueryString({ limit, offset })}`,
    {},
  )
}

export async function fetchScanDiff(scanId: string, previousScanId?: string): Promise<ScanDiffResponse> {
  return requestJson<ScanDiffResponse>(
    `/api/v1/scanning/${encodeURIComponent(scanId)}/diff${toQueryString({ previous_scan_id: previousScanId })}`,
    {},
  )
}

export async function fetchProviderAccountRollups(provider?: string, scanId?: string): Promise<ProviderAccountRollupResponse> {
  return requestJson<ProviderAccountRollupResponse>(
    `/api/v1/provider-accounts/rollups${toQueryString({ provider, scan_id: scanId })}`,
    {},
  )
}

export async function fetchProviderAccountInventory(
  provider?: string,
  accountType?: string,
): Promise<ProviderAccountInventoryResponse> {
  return requestJson<ProviderAccountInventoryResponse>(
    `/api/v1/provider-accounts${toQueryString({ provider, account_type: accountType })}`,
    {},
  )
}

export async function fetchAccountRegionBreakdown(
  accountId: number,
  scanId?: string,
): Promise<AccountRegionBreakdownResponse> {
  return requestJson<AccountRegionBreakdownResponse>(
    `/api/v1/provider-accounts/${encodeURIComponent(String(accountId))}/region-breakdown${toQueryString({ scan_id: scanId })}`,
    {},
  )
}

export async function fetchImportedCostSummary(): Promise<ImportedCostSummaryResponse | null> {
  try {
    return await requestJson<ImportedCostSummaryResponse>('/api/v1/imports/costs/summary')
  } catch {
    return null
  }
}

export async function fetchProviderDiagnostics(): Promise<ProviderDiagnostic[]> {
  return requestJson<ProviderDiagnostic[]>('/api/v1/provider-diagnostics')
}

export async function uploadImportedCostCsv(file: File): Promise<ImportedCostUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await authorizedFetch(backendUrl('/api/v1/imports/costs/csv'), {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail || `Upload failed with ${response.status}`)
  }
  return await response.json() as ImportedCostUploadResponse
}

export async function previewImportedCostCsv(file: File): Promise<ImportPreviewResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await authorizedFetch(backendUrl('/api/v1/imports/costs/preview'), {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail || `Preview failed with ${response.status}`)
  }
  return await response.json() as ImportPreviewResponse
}

export async function downloadImportedCostTemplateCsv(): Promise<void> {
  const blob = await requestBlob('/api/v1/imports/costs/template.csv')
  saveBlob(blob, 'optiora-cost-import-template.csv')
}

export async function fetchAlerts(limit = 20, offset = 0): Promise<AlertEvent[]> {
  return requestJson<AlertEvent[]>(
    `/api/v1/alerts${toQueryString({ limit, offset })}`,
    {},
  )
}

export async function acknowledgeAlert(alertId: number): Promise<{ status: string; alert_id: number }> {
  return requestJson<{ status: string; alert_id: number }>(
    `/api/v1/alerts/${encodeURIComponent(String(alertId))}/acknowledge`,
    { method: 'POST' },
  )
}

export async function fetchAlertRoutingPolicies(): Promise<AlertRoutingPolicy[]> {
  return requestJson<AlertRoutingPolicy[]>('/api/v1/alerts/routing-policies')
}

export async function upsertAlertRoutingPolicy(
  severity: 'warning' | 'critical',
  channels: string[],
  isActive = true,
): Promise<AlertRoutingPolicy> {
  return requestJson<AlertRoutingPolicy>('/api/v1/alerts/routing-policies', {
    method: 'POST',
    body: JSON.stringify({ severity, channels, is_active: isActive }),
  })
}

export async function simulateAlertRouting(
  severity: 'warning' | 'critical',
  title?: string,
  alertType?: string,
): Promise<AlertRoutingPolicySimulationResponse> {
  return requestJson<AlertRoutingPolicySimulationResponse>(
    '/api/v1/alerts/routing-policies/simulate',
    {
      method: 'POST',
      body: JSON.stringify({ severity, title, alert_type: alertType }),
    },
  )
}

export async function fetchAlertOpsPolicy(): Promise<AlertOpsPolicy> {
  return requestJson<AlertOpsPolicy>('/api/v1/alerts/ops-policy')
}

export async function upsertAlertOpsPolicy(payload: Partial<AlertOpsPolicy>): Promise<AlertOpsPolicy> {
  return requestJson<AlertOpsPolicy>('/api/v1/alerts/ops-policy', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function fetchAlertExecutiveSummary(
  period: 'daily' | 'weekly' = 'daily',
): Promise<AlertExecutiveSummary> {
  return requestJson<AlertExecutiveSummary>(
    `/api/v1/alerts/executive-summary${toQueryString({ period })}`,
  )
}

export async function fetchNotificationDestinations(): Promise<NotificationDestinationsResponse> {
  return requestJson<NotificationDestinationsResponse>('/api/v1/notifications/destinations')
}

export async function toggleNotificationDestination(
  channel: 'email' | 'slack' | 'teams',
  enabled: boolean,
): Promise<NotificationDestinationsResponse> {
  return requestJson<NotificationDestinationsResponse>(
    `/api/v1/notifications/destinations/${encodeURIComponent(channel)}/toggle`,
    {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    },
  )
}

export async function testNotificationDestination(
  channel: 'email' | 'slack' | 'teams',
  target?: string,
  message?: string,
): Promise<NotificationDestinationTestResponse> {
  return requestJson<NotificationDestinationTestResponse>('/api/v1/notifications/test-destination', {
    method: 'POST',
    body: JSON.stringify({ channel, target, message }),
  })
}

export async function fetchAuditLogs(limit = 20, offset = 0): Promise<AuditLogEntry[]> {
  return requestJson<AuditLogEntry[]>(
    `/api/v1/audit-logs${toQueryString({ limit, offset })}`,
    {},
  )
}

export async function runScheduledScanNow(): Promise<{ status: string; started: number; organization_id?: number | null }> {
  return requestJson<{ status: string; started: number; organization_id?: number | null }>(
    '/api/v1/scanning/scheduler/run-now',
    { method: 'POST' },
  )
}

export async function updateSchedulerPolicy(payload: {
  scheduler_override_enabled?: boolean
  scheduler_override_frequency?: 'hourly' | 'daily' | 'weekly' | null
  scheduler_retry_max_attempts?: number
  scheduler_retry_backoff_seconds?: number
  scheduler_overdue_alert_hours?: number
}): Promise<ScanningPermission> {
  return requestJson<ScanningPermission>(
    '/api/v1/scanning/scheduler/policy',
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  )
}

export async function fetchSchedulerStatus(): Promise<SchedulerStatusResponse | null> {
  try {
    return await requestJson<SchedulerStatusResponse>('/api/v1/scanning/scheduler/status')
  } catch {
    return null
  }
}

export async function fetchDataFreshness(): Promise<DataFreshnessResponse | null> {
  try {
    return await requestJson<DataFreshnessResponse>('/api/v1/operations/data-freshness')
  } catch {
    return null
  }
}

export async function downloadScanHistoryCsv(limit = 200): Promise<void> {
  const blob = await requestBlob(`/api/v1/scanning/history.csv${toQueryString({ limit })}`)
  saveBlob(blob, `scan-history-${new Date().toISOString().slice(0, 10)}.csv`)
}

export async function downloadScanDiffCsv(scanId: string, previousScanId?: string): Promise<void> {
  const blob = await requestBlob(
    `/api/v1/scanning/${encodeURIComponent(scanId)}/diff.csv${toQueryString({ previous_scan_id: previousScanId })}`,
  )
  saveBlob(blob, `scan-diff-${scanId}.csv`)
}

export async function downloadAlertsCsv(limit = 200): Promise<void> {
  const blob = await requestBlob(`/api/v1/alerts.csv${toQueryString({ limit })}`)
  saveBlob(blob, `alerts-${new Date().toISOString().slice(0, 10)}.csv`)
}

export async function downloadAuditLogsCsv(limit = 200): Promise<void> {
  const blob = await requestBlob(`/api/v1/audit-logs.csv${toQueryString({ limit })}`)
  saveBlob(blob, `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`)
}

export async function downloadExecutiveSummaryCsv(): Promise<void> {
  const blob = await requestBlob('/api/v1/reports/executive-summary.csv')
  saveBlob(blob, `optiora-executive-summary-${new Date().toISOString().slice(0, 10)}.csv`)
}

export async function downloadExecutiveSummaryExcel(): Promise<void> {
  const blob = await requestBlob('/api/v1/reports/executive-summary.xlsx')
  saveBlob(blob, `optiora-finance-workbook-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export async function downloadFinanceWorkbook(): Promise<void> {
  const blob = await requestBlob('/api/v1/reports/finance-workbook.xlsx')
  saveBlob(blob, `optiora-finance-workbook-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export async function downloadExecutiveDigestPdf(frequency: 'weekly' | 'monthly' = 'weekly'): Promise<void> {
  const blob = await requestBlob(`/api/v1/reports/executive-digest.pdf${toQueryString({ frequency })}`)
  saveBlob(blob, `optiora-${frequency}-digest-${new Date().toISOString().slice(0, 10)}.pdf`)
}

export async function createReadOnlyReportShareToken(payload: {
  report_type?: 'executive_summary' | 'finance_workbook' | 'executive_digest'
  report_format?: 'json' | 'csv' | 'xlsx' | 'pdf'
  expires_in_hours?: number
}): Promise<ReportShareTokenResponse> {
  return requestJson<ReportShareTokenResponse>('/api/v1/reports/share-token', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function listExportJobs(limit = 50, offset = 0): Promise<ExportJob[]> {
  return requestJson<ExportJob[]>(
    `/api/v1/exports/jobs${toQueryString({ limit, offset })}`,
  )
}

export async function createExportJob(payload: {
  name: string
  report_type?: 'executive_summary' | 'executive_digest' | 'finance_workbook'
  export_format?: 'csv' | 'xls' | 'xlsx' | 'pdf'
  schedule_frequency?: 'daily' | 'weekly' | 'monthly'
  is_active?: boolean
}): Promise<ExportJob> {
  return requestJson<ExportJob>('/api/v1/exports/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function runExportJob(jobId: number): Promise<ExportJobRun> {
  return requestJson<ExportJobRun>(
    `/api/v1/exports/jobs/${encodeURIComponent(String(jobId))}/run`,
    { method: 'POST' },
  )
}

export async function listExportJobRuns(jobId: number, limit = 20): Promise<ExportJobRun[]> {
  return requestJson<ExportJobRun[]>(
    `/api/v1/exports/jobs/${encodeURIComponent(String(jobId))}/runs${toQueryString({ limit })}`,
  )
}

export async function fetchAdminDiagnostics(): Promise<AdminDiagnosticsSnapshot> {
  return requestJson<AdminDiagnosticsSnapshot>('/api/v1/admin/diagnostics')
}

export async function ingestGcpBudgetPubSub(message: Record<string, unknown>, subscription?: string): Promise<{
  status: string
  ingested: number
  alert_id?: number
  message_id?: string | null
}> {
  return requestJson('/api/v1/anomalies/external/gcp/pubsub', {
    method: 'POST',
    body: JSON.stringify({ message, subscription }),
  })
}

// ── Business Mapping & Chargeback ─────────────────────────────────────────

export async function fetchMappingRules(
  dimension?: string,
  activeOnly = true,
): Promise<BusinessMappingRuleListResponse> {
  return requestJson<BusinessMappingRuleListResponse>(
    `/api/v1/business-mapping/rules${toQueryString({ dimension, active_only: activeOnly ? '1' : undefined })}`,
  )
}

export async function createMappingRule(
  payload: Omit<BusinessMappingRule, 'id' | 'organization_id' | 'customer_id' | 'created_at' | 'updated_at'>,
): Promise<BusinessMappingRule> {
  return requestJson<BusinessMappingRule>('/api/v1/business-mapping/rules', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateMappingRule(
  id: number,
  payload: Omit<BusinessMappingRule, 'id' | 'organization_id' | 'customer_id' | 'created_at' | 'updated_at'>,
): Promise<BusinessMappingRule> {
  return requestJson<BusinessMappingRule>(`/api/v1/business-mapping/rules/${encodeURIComponent(String(id))}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteMappingRule(id: number): Promise<void> {
  await requestJson(`/api/v1/business-mapping/rules/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  })
}

export async function applyMappingRules(): Promise<{
  status: string
  rules_applied: number
  records_processed: number
  dimension_rows_written: number
}> {
  return requestJson('/api/v1/business-mapping/apply', { method: 'POST' })
}

export async function fetchChargeback(dimensionType: string = 'team'): Promise<ChargebackResponse> {
  return requestJson<ChargebackResponse>(
    `/api/v1/chargeback${toQueryString({ dimension_type: dimensionType })}`,
  )
}

export async function fetchAllocationCoverage(): Promise<AllocationCoverageResponse> {
  return requestJson<AllocationCoverageResponse>('/api/v1/chargeback/coverage')
}

// ── Epic 4: Reporting & Trend ─────────────────────────────────────────────

export async function fetchCostTrend(
  periodType: 'monthly' | 'weekly' = 'monthly',
  lookback = 6,
  provider?: string,
  viewBy: 'provider' | 'region' | 'service' | 'account' = 'provider',
): Promise<CostTrendResponse> {
  return requestJson<CostTrendResponse>(
    `/api/v1/reports/cost-trend${toQueryString({ period_type: periodType, lookback, provider, view_by: viewBy })}`,
  )
}

export async function computePeriodSummaries(
  periodType: 'monthly' | 'weekly' = 'monthly',
): Promise<PeriodSummaryComputeResponse> {
  return requestJson<PeriodSummaryComputeResponse>(
    `/api/v1/reports/period-summaries/compute${toQueryString({ period_type: periodType })}`,
    { method: 'POST' },
  )
}

export async function downloadChargebackCsv(): Promise<void> {
  const blob = await requestBlob('/api/v1/reports/chargeback.csv')
  saveBlob(blob, `optiora-chargeback-${new Date().toISOString().slice(0, 10)}.csv`)
}

export async function downloadChargebackXlsx(): Promise<void> {
  const blob = await requestBlob('/api/v1/reports/chargeback.xlsx')
  saveBlob(blob, `optiora-report-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export async function downloadExecutiveSummaryXlsx(): Promise<void> {
  const blob = await requestBlob('/api/v1/reports/executive-summary.xlsx')
  saveBlob(blob, `optiora-executive-summary-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ── FOCUS Export ─────────────────────────────────────────────────────────────

export async function downloadFocusCsv(cloudProvider = 'all'): Promise<void> {
  const blob = await requestBlob(`/api/v1/exports/focus.csv${toQueryString({ cloud_provider: cloudProvider })}`)
  saveBlob(blob, `optiora-focus-${new Date().toISOString().slice(0, 10)}.csv`)
}

export async function fetchFocusJson(cloudProvider = 'all'): Promise<FocusExportResponse> {
  return requestJson<FocusExportResponse>(`/api/v1/exports/focus.json${toQueryString({ cloud_provider: cloudProvider })}`)
}

// ── Unit Economics Cockpit ────────────────────────────────────────────────────

export async function fetchUnitEconomicsCockpit(cloudProvider = 'all'): Promise<UnitEconomicsCockpitResponse> {
  return requestJson<UnitEconomicsCockpitResponse>(
    `/api/v1/analytics/unit-economics/cockpit${toQueryString({ cloud_provider: cloudProvider })}`,
  )
}

export async function recordUnitEconomicsMetric(payload: {
  metric_name: string
  metric_value: number
  metric_unit?: string
}): Promise<UnitEconomicsMetricResult> {
  return requestJson<UnitEconomicsMetricResult>('/api/v1/analytics/unit-economics/metrics', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// ── Scorecards ────────────────────────────────────────────────────────────────

export async function fetchScorecards(): Promise<ScorecardsResponse> {
  return requestJson<ScorecardsResponse>('/api/v1/analytics/scorecards')
}

// ── Resource Inventory ────────────────────────────────────────────────────────

export async function fetchResourceInventory(params: {
  provider?: string
  region?: string
  waste_only?: boolean
  limit?: number
  offset?: number
} = {}): Promise<ResourceInventoryResponse> {
  return requestJson<ResourceInventoryResponse>(
    `/api/v1/inventory/resources${toQueryString({
      provider: params.provider,
      region: params.region,
      waste_only: params.waste_only ? 'true' : undefined,
      limit: params.limit,
      offset: params.offset,
    })}`,
  )
}

// ── Kubernetes Cost Allocation ────────────────────────────────────────────────

export async function fetchKubernetesSummary(): Promise<KubernetesSummaryResponse> {
  return requestJson<KubernetesSummaryResponse>('/api/v1/analytics/kubernetes/summary')
}

export async function calculateKubernetesClusterCost(payload: {
  cluster_name: string
  provider: string
  region: string
  node_count: number
  node_type: string
  monthly_node_cost_usd: number
  namespaces?: string[]
  opencost_enabled?: boolean
  opencost_url?: string
  opencost_window_days?: number
  workloads?: Array<{
    namespace: string
    workload_name: string
    team?: string
    node_pool?: string
    replicas?: number
    cpu_request_cores?: number
    cpu_limit_cores?: number
    memory_request_gib?: number
    memory_limit_gib?: number
    cpu_usage_cores?: number
    memory_usage_gib?: number
  }>
  node_pools?: Array<{
    name: string
    node_count?: number
    monthly_node_cost_usd?: number
    cpu_capacity_cores?: number
    memory_capacity_gib?: number
  }>
}): Promise<KubernetesClusterCostResponse> {
  return requestJson<KubernetesClusterCostResponse>('/api/v1/analytics/kubernetes/cluster-cost', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function syncOpenCostCosts(payload: {
  api_url: string
  cluster_name: string
  window_days?: number
}): Promise<OpenCostSyncResponse> {
  return requestJson<OpenCostSyncResponse>('/api/v1/analytics/kubernetes/opencost/sync', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchPartnerCustomerPortfolio(): Promise<PartnerCustomerPortfolioResponse> {
  return requestJson<PartnerCustomerPortfolioResponse>('/api/v1/partner/customer-portfolio')
}

// ── Advanced FinOps endpoints ───────────────────────────────────────────────

export async function fetchTagQualityScore(provider = 'all'): Promise<TagQualityScoreResponse> {
  return requestJson<TagQualityScoreResponse>(
    `/api/v1/analytics/tag-quality${toQueryString({ provider })}`,
  )
}

export async function fetchDecisionGradeRecommendations(params?: {
  provider?: string
  top_n?: number
  min_monthly_savings?: number
}): Promise<DecisionRecommendationResponse> {
  return requestJson<DecisionRecommendationResponse>(
    `/api/v1/recommendations/decision-grade${toQueryString({
      provider: params?.provider,
      top_n: params?.top_n,
      min_monthly_savings: params?.min_monthly_savings,
    })}`,
  )
}

export async function fetchFederatedCosts(params?: {
  provider?: string
  include_regions?: boolean
}): Promise<FederationCostResponse> {
  return requestJson<FederationCostResponse>(
    `/api/v1/federation/costs${toQueryString({
      provider: params?.provider,
      include_regions: params?.include_regions === undefined ? undefined : String(params.include_regions),
    })}`,
  )
}

export async function runAutoRemediationLoop(
  payload: RemediationLoopRequestPayload,
): Promise<RemediationLoopResponse> {
  return requestJson<RemediationLoopResponse>('/api/v1/automation/remediation/loop', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// --- Virtual Tagging ---

export function fetchVirtualTagRules(): Promise<VirtualTagRulesResponse> {
  return requestJson<VirtualTagRulesResponse>('/api/v1/virtual-tags/rules')
}

export function createVirtualTagRule(payload: VirtualTagRuleCreate): Promise<VirtualTagRuleOut> {
  return requestJson<VirtualTagRuleOut>('/api/v1/virtual-tags/rules', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateVirtualTagRule(id: number, payload: VirtualTagRuleCreate): Promise<VirtualTagRuleOut> {
  return requestJson<VirtualTagRuleOut>(`/api/v1/virtual-tags/rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteVirtualTagRule(id: number): Promise<void> {
  const url = backendUrl(`/api/v1/virtual-tags/rules/${id}`)
  await authorizedFetch(url, { method: 'DELETE' })
}

export function previewVirtualTags(limit = 50): Promise<VirtualTagPreviewResponse> {
  return requestJson<VirtualTagPreviewResponse>(`/api/v1/virtual-tags/preview?limit=${limit}`)
}

// --- Rightsizing ---

export function fetchRightsizingRecommendations(params?: {
  provider?: string
  min_savings?: number
  limit?: number
}): Promise<RightsizingResponse> {
  const q = new URLSearchParams()
  if (params?.provider && params.provider !== 'all') q.set('provider', params.provider)
  if (params?.min_savings !== undefined) q.set('min_savings', String(params.min_savings))
  if (params?.limit !== undefined) q.set('limit', String(params.limit))
  const qs = q.toString()
  return requestJson<RightsizingResponse>(`/api/v1/recommendations/rightsizing${qs ? `?${qs}` : ''}`)
}

// --- New FinOps Analytics ---

export function fetchTaggingCoverage(cloudProvider = 'all'): Promise<TaggingCoverageResponse> {
  return requestJson<TaggingCoverageResponse>(
    `/api/v1/analytics/tagging-coverage${toQueryString({ cloud_provider: cloudProvider })}`,
  )
}

export function fetchSustainabilityMetrics(cloudProvider = 'all'): Promise<SustainabilityResponse> {
  return requestJson<SustainabilityResponse>(
    `/api/v1/analytics/sustainability${toQueryString({ cloud_provider: cloudProvider })}`,
  )
}

export function fetchCrossProviderComparison(): Promise<CrossProviderComparisonResponse> {
  return requestJson<CrossProviderComparisonResponse>('/api/v1/analytics/cross-provider-comparison')
}

export function fetchAnomalyIntelligence(cloudProvider = 'all'): Promise<AnomalyIntelligenceResponse> {
  return requestJson<AnomalyIntelligenceResponse>(
    `/api/v1/analytics/anomaly-intelligence${toQueryString({ cloud_provider: cloudProvider })}`,
  )
}

export function fetchChargebackSummary(cloudProvider = 'all'): Promise<ChargebackSummaryResponse> {
  return requestJson<ChargebackSummaryResponse>(
    `/api/v1/analytics/chargeback-summary${toQueryString({ cloud_provider: cloudProvider })}`,
  )
}
