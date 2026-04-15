import {
  CostResponse,
  AnomalyResponse,
  RecommendationResponse,
  ApiHealth,
  ApiInfo,
  CredentialListResponse,
  ScanningPermission,
  ScanStartResponse,
  ForecastResponse,
  FinOpsAnalyticsResponse,
  ScanHistoryItem,
  ScanDiffResponse,
  AuditLogEntry,
  AlertEvent,
  ProviderAccountRollupResponse,
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

/**
 * Fetch cost data from backend
 * Falls back to an explicit zero-cost baseline if API is unavailable.
 */
export async function fetchCosts(): Promise<CostResponse> {
  try {
    return await requestJson<CostResponse>('/api/v1/costs', {}, { authenticated: false })
  } catch (error) {
    console.warn('Failed to fetch costs from backend, using safe fallback data', error)
    return safeFallbackCostData as CostResponse
  }
}

/**
 * Fetch anomalies from backend
 */
export async function fetchAnomalies(params: { limit?: number; offset?: number } = {}): Promise<{ items: AnomalyResponse[]; total: number; limit: number; offset: number }> {
  const search = new URLSearchParams()
  if (params.limit !== undefined) search.set('limit', String(params.limit))
  if (params.offset !== undefined) search.set('offset', String(params.offset))
  const path = `/api/v1/anomalies${search.toString() ? `?${search.toString()}` : ''}`
  try {
    return await requestJson(path, {}, { authenticated: false }) as { items: AnomalyResponse[]; total: number; limit: number; offset: number }
  } catch (error) {
    console.warn('Failed to fetch anomalies, using empty list', error)
    return { items: [], total: 0, limit: params.limit ?? 50, offset: params.offset ?? 0 }
  }
}

/**
 * Fetch recommendations from backend
 */
export async function fetchRecommendations(params: { limit?: number; offset?: number } = {}): Promise<{ items: RecommendationResponse[]; total: number; limit: number; offset: number }> {
  const search = new URLSearchParams()
  if (params.limit !== undefined) search.set('limit', String(params.limit))
  if (params.offset !== undefined) search.set('offset', String(params.offset))
  const path = `/api/v1/recommendations${search.toString() ? `?${search.toString()}` : ''}`
  try {
    return await requestJson(path, {}, { authenticated: false }) as { items: RecommendationResponse[]; total: number; limit: number; offset: number }
  } catch (error) {
    console.warn('Failed to fetch recommendations, using empty list', error)
    return { items: [], total: 0, limit: params.limit ?? 50, offset: params.offset ?? 0 }
  }
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

export async function fetchScanHistory(limit = 10): Promise<ScanHistoryItem[]> {
  return requestJson<ScanHistoryItem[]>(`/api/v1/scanning/history?limit=${encodeURIComponent(String(limit))}`)
}

export async function fetchScanDiff(scanId: string, baseScanId?: string): Promise<ScanDiffResponse> {
  const search = new URLSearchParams()
  if (baseScanId) search.set('base_scan_id', baseScanId)
  const suffix = search.toString() ? `?${search.toString()}` : ''
  return requestJson<ScanDiffResponse>(`/api/v1/scanning/${encodeURIComponent(scanId)}/diff${suffix}`)
}

export async function fetchAuditLogs(limit = 20): Promise<AuditLogEntry[]> {
  return requestJson<AuditLogEntry[]>(`/api/v1/audit-logs?limit=${encodeURIComponent(String(limit))}`)
}

export async function fetchAlerts(limit = 20): Promise<AlertEvent[]> {
  return requestJson<AlertEvent[]>(`/api/v1/alerts?limit=${encodeURIComponent(String(limit))}`)
}

export async function fetchProviderAccountRollups(provider?: string): Promise<ProviderAccountRollupResponse | null> {
  const search = new URLSearchParams()
  if (provider) search.set('provider', provider)
  const suffix = search.toString() ? `?${search.toString()}` : ''
  try {
    return await requestJson<ProviderAccountRollupResponse>(`/api/v1/hierarchy/accounts${suffix}`)
  } catch {
    return null
  }
}

export async function acknowledgeAlert(alertId: number): Promise<AlertEvent> {
  return requestJson<AlertEvent>(`/api/v1/alerts/${encodeURIComponent(String(alertId))}/acknowledge`, {
    method: 'POST',
  })
}

async function downloadAuthorizedFile(path: string, fallbackFilename: string): Promise<void> {
  const response = await authorizedFetch(backendUrl(path))
  if (!response.ok) {
    throw new Error(`Download failed with ${response.status}`)
  }
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') || ''
  const filenameMatch = disposition.match(/filename="([^"]+)"/)
  const filename = filenameMatch?.[1] || fallbackFilename
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export async function downloadScanHistoryCsv(): Promise<void> {
  await downloadAuthorizedFile('/api/v1/exports/scan-history.csv', 'optiora-scan-history.csv')
}

export async function downloadAuditLogsCsv(): Promise<void> {
  await downloadAuthorizedFile('/api/v1/exports/audit-logs.csv', 'optiora-audit-log.csv')
}

export async function downloadAlertsCsv(): Promise<void> {
  await downloadAuthorizedFile('/api/v1/exports/alerts.csv', 'optiora-alerts.csv')
}

export async function downloadScanDiffCsv(scanId: string, baseScanId?: string): Promise<void> {
  const search = new URLSearchParams()
  if (baseScanId) search.set('base_scan_id', baseScanId)
  await downloadAuthorizedFile(
    `/api/v1/exports/scans/${encodeURIComponent(scanId)}/diff.csv${search.toString() ? `?${search.toString()}` : ''}`,
    `optiora-scan-diff-${scanId}.csv`,
  )
}

export async function fetchForecast(months = 12): Promise<ForecastResponse> {
  return requestJson<ForecastResponse>(
    `/api/v1/forecast?months=${encodeURIComponent(String(months))}`,
    {},
    { authenticated: false },
  )
}

export async function fetchFinOpsAnalytics(): Promise<FinOpsAnalyticsResponse> {
  return requestJson<FinOpsAnalyticsResponse>(
    '/api/v1/analytics',
    {},
    { authenticated: false },
  )
}
