import axios from 'axios'
import { CostResponse, AnomalyResponse, RecommendationResponse } from './types'
import { BACKEND_URL } from './backend-url'

const api = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Mock data fallback
const mockCostData = {
  totalCost: 12450.50,
  trend: 8.2,
  anomalies: 3,
  potentialSavings: 2340.00,
  breakdown: {
    aws: { cost: 5200, percentage: 41.8 },
    azure: { cost: 3400, percentage: 27.3 },
    gcp: { cost: 2350, percentage: 18.9 },
    oci: { cost: 1500, percentage: 12.0 },
  },
}

/**
 * Fetch cost data from backend
 * Falls back to mock data if API is unavailable
 */
export async function fetchCosts(): Promise<CostResponse> {
  try {
    const response = await api.get('/api/v1/costs')
    return response.data
  } catch (error) {
    console.warn('Failed to fetch costs from backend, using mock data', error)
    return mockCostData as CostResponse
  }
}

/**
 * Fetch anomalies from backend
 */
export async function fetchAnomalies(): Promise<AnomalyResponse[]> {
  try {
    const response = await api.get('/api/v1/anomalies')
    return response.data
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
    const response = await api.get('/api/v1/recommendations')
    return response.data
  } catch (error) {
    console.warn('Failed to fetch recommendations, using empty list', error)
    return []
  }
}

export default api
