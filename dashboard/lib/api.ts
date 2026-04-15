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
    return await requestJson<CostResponse>('/api/v1/costs')
  } catch (error) {
    console.warn('Failed to fetch costs from backend, using safe fallback data', error)
    return safeFallbackCostData as CostResponse
  }
}

/**
 * Fetch anomalies from backend
 */
export async function fetchAnomalies(): Promise<AnomalyResponse[]> {
  try {
    return await requestJson<AnomalyResponse[]>('/api/v1/anomalies')
  } catch (error) {
    console.warn('Failed to fetch anomalies, using empty list', error)
    return []
  }
}

/**
 * Fetch recommendations from backend
 */
export async function fetchRecommendations(): Promise<RecommendationResponse[]> {
  try {
    return await requestJson<RecommendationResponse[]>(
      '/api/v1/recommendations',
      {},
    )
  } catch (error) {
    console.warn('Failed to fetch recommendations, using empty list', error)
    return []
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
