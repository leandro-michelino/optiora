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
  message?: string
  is_active?: boolean
  tested_at?: string
  last_tested?: string
  created_at?: string
}

export interface CredentialListResponse {
  organization_id?: number
  customer_id?: string
  credentials: StoredCredential[]
}

export interface ScanningPermission {
  customer_id: string
  organization_id: number
  state: string
  providers: string[]
  scan_frequency: string
  auto_remediate: boolean
  notification_email?: string | null
  monthly_budget_usd: number
  warning_threshold_percent: number
  critical_threshold_percent: number
  notifications_enabled: boolean
  created_at: string
  approved_at?: string | null
}

export interface ScanStartResponse {
  scan_id: string
  customer_id: string
  organization_id: number
  state: string
  progress: number
  providers: string[]
  started_at: string
  completed_at?: string | null
  total_resources: number
  anomalies_found: number
  savings_identified: number
}

export interface ForecastPoint {
  month: string
  baseline: number
  conservative: number
  balanced: number
  aggressive: number
  lower_bound: number
  upper_bound: number
  p10?: number
  p50?: number
  p90?: number
  budget_flag?: 'within' | 'watch' | 'breach-likely' | null
}

export interface ForecastScenario {
  name: string
  description: string
  projected_total_usd: number
  savings_usd: number
  savings_percent: number
  implementation_weeks: number
  risk_level: string
}

export interface ForecastResponse {
  generated_at: string
  forecast_months: number
  current_monthly_spend_usd: number
  model: {
    type: string
    monthly_growth_rate: number
    weighted_volatility: number
    confidence_method: string
    commitment_score?: number
  }
  history: Array<{ month: string; actual_usd: number }>
  forecast: ForecastPoint[]
  fan_percentiles?: Array<{ month: string; p10: number; p50: number; p90: number; budget_flag?: string | null }>
  budget_guardrails?: {
    budget_monthly_usd: number
    breaches: number
    first_breach_month: string | null
    breach_severity: 'none' | 'medium' | 'high'
  } | null
  genai_brief?: string
  scenarios: ForecastScenario[]
}

export interface ScanHistoryItem {
  scan_id: string
  customer_id: string
  organization_id: number
  state: string
  providers: string[]
  started_at: string
  completed_at?: string | null
  total_resources: number
  anomalies_found: number
  savings_identified: number
}

export interface ScanDiffEntry {
  provider: string
  current_cost_usd: number
  previous_cost_usd: number
  delta_cost_usd: number
  delta_percent?: number | null
  current_anomalies: number
  previous_anomalies: number
}

export interface ScanDiffResponse {
  organization_id: number
  current_scan_id: string
  previous_scan_id?: string | null
  total_current_cost_usd: number
  total_previous_cost_usd: number
  total_delta_cost_usd: number
  entries: ScanDiffEntry[]
}

export interface AuditLogEntry {
  id: number
  action: string
  entity_type: string
  entity_id?: string | null
  actor_user_id?: number | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface AlertEvent {
  id: number
  alert_type: string
  severity: string
  title: string
  message: string
  delivered_channels: string[]
  acknowledged_at?: string | null
  created_at: string
}

export interface FinOpsAnalyticsResponse {
  generated_at: string
  current_monthly_spend_usd: number
  estimated_monthly_waste_usd: number
  identified_monthly_savings_usd: number
  risk_score: number
  maturity_score: number
  commitment_coverage_percent: number
  unit_metrics: {
    estimated_waste_rate_percent: number
    savings_to_spend_percent: number
    anomaly_density_per_10k: number
  }
  provider_findings: Array<{
    provider: string
    monthly_cost_usd: number
    estimated_waste_usd: number
    commitment_coverage_percent: number
    volatility_score: number
  }>
  provider_signals?: Array<{
    provider: string
    signal: string
    message: string
  }>
  actions: string[]
  genai_advice_prompt?: string
}
