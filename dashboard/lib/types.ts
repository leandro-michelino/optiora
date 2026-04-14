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

export interface ApiHealth {
  status: string
  version?: string
  timestamp?: string
}

export interface ApiInfo {
  name: string
  version: string
  description: string
  supported_providers: string[]
  features: Record<string, boolean>
}

export interface StoredCredential {
  provider: string
  is_valid: boolean
  tested_at?: string
  last_tested?: string
}

export interface CredentialListResponse {
  customer_id?: string
  credentials: StoredCredential[]
}

export interface ScanningPermission {
  customer_id: string
  state: string
  providers: string[]
  scan_frequency: string
  auto_remediate: boolean
  created_at: string
  approved_at?: string | null
}

export interface ScanStartResponse {
  scan_id: string
  customer_id: string
  state: string
  progress: number
  providers: string[]
  started_at: string
  completed_at?: string | null
  total_resources: number
  anomalies_found: number
  savings_identified: number
}
