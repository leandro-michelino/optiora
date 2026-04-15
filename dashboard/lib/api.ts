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
import { paths } from '@/generated/api-types'
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

// Convenience client wrapper using generated types
type ApiResponse<Path extends keyof paths, Method extends keyof paths[Path]> =
  paths[Path][Method] extends { responses: infer R }
    ? R extends { 200: infer Ok }
      ? Ok extends { content: { 'application/json': infer C } }
        ? C
        : unknown
      : unknown
    : unknown

/**
 * Fetch cost data from backend
 * Falls back to an explicit zero-cost baseline if API is unavailable.
 */
export async function fetchCosts(): Promise<CostResponse> {
  try {
    const data = await requestJson<ApiResponse<'/api/v1/costs', 'get'>>('/api/v1/costs', {}, { authenticated: false })
    // ApiResponse returns numeric keys; normalize to existing CostResponse shape
    return {
      totalCost: Number(data.totalCost ?? 0),
      trend: Number(data.trend ?? 0),
      anomalies: Number(data.anomalies ?? 0),
      potentialSavings: Number(data.potentialSavings ?? 0),
      breakdown: data.breakdown as CostResponse['breakdown'],
    }
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
