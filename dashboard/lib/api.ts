import {
  AccountRegionBreakdownResponse,
  AlertEvent,
  AuditLogEntry,
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
  FinOpsAnalyticsResponse,
  ImportedCostSummaryResponse,
  ImportedCostUploadResponse,
  ProviderDiagnostic,
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

export async function startScan(providers?: string[]): Promise<ScanStartResponse> {
  return requestJson<ScanStartResponse>('/api/v1/scanning/start', {
    method: 'POST',
    body: JSON.stringify({ providers }),
  })
}

export async function fetchForecast(months = 12): Promise<ForecastResponse> {
  return requestJson<ForecastResponse>(
    `/api/v1/forecast?months=${encodeURIComponent(String(months))}`,
    {},
  )
}

export async function fetchFinOpsAnalytics(): Promise<FinOpsAnalyticsResponse> {
  return requestJson<FinOpsAnalyticsResponse>(
    '/api/v1/analytics',
    {},
  )
}

export async function fetchScanHistory(limit = 20): Promise<ScanHistoryItem[]> {
  return requestJson<ScanHistoryItem[]>(
    `/api/v1/scanning/history${toQueryString({ limit })}`,
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

export async function downloadImportedCostTemplateCsv(): Promise<void> {
  const blob = await requestBlob('/api/v1/imports/costs/template.csv')
  saveBlob(blob, 'optiora-cost-import-template.csv')
}

export async function fetchAlerts(limit = 20): Promise<AlertEvent[]> {
  return requestJson<AlertEvent[]>(
    `/api/v1/alerts${toQueryString({ limit })}`,
    {},
  )
}

export async function acknowledgeAlert(alertId: number): Promise<{ status: string; alert_id: number }> {
  return requestJson<{ status: string; alert_id: number }>(
    `/api/v1/alerts/${encodeURIComponent(String(alertId))}/acknowledge`,
    { method: 'POST' },
  )
}

export async function fetchAuditLogs(limit = 20): Promise<AuditLogEntry[]> {
  return requestJson<AuditLogEntry[]>(
    `/api/v1/audit-logs${toQueryString({ limit })}`,
    {},
  )
}

export async function runScheduledScanNow(): Promise<{ status: string; started: number; organization_id?: number | null }> {
  return requestJson<{ status: string; started: number; organization_id?: number | null }>(
    '/api/v1/scanning/scheduler/run-now',
    { method: 'POST' },
  )
}

export async function fetchSchedulerStatus(): Promise<SchedulerStatusResponse | null> {
  try {
    return await requestJson<SchedulerStatusResponse>('/api/v1/scanning/scheduler/status')
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
  const blob = await requestBlob('/api/v1/reports/executive-summary.xls')
  saveBlob(blob, `optiora-executive-summary-${new Date().toISOString().slice(0, 10)}.xls`)
}
