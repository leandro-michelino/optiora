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
  regionBreakdown?: Array<{
    region: string
    cost_usd: number
  }>
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

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  limit: number
  offset: number
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

export interface ProviderDiagnostic {
  provider: string
  configured: boolean
  required_settings: string[]
  missing_settings: string[]
  recommendation: string
}

export type DataSourceState = 'live' | 'imported' | 'partial' | 'fallback'

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
  budget_breach_probability?: number
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
  history_source?: 'cost_snapshots' | 'synthetic' | string
  history_coverage_months?: number
  current_monthly_spend_usd: number
  model: {
    type: string
    monthly_growth_rate: number
    weighted_volatility: number
    confidence_method: string
    commitment_score?: number
    provider_concentration_hhi?: number
  }
  history: Array<{ month: string; actual_usd: number }>
  forecast: ForecastPoint[]
  fan_percentiles?: Array<{ month: string; p10: number; p50: number; p90: number; budget_flag?: string | null }>
  budget_guardrails?: {
    budget_monthly_usd: number
    breaches: number
    first_breach_month: string | null
    breach_severity: 'none' | 'medium' | 'high'
    average_breach_probability?: number
  } | null
  backtesting?: {
    window_months: number
    mape_percent: number | null
    wmape_percent: number | null
    training_points: number
    actual_points: number[]
    predicted_points: number[]
  } | null
  forecast_summary?: {
    annualized_run_rate_usd: number
    projected_12m_baseline_usd: number
    projected_12m_balanced_usd: number
    expected_12m_savings_balanced_usd: number
  }
  genai_brief?: string
  genai_context?: {
    prompt: string
    focus_areas: string[]
  }
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

export interface SchedulerTimelineItem {
  id: string
  event_type: string
  state: string
  title: string
  detail: string
  created_at: string
}

export interface SchedulerStatusResponse {
  organization_id: number
  customer_id: string
  scheduler_enabled: boolean
  scheduler_running: boolean
  permission_state: string
  scan_frequency: string
  next_run_at?: string | null
  next_run_eta_seconds?: number | null
  last_success_at?: string | null
  last_failure_at?: string | null
  counters: {
    total: number
    success: number
    failure: number
  }
  timeline: SchedulerTimelineItem[]
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

export interface AccountRegionRow {
  region: string
  cost_usd: number
}

export interface ProviderAccountRollupItem {
  account_id: number
  provider: string
  account_identifier: string
  account_name: string
  account_type: string
  depth: number
  parent_account_id?: number | null
  parent_account_identifier?: string | null
  direct_cost_usd: number
  rolled_up_cost_usd: number
  direct_savings_identified_usd: number
  rolled_up_savings_identified_usd: number
  direct_anomalies_count: number
  rolled_up_anomalies_count: number
  direct_service_count: number
  rolled_up_service_count: number
  child_count: number
  scan_id?: string | null
  captured_at?: string | null
  top_regions?: AccountRegionRow[]
}

export interface ProviderAccountRollupResponse {
  organization_id: number
  customer_id: string
  provider?: string | null
  scan_id?: string | null
  generated_at: string
  total_direct_cost_usd: number
  total_rolled_up_cost_usd: number
  items: ProviderAccountRollupItem[]
}

export interface ImportedCostUploadResponse {
  organization_id: number
  customer_id: string
  upload_id: string
  filename: string
  rows_imported: number
  total_cost_usd: number
  providers: string[]
  imported_at: string
}

export interface ImportedCostSummaryResponse {
  organization_id: number
  customer_id: string
  has_data: boolean
  upload_id?: string | null
  source_filename?: string | null
  rows_imported: number
  total_cost_usd: number
  providers: string[]
  last_imported_at?: string | null
}

export interface ProviderAccountInventoryItem {
  account_id: number
  provider: string
  account_identifier: string
  account_name: string
  account_type: string
  native_region?: string | null
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at?: string | null
}

export interface ProviderAccountInventoryResponse {
  organization_id: number
  customer_id: string
  total: number
  accounts: ProviderAccountInventoryItem[]
}

export interface AccountRegionBreakdownItem {
  region: string
  cost_usd: number
  scan_id: string
  captured_at: string
}

export interface AccountRegionBreakdownResponse {
  account_id: number
  provider: string
  account_name: string
  scan_id?: string | null
  total_cost_usd: number
  regions: AccountRegionBreakdownItem[]
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
    budget_utilization_percent?: number
  }
  spend_at_risk_usd?: number
  optimization_capacity_usd?: number
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
