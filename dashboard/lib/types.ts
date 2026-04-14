/**
 * TypeScript types for API responses
 */

export interface CostResponse {
  totalCost: number
  trend: number
  anomalies: number
  potentialSavings: number
  breakdown: {
    [key: string]: {
      cost: number
      percentage: number
    }
  }
}

export interface AnomalyResponse {
  id: string
  service: string
  cloud: string
  message: string
  severity: 'high' | 'medium' | 'low'
  timestamp: string
  change: number
}

export interface RecommendationResponse {
  id: string
  service: string
  cloud: string
  title: string
  description: string
  savings: number
  roi: number
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface CloudCredential {
  id: string
  provider: string
  status: 'connected' | 'disconnected' | 'error'
  lastSync: string
}
