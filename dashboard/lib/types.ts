/**
 * TypeScript types for API responses
 */

export interface CostResponse {
  totalCost: number
  trend: number
  anomalies: number
  potentialSavings: number
  cost_context?: {
    source?: string
    provider_errors?: Record<string, string>
    rows_imported?: number
    last_imported_at?: string | null
  }
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
  source?: string
  resource_id?: string | null
  resource_type?: string | null
  resource_name?: string | null
  region?: string | null
  recommendation_type?: string | null
  recommendation_name?: string | null
  resource_count?: number | null
  category?: string | null
  importance?: string | null
  status?: string | null
  recommendation_status?: string | null
  resource_console_url?: string | null
}

export type RecommendationLedgerStatus =
  | 'open'
  | 'planned'
  | 'approved'
  | 'executed'
  | 'verified'
  | 'rejected'
  | 'expired'

export interface RecommendationLedgerItem {
  id: number
  organization_id: number
  provider: string
  resource_id: string
  resource_name: string | null
  resource_type: string | null
  account_id: string | null
  region: string | null
  recommendation_source: string
  recommendation_fingerprint: string
  action: string
  confidence: string
  effort: string
  status: RecommendationLedgerStatus
  owner: string | null
  current_size: string | null
  recommended_size: string | null
  current_monthly_cost_usd: number
  projected_monthly_cost_usd: number
  planned_monthly_savings_usd: number
  planned_annual_savings_usd: number
  realized_monthly_savings_usd: number
  realized_annual_savings_usd: number
  variance_monthly_usd: number
  variance_annual_usd: number
  variance_percent: number
  variance_reason: string | null
  reason: string | null
  resource_console_url: string | null
  first_seen_at: string | null
  last_seen_at: string | null
  planned_at: string | null
  realized_at: string | null
  last_exported_at: string | null
  times_seen: number
}

export interface RecommendationLedgerResponse {
  generated_at: string
  organization_id: number
  total_count: number
  total_planned_monthly_savings_usd: number
  total_realized_monthly_savings_usd: number
  total_variance_monthly_usd: number
  total_planned_annual_savings_usd: number
  total_realized_annual_savings_usd: number
  total_variance_annual_usd: number
  items: RecommendationLedgerItem[]
}

export interface RecommendationLedgerUpdate {
  realized_monthly_savings_usd?: number
  realized_annual_savings_usd?: number
  variance_reason?: string
  status?: RecommendationLedgerStatus
  owner?: string
  realized_at?: string
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
  scope_model?: string
  primary_apis?: string[]
  optimization_apis?: string[]
  telemetry_apis?: string[]
  default_page_size?: number
  max_page_size?: number
  max_parallel_requests?: number
  request_timeout_seconds?: number
  retryable_statuses?: number[]
  throttling_signals?: string[]
  scan_notes?: string[]
}

export type DataSourceState = 'checking' | 'live' | 'imported' | 'partial' | 'fallback'

// ---------------------------------------------------------------------------
// New analytics types (Epic 5)
// ---------------------------------------------------------------------------

export interface WasteCategory {
  category: string
  description: string
  estimated_waste_usd: number
  estimated_waste_rate_percent: number
  savings_range_usd: { low: number; high: number }
  remediation: string
  effort: 'low' | 'medium' | 'high'
  priority_score: number
}

export interface CloudWasteResponse {
  generated_at: string
  current_monthly_spend_usd: number
  total_estimated_waste_usd: number
  total_waste_rate_percent: number
  total_savings_potential_usd: number
  waste_grade: 'A' | 'B' | 'C' | 'D'
  categories: WasteCategory[]
  quick_wins: WasteCategory[]
}

export interface EfficiencyDimension {
  score: number
  benchmark: number
  current: number
  unit: string
  lower_is_better?: boolean
}

export interface EfficiencyScoreResponse {
  generated_at: string
  overall_score: number
  grade: 'A+' | 'A' | 'B' | 'C' | 'D'
  dimensions: Record<string, EfficiencyDimension>
  improvement_focus: string[]
  interpretation: string
}

export interface CommitmentScenario {
  discount_rate_percent: number
  monthly_savings_usd: number
  annual_savings_usd: number
  breakeven_months?: number | null
}

export interface ProviderGap {
  provider: string
  monthly_cost_usd: number
  current_commitment_percent: number
  target_commitment_percent: number
  gap_percent: number
  committable_spend_usd: number
  commitment_instrument: string
  scenarios: { '1_year': CommitmentScenario; '3_year': CommitmentScenario }
  recommendation: string
}

export interface CommitmentGapResponse {
  generated_at: string
  total_monthly_spend_usd: number
  overall_current_commitment_percent: number
  total_gap_savings_monthly_usd: number
  total_annual_opportunity_usd: number
  provider_gaps: ProviderGap[]
  priority_provider: string | null
}

export type AdvisorNarrativeType =
  | 'waste_insights'
  | 'optimization_roadmap'
  | 'executive_narrative'
  | 'tagging_strategy'
  | 'sustainability_narrative'
  | 'finops_operating_review'

export interface HybridAdvisorResponse {
  generated_at: string
  cloud_provider: string
  source_of_truth: 'deterministic'
  deterministic: {
    analytics: FinOpsAnalyticsResponse
    waste: CloudWasteResponse
    efficiency: EfficiencyScoreResponse
    commitment_gap: CommitmentGapResponse
    recommendations: Array<{
      id: string
      service: string
      title: string
      description: string
      savings_monthly_usd: number
      roi_percent: number
      payback_months: number
    }>
  }
  advisory: {
    narrative_type: AdvisorNarrativeType
    narrative: string | null
    prompt: string
    rag?: unknown
    genai_configured: boolean
    fallback_mode: boolean
  }
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
  scheduler_override_enabled?: boolean
  scheduler_override_frequency?: 'hourly' | 'daily' | 'weekly' | string | null
  scheduler_retry_max_attempts?: number
  scheduler_retry_backoff_seconds?: number
  scheduler_overdue_alert_hours?: number
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
  history_source?: 'cost_snapshots' | 'current_month_observation' | 'no_history' | string
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

export interface ForecastStressTimelinePoint {
  month: string
  baseline_usd: number
  stressed_usd: number
  delta_usd: number
  budget_breach: boolean
}

export interface ForecastStressScenario {
  name: string
  description: string
  starts_month: number
  stressed_total_usd: number
  incremental_risk_usd: number
  peak_monthly_usd: number
  breach_months: number
  timeline: ForecastStressTimelinePoint[]
}

export interface ForecastStressTestResponse {
  generated_at: string
  forecast_months: number
  severity: 'low' | 'medium' | 'high' | string
  baseline_summary: {
    projected_total_usd: number
    average_monthly_usd: number
    budget_monthly_usd?: number | null
  }
  scenarios: ForecastStressScenario[]
  worst_case: {
    name: string | null
    incremental_risk_usd: number
    breach_months: number
  }
  hedging_playbook: string[]
  genai_narrative?: string | null
  genai_prompt?: string
}

export interface ForecastModelDiagnosticRow {
  model: string
  holdout_months: number
  mape_percent: number | null
  wmape_percent: number | null
  rmse_usd: number | null
  bias_percent: number | null
  actual_points: number[]
  predicted_points: number[]
}

export interface ForecastModelDiagnosticsResponse {
  generated_at: string
  forecast_months: number
  history_source: 'cost_snapshots' | 'current_month_observation' | 'no_history' | string
  history_points: number
  data_quality_score: number
  champion_model: string
  champion_wmape_percent?: number | null
  model_risk_level: 'low' | 'medium' | 'high' | string
  challenger_models: ForecastModelDiagnosticRow[]
  drift_signals: {
    flags: string[]
    cost_velocity_pct_mom?: number | null
    trend_acceleration_usd?: number | null
    residual_stddev_usd: number
    seasonality_strength: number
    provider_concentration_hhi: number
    weighted_volatility: number
    weighted_commitment: number
  }
  production_forecast_summary?: Record<string, unknown>
  forecast_quality?: Record<string, unknown>
  recommended_controls: string[]
  genai_narrative?: string | null
  genai_prompt?: string
}

export interface OptimizationPortfolioAction {
  id: string
  title: string
  service: string
  monthly_savings_usd: number
  annual_savings_usd: number
  roi_percent: number
  payback_months: number
  effort: string
  confidence: string
  portfolio_score: number
}

export interface OptimizationPortfolioResponse {
  generated_at: string
  portfolio_count: number
  total_monthly_savings_usd: number
  total_annual_savings_usd: number
  ranked_actions: OptimizationPortfolioAction[]
  quick_wins: OptimizationPortfolioAction[]
  strategic_bets: OptimizationPortfolioAction[]
  genai_narrative?: string | null
  genai_prompt?: string
}

export interface GenAICopilotNarrative {
  narrative: string | null
  prompt: string
  fallback_mode: boolean
}

export interface GenAICopilotPackResponse {
  generated_at: string
  cloud_provider: string
  deterministic_context: {
    analytics: FinOpsAnalyticsResponse
    forecast: {
      forecast_quality?: Record<string, unknown>
      budget_guardrails?: Record<string, unknown>
      downside_risk?: Record<string, unknown>
    }
    commitment_gap: CommitmentGapResponse
  }
  narratives: Record<string, GenAICopilotNarrative>
  genai_configured: boolean
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
  effective_scan_frequency?: string | null
  scheduler_override_enabled?: boolean
  next_run_at?: string | null
  next_run_eta_seconds?: number | null
  last_success_at?: string | null
  last_failure_at?: string | null
  retry_max_attempts?: number
  retry_backoff_seconds?: number
  overdue_alert_hours?: number
  overdue?: boolean
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
  lifecycle_state?: 'active' | 'acknowledged' | 'dismissed' | 'reactivated' | string
  acknowledged_at?: string | null
  ack_sla_minutes?: number
  ack_sla_breached?: boolean
  escalation_due?: boolean
  escalation_channels?: string[]
  created_at: string
}

export interface AlertOpsPolicy {
  organization_id: number
  mute_window_enabled: boolean
  mute_start_hour_utc: number
  mute_end_hour_utc: number
  mute_weekends: boolean
  timezone: string
  escalation_enabled: boolean
  escalation_after_minutes: number
  escalation_channels: string[]
  escalation_severity: 'warning' | 'critical' | string
  ack_sla_minutes: number
  dedupe_window_minutes: number
  min_severity: 'low' | 'medium' | 'high' | 'warning' | 'critical' | string
  daily_summary_enabled: boolean
  weekly_summary_enabled: boolean
  created_at: string
  updated_at: string
}

export interface AlertExecutiveSummary {
  organization_id: number
  period: 'daily' | 'weekly'
  generated_at: string
  window_start: string
  total_alerts: number
  acknowledged: number
  unacknowledged: number
  dismissed: number
  by_severity: Record<string, number>
}

export interface AdminDiagnosticsSnapshot {
  generated_at: string
  organization_id: number
  api_health: ApiHealth
  api_info: ApiInfo
  provider_diagnostics: ProviderDiagnostic[]
  scanning_permission: ScanningPermission
  scheduler: SchedulerStatusResponse
  data_freshness: DataFreshnessResponse
  notification_destinations: NotificationDestinationsResponse
}

export interface DataFreshnessProviderItem {
  provider: string
  last_ingested_at?: string | null
  age_seconds?: number | null
  status: 'fresh' | 'stale' | 'unknown' | string
}

export interface DataFreshnessConnectorItem {
  connector: string
  last_event_at?: string | null
  age_seconds?: number | null
  status: 'fresh' | 'stale' | 'unknown' | string
}

export interface DataFreshnessResponse {
  organization_id: number
  customer_id: string
  generated_at: string
  providers: DataFreshnessProviderItem[]
  connectors: DataFreshnessConnectorItem[]
  scheduler_lag_seconds?: number | null
  scheduler_status: 'healthy' | 'lagging' | 'unknown' | string
}

export interface AlertRoutingPolicy {
  id: number
  severity: 'warning' | 'critical' | string
  channels: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AlertRoutingPolicySimulationRequest {
  severity: 'warning' | 'critical'
  title?: string
  alert_type?: string
}

export interface AlertRoutingPolicySimulationResponse {
  severity: string
  matched_policy_id: number | null
  evaluated_channels: string[]
  expected_channels: string[]
  configured_channels: string[]
  inactive_policy: boolean
}

export interface NotificationDestinationStatus {
  channel: 'email' | 'slack' | 'teams' | string
  configured: boolean
  enabled: boolean
  last_delivery_at?: string | null
  last_success_at?: string | null
  last_error_at?: string | null
}

export interface NotificationDestinationsResponse {
  organization_id: number
  destinations: NotificationDestinationStatus[]
}

export interface NotificationDestinationTestResponse {
  channel: string
  success: boolean
  detail: string
}

export interface ExportJob {
  id: number
  organization_id: number
  customer_id: string
  name: string
  report_type: 'executive_summary' | 'executive_digest' | 'finance_workbook' | string
  export_format: 'csv' | 'xls' | 'xlsx' | 'pdf' | string
  schedule_frequency: 'daily' | 'weekly' | 'monthly' | string
  is_active: boolean
  last_run_at?: string | null
  created_at: string
  updated_at: string
}

export interface ExportJobRun {
  id: number
  export_job_id: number
  status: string
  output_filename?: string | null
  row_count: number
  error_message?: string | null
  created_at: string
  completed_at?: string | null
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
  budget_monthly_usd?: number
  rolled_up_budget_monthly_usd?: number
  budget_utilization_percent?: number | null
  rolled_up_budget_utilization_percent?: number | null
  budget_status?: string | null
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

export interface ImportPreviewIssue {
  line_number: number
  severity: 'error' | 'warning'
  message: string
}

export interface ImportPreviewResponse {
  organization_id: number
  customer_id: string
  filename: string
  total_rows: number
  accepted_rows: number
  rejected_rows: number
  total_cost_usd: number
  detected_providers: string[]
  header_columns: string[]
  mapping_feedback: Record<string, unknown>
  reconciliation_guidance: string[]
  issues: ImportPreviewIssue[]
}

export interface ReportShareTokenResponse {
  token: string
  expires_at: string
  report_type: string
  report_format: string
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
  genai_narrative?: string | null
  genai_prompt?: string
}

// ── Business Mapping & Chargeback ─────────────────────────────────────────

export type BusinessDimension = 'team' | 'environment' | 'application' | 'cost_center'

export interface BusinessMappingRule {
  id: number
  organization_id: number
  customer_id: string
  tag_key: string
  tag_value: string
  dimension: BusinessDimension | string
  mapped_value: string
  priority: number
  is_active: boolean
  created_at: string
  updated_at?: string | null
}

export interface BusinessMappingRuleListResponse {
  organization_id: number
  rules: BusinessMappingRule[]
  total: number
}

export interface ChargebackDimensionGroup {
  dimension: string
  value: string
  total_cost_usd: number
  provider_breakdown: Record<string, number>
  record_count: number
}

export interface ChargebackResponse {
  organization_id: number
  dimension_type: string
  groups: ChargebackDimensionGroup[]
  total_mapped_cost_usd: number
  total_unmapped_cost_usd: number
  total_cost_usd: number
  coverage_percent: number
}

export interface AllocationCoverageResponse {
  organization_id: number
  total_cost_usd: number
  mapped_cost_usd: number
  unmapped_cost_usd: number
  coverage_percent: number
  dimension_coverage: Record<string, number>
  provider_coverage: Record<string, number>
  unmapped_top_services: Array<{ service: string; cost_usd: number }>
}

// ── Epic 4: Reporting & Trend types ───────────────────────────────────────

export interface CostTrendPoint {
  period_start: string
  period_end: string
  provider: string
  dimension_value?: string
  total_cost_usd: number
  mapped_cost_usd: number
  unmapped_cost_usd: number
  record_count: number
  team?: string | null
  environment?: string | null
  service_breakdown: Record<string, number>
}

export interface CostTrendResponse {
  organization_id: number
  period_type: string
  lookback_periods: number
  view_by?: 'provider' | 'region' | 'service' | 'account' | string
  data_source: 'computed' | 'raw_records' | 'empty' | string
  points: CostTrendPoint[]
  provider_totals: Record<string, number>
  dimension_totals?: Record<string, number>
  grand_total_usd: number
}

export interface PeriodSummaryComputeResponse {
  organization_id: number
  period_type: string
  periods_computed: number
  rows_written: number
  computed_at: string
}

// ---------------------------------------------------------------------------
// FOCUS Export
// ---------------------------------------------------------------------------

export interface FocusExportResponse {
  focus_version: string
  generated_at: string
  record_count: number
  records: Record<string, unknown>[]
}

// ---------------------------------------------------------------------------
// Unit Economics Cockpit
// ---------------------------------------------------------------------------

export interface UnitEconomicsProviderMetric {
  provider: string
  cost_usd: number
  share_percent: number
  estimated_waste_usd: number
  efficiency_index: number
}

export interface UnitEconomicsCockpitResponse {
  generated_at: string
  cloud_provider: string
  summary: {
    total_monthly_cost_usd: number
    estimated_waste_usd: number
    identified_savings_usd: number
    waste_to_spend_percent: number
    dollar_efficiency_score: number
  }
  provider_metrics: UnitEconomicsProviderMetric[]
  historical_monthly_spend: Array<number | { month: string; cost_usd: number }>
  business_metrics_hint: string
}

export interface UnitEconomicsMetricResult {
  generated_at: string
  metric_name: string
  metric_unit: string
  metric_value: number
  total_monthly_cost_usd: number
  cost_per_unit_usd: number | null
  cost_per_unit_label: string
  benchmark_note: string
}

// ---------------------------------------------------------------------------
// Scorecards
// ---------------------------------------------------------------------------

export interface ScorecardDimension {
  name: string
  score: number
  max_score: number
  description: string
}

export interface ScorecardEntry {
  team: string
  total_score: number
  grade: string
  cost_usd: number
  share_percent: number
  dimensions: ScorecardDimension[]
  trend: string
}

export interface RealizedSavingsScorecardEntry {
  dimension: string
  key: string
  score: number
  grade: string
  recommendation_count: number
  verified_count: number
  open_count: number
  planned_monthly_savings_usd: number
  realized_monthly_savings_usd: number
  variance_monthly_usd: number
  planned_annual_savings_usd: number
  realized_annual_savings_usd: number
  variance_annual_usd: number
  realization_rate_percent: number
  last_realized_at: string | null
}

export interface RealizedSavingsScorecards {
  total_planned_monthly_savings_usd: number
  total_realized_monthly_savings_usd: number
  total_variance_monthly_usd: number
  total_planned_annual_savings_usd: number
  total_realized_annual_savings_usd: number
  total_variance_annual_usd: number
  overall_realization_rate_percent: number
  overall_score: number
  overall_grade: string
  by_provider: RealizedSavingsScorecardEntry[]
  by_owner: RealizedSavingsScorecardEntry[]
  by_business_unit: RealizedSavingsScorecardEntry[]
  by_month: RealizedSavingsScorecardEntry[]
}

export interface ScorecardsResponse {
  generated_at: string
  organization_grade: string
  organization_score: number
  teams: ScorecardEntry[]
  realized_savings: RealizedSavingsScorecards
}

// ---------------------------------------------------------------------------
// Resource Inventory
// ---------------------------------------------------------------------------

export interface ResourceInventoryItem {
  resource_id: string
  resource_name: string
  resource_type: string
  provider: string
  region: string
  account_id: string
  cost_usd: number
  waste_flag: boolean
  waste_reason: string | null
  tags: Record<string, string>
  data_source?: string
  console_url?: string | null
}

export interface ResourceInventoryResponse {
  generated_at: string
  total_resources: number
  total_cost_usd: number
  flagged_waste_count: number
  items: ResourceInventoryItem[]
  data_source?: string
  coverage_note?: string
}

// ---------------------------------------------------------------------------
// Kubernetes Cost Allocation
// ---------------------------------------------------------------------------

export interface KubernetesNamespaceCost {
  namespace: string
  estimated_cost_usd: number
  share_percent: number
  cpu_share_percent: number
  memory_share_percent: number
}

export interface KubernetesWorkloadCost {
  namespace: string
  workload_name: string
  team: string
  node_pool: string
  estimated_cost_usd: number
  share_percent: number
  cpu_request_cores: number
  cpu_usage_cores: number
  memory_request_gib: number
  memory_usage_gib: number
  request_efficiency_percent: number
}

export interface KubernetesTeamCost {
  team: string
  estimated_cost_usd: number
  share_percent: number
  namespaces: string[]
  workload_count: number
}

export interface KubernetesNodePoolCost {
  node_pool: string
  node_count: number
  estimated_cost_usd: number
  utilization_percent: number
  idle_cost_usd: number
}

export interface KubernetesOptimizationRecommendation {
  recommendation_id: string
  category: 'workload' | 'node_pool' | 'request_limit' | string
  target: string
  severity: 'low' | 'medium' | 'high' | string
  estimated_monthly_savings_usd: number
  rationale: string
  action: string
}

export interface KubernetesClusterCostResponse {
  generated_at: string
  cluster_name: string
  provider: string
  region: string
  node_count: number
  node_type: string
  total_cluster_cost_usd: number
  cost_per_node_usd: number
  namespace_breakdown: KubernetesNamespaceCost[]
  workload_breakdown: KubernetesWorkloadCost[]
  team_breakdown: KubernetesTeamCost[]
  node_pool_breakdown: KubernetesNodePoolCost[]
  recommendations: KubernetesOptimizationRecommendation[]
  efficiency_note: string
  opencost_integration: string
}

export interface KubernetesContainerServiceCost {
  provider: string
  service: string
  category: 'managed_kubernetes' | 'container_runtime' | 'container_registry' | 'docker' | 'container_platform' | string
  monthly_cost_usd: number
  share_percent: number
  source: string
  evidence: string
  account_count: number
  region_count: number
  regions: string[]
  resource_id?: string | null
  resource_name?: string | null
  lifecycle_state?: string | null
  resource_shape?: string | null
  resource_version?: string | null
  created_at?: string | null
  availability_domain?: string | null
  public_endpoint?: string | null
  private_endpoint?: string | null
  public_ip?: string | null
  ocpus?: number | null
  memory_gib?: number | null
  container_count?: number | null
  container_images: string[]
  console_url?: string | null
}

export interface KubernetesProviderServiceRollup {
  provider: string
  configured: boolean
  source: string
  total_monthly_cost_usd: number
  share_percent: number
  service_count: number
  services: KubernetesContainerServiceCost[]
}

export interface KubernetesSummaryResponse {
  generated_at: string
  kubernetes_enabled: boolean
  clusters_configured: number
  estimated_k8s_share_percent: number
  estimated_k8s_cost_usd: number
  total_cloud_cost_usd: number
  container_service_count: number
  provider_count_with_container_spend: number
  highest_cost_provider?: string | null
  highest_cost_service?: KubernetesContainerServiceCost | null
  container_services: KubernetesContainerServiceCost[]
  provider_breakdown: KubernetesProviderServiceRollup[]
  data_source: string
  setup_hint: string
  opencost_docs: string
}

export interface KubernetesProviderNodeType {
  value: string
  monthly_cost_usd: number
  vcpu?: number | null
  memory_gib?: number | null
  source: string
}

export interface KubernetesProviderCatalogEntry {
  provider: string
  source: string
  configured: boolean
  regions: string[]
  node_types: KubernetesProviderNodeType[]
  message: string
}

export interface KubernetesProviderCatalogResponse {
  generated_at: string
  providers: Record<string, KubernetesProviderCatalogEntry>
}

export interface OpenCostNamespaceCost {
  namespace: string
  cost_usd: number
  share_percent: number
}

export interface OpenCostPodCost {
  namespace: string
  pod_name: string
  cost_usd: number
  share_percent: number
}

export interface OpenCostSyncResponse {
  generated_at: string
  cluster_name: string
  source: string
  window_days: number
  total_cost_usd: number
  namespace_count: number
  namespaces: OpenCostNamespaceCost[]
  pods?: OpenCostPodCost[]
}

export interface OpenCostInstallResponse {
  generated_at: string
  status: 'installed' | 'already_installed' | 'failed'
  message: string
  api_url?: string | null
  namespace: string
  prometheus_namespace: string
  command_log: string[]
}

export interface WhiteLabelConfigResponse {
  brand_name: string
  logo_url?: string | null
  primary_color: string
  show_powered_by: boolean
}

export interface PartnerCustomerPortfolioItem {
  organization_id: number
  customer_id: string
  customer_name: string
  plan: string
  role: string
  total_cost_usd: number
  savings_identified_usd: number
  providers: string[]
  account_count: number
  scan_count: number
  open_alert_count: number
  last_activity_at?: string | null
  health_status: 'healthy' | 'attention' | 'no_data' | string
}

export interface PartnerCustomerPortfolioResponse {
  generated_at: string
  partner_mode_enabled: boolean
  white_label: WhiteLabelConfigResponse
  customer_count: number
  total_cost_usd: number
  savings_identified_usd: number
  open_alert_count: number
  customers: PartnerCustomerPortfolioItem[]
}

// ---------------------------------------------------------------------------
// Advanced FinOps (competitive feature set)
// ---------------------------------------------------------------------------

export interface TagDimensionScore {
  dimension: string
  completeness_percent: number
  covered_cost_usd: number
  uncovered_cost_usd: number
  missing_records: number
}

export interface TagQualityScoreResponse {
  generated_at: string
  organization_id: number
  provider_filter: string
  data_source: string
  total_records: number
  total_cost_usd: number
  completeness_score: number
  quality_grade: string
  dimensions: TagDimensionScore[]
  recommendations: string[]
}

export interface DecisionRecommendationItem {
  recommendation_id: string
  provider: string
  category: string
  title: string
  estimated_monthly_savings_usd: number
  payback_months: number
  confidence_score: number
  urgency_score: number
  decision_score: number
  rationale: string
}

export interface DecisionRecommendationResponse {
  generated_at: string
  organization_id: number
  provider_filter: string
  model: string
  total_candidates: number
  top_recommendations: DecisionRecommendationItem[]
  model_features: string[]
}

export interface FederatedAccountCostItem {
  provider: string
  account_identifier: string
  account_name: string
  account_type: string
  parent_account_identifier?: string | null
  source: string
  direct_cost_usd: number
  rolled_up_cost_usd: number
  depth: number
  child_count: number
  regions: Record<string, number>
}

export interface FederationCostResponse {
  generated_at: string
  organization_id: number
  customer_id: string
  provider_filter: string
  total_accounts: number
  total_cost_usd: number
  provider_totals_usd: Record<string, number>
  account_type_totals_usd: Record<string, number>
  source_totals_usd: Record<string, number>
  accounts: FederatedAccountCostItem[]
}

export interface RemediationCandidateInput {
  action_id: string
  provider: string
  resource_id: string
  action_type: 'downsize' | 'terminate' | 'reserve' | 'modernize'
  estimated_monthly_impact_usd: number
  risk_level?: 'low' | 'medium' | 'high'
  confidence?: 'high' | 'medium' | 'low'
  metadata?: Record<string, unknown>
}

export interface RemediationLoopRequestPayload {
  dry_run?: boolean
  max_actions_per_run?: number
  max_total_impact_usd?: number
  require_approval_above_usd?: number
  allowed_providers?: string[]
  allowed_actions?: string[]
  candidates?: RemediationCandidateInput[]
}

export interface RemediationDecision {
  action_id: string
  provider: string
  resource_id: string
  action_type: string
  estimated_monthly_impact_usd: number
  status: 'planned' | 'executed' | 'requires_approval' | 'skipped'
  reason: string
}

export interface RemediationLoopResponse {
  generated_at: string
  dry_run: boolean
  guardrails: Record<string, unknown>
  executed_count: number
  planned_count: number
  requires_approval_count: number
  skipped_count: number
  total_planned_impact_usd: number
  decisions: RemediationDecision[]
}

// ---------------------------------------------------------------------------
// Virtual Tagging
// ---------------------------------------------------------------------------

export interface VirtualTagRuleOut {
  id: number
  tag_key: string
  tag_value: string
  match_provider: string | null
  match_service: string | null
  match_region: string | null
  match_account_id: string | null
  match_resource_type: string | null
  match_resource_name_contains: string | null
  match_team: string | null
  match_environment: string | null
  priority: number
  is_active: boolean
  description: string | null
  created_at: string
  updated_at: string | null
}

export interface VirtualTagRuleCreate {
  tag_key: string
  tag_value: string
  match_provider?: string
  match_service?: string
  match_region?: string
  match_account_id?: string
  match_resource_type?: string
  match_resource_name_contains?: string
  match_team?: string
  match_environment?: string
  priority?: number
  is_active?: boolean
  description?: string
}

export interface VirtualTagRulesResponse {
  organization_id: number
  total: number
  rules: VirtualTagRuleOut[]
}

export interface VirtualTagPreviewItem {
  resource_id: string
  resource_name: string
  resource_type: string
  provider: string
  region: string
  cost_usd: number
  applied_tags: Record<string, string>
  match_rule_ids: number[]
}

export interface VirtualTagPreviewResponse {
  organization_id: number
  generated_at: string
  total_resources: number
  tagged_resources: number
  coverage_percent: number
  preview: VirtualTagPreviewItem[]
}

// ---------------------------------------------------------------------------
// Rightsizing
// ---------------------------------------------------------------------------

export interface RightsizingRecommendation {
  resource_id: string
  resource_name: string
  resource_type: string
  provider: string
  region: string
  account_id: string
  current_size: string
  recommended_size: string
  current_monthly_cost_usd: number
  projected_monthly_cost_usd: number
  monthly_savings_usd: number
  annual_savings_usd: number
  cpu_utilization_avg_percent: number | null
  memory_utilization_avg_percent: number | null
  reason: string
  confidence: 'high' | 'medium' | 'low'
  effort: 'low' | 'medium' | 'high'
  action: 'downsize' | 'terminate' | 'reserve' | 'modernize'
  evidence_source: string
  analysis_points: number
  trend_slope_usd: number
  trend_percent: number
  latest_monthly_cost_usd: number | null
  peak_monthly_cost_usd: number | null
  top_regions: string[]
  regional_breakdown: Array<{
    region: string
    monthly_cost_usd: number
    share_percent: number
  }>
  resource_console_url: string | null
  last_observed_at: string | null
  risk_note: string | null
  provider_recommendation_type?: string | null
  provider_recommendation_name?: string | null
  provider_recommendation_category?: string | null
  provider_recommendation_status?: string | null
  provider_recommendation_importance?: string | null
  provider_recommendation_resource_count?: number | null
}

export interface RightsizingResponse {
  generated_at: string
  organization_id: number
  data_source: string
  total_resources_analyzed: number
  rightsizable_count: number
  total_monthly_savings_usd: number
  total_annual_savings_usd: number
  recommendations: RightsizingRecommendation[]
}

// ---------------------------------------------------------------------------
// Tagging Coverage Analytics
// ---------------------------------------------------------------------------

export interface TagCoverageDetail {
  tag: string
  coverage_percent: number
  compliant: boolean
  priority: 'critical' | 'recommended' | string
  allocation_impact: 'high' | 'medium' | 'low' | string
}

export interface TaggingCoverageResponse {
  generated_at: string
  coverage_percent: number
  benchmark_percent: number
  coverage_gap_percent: number
  grade: string
  allocation_readiness_score: number
  untagged_spend_monthly_usd: number
  untagged_spend_annual_usd: number
  resource_count: number
  untagged_resource_count: number
  critical_tag_gaps: string[]
  tag_analysis: TagCoverageDetail[]
  enforcement_recommendations: string[]
  genai_narrative: string | null
  genai_prompt: string
  cost_context: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Sustainability Metrics
// ---------------------------------------------------------------------------

export interface ProviderFootprint {
  provider: string
  monthly_cost_usd: number
  kg_co2e_monthly: number
  tonnes_co2e_annual: number
  carbon_intensity_kg_per_usd: number
}

export interface SustainabilityReductionOpportunity {
  rightsizing_co2e_kg_monthly: number
  incremental_renewable_co2e_kg_monthly: number
  total_reduction_potential_kg_monthly: number
  total_reduction_potential_percent: number
}

export interface SustainabilityResponse {
  generated_at: string
  total_kg_co2e_monthly: number
  total_tonnes_co2e_annual: number
  current_renewable_energy_percent: number
  sustainability_score: number
  sustainability_grade: string
  provider_emissions: ProviderFootprint[]
  reduction_opportunities: SustainabilityReductionOpportunity[]
  recommendations: string[]
  genai_narrative: string | null
  genai_prompt: string
  cost_context: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Cross-Provider Comparison
// ---------------------------------------------------------------------------

export interface ProviderHealthScore {
  provider: string
  health_score: number
  monthly_cost_usd: number
  share_percent: number
  estimated_waste_usd: number
  waste_rate_percent: number
  commitment_coverage_percent: number
  volatility_score: number
  growth_rate_percent: number
  commitment_opportunity_usd: number
  health_grade: string
}

export interface ArbitrageOpportunity {
  from_provider: string
  to_provider: string
  moveable_spend_usd: number
  estimated_annual_savings_usd: number
  rationale: string
}

export interface CrossProviderComparisonResponse {
  generated_at: string
  total_monthly_spend_usd: number
  provider_count: number
  concentration_risk: string
  concentration_hhi: number
  providers: ProviderHealthScore[]
  best_performing_provider: string | null
  lowest_health_provider: string | null
  arbitrage_opportunities: ArbitrageOpportunity[]
  genai_narrative: string | null
  genai_prompt: string
  cost_context: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Anomaly Intelligence
// ---------------------------------------------------------------------------

export interface AnomalyIntelligenceItem {
  rank: number
  service: string
  provider: string
  z_score: number
  change_usd: number
  baseline_monthly_usd: number
  impact_percent: number
  anomaly_score: number
  severity: string
  root_cause: {
    hypothesis: string
    investigation_action: string
  }
  escalation: string
  financial_context: {
    change_as_percent_of_monthly: number
    annualized_if_persistent_usd: number
  }
}

export interface AnomalyIntelligenceResponse {
  generated_at: string
  anomaly_count: number
  total_financial_impact_usd: number
  critical_count: number
  high_count: number
  unresolved_critical_annual_risk_usd: number
  anomalies: AnomalyIntelligenceItem[]
  triage_summary: {
    immediate_action: string[]
    watch_list: string[]
  }
  genai_narrative: string | null
  genai_prompt: string
  cost_context: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Chargeback Summary
// ---------------------------------------------------------------------------

export interface TeamAllocation {
  team: string
  provider: string
  allocated_spend_usd: number
  share_percent: number
  monthly_budget_usd: number
  budget_utilization_percent: number | null
  tags: Record<string, string>
}

export interface ChargebackSummaryResponse {
  generated_at: string
  model: string
  total_monthly_spend_usd: number
  total_allocated_usd: number
  unallocated_usd: number
  unallocated_percent: number
  allocation_coverage_percent: number
  team_count: number
  allocations: TeamAllocation[]
  top_spenders: TeamAllocation[]
  action: string
  genai_narrative: string | null
  genai_prompt: string
  cost_context: Record<string, unknown>
}

export interface FinOpsOperatingReviewPlanItem {
  workstream: string
  owner: string
  priority: string
  objective: string
  target_monthly_savings_usd: number
}

export interface FinOpsOperatingReviewRiskItem {
  risk: string
  severity: string
  metric: string
  value: number
  owner: string
}

export interface FinOpsOperatingReviewResponse {
  generated_at: string
  summary: {
    current_monthly_spend_usd: number
    budget_monthly_usd: number
    budget_utilization_percent: number | null
    risk_score: number
    efficiency_score: number
    estimated_waste_usd: number
    spend_at_risk_usd: number
    cost_velocity_pct_mom: number | null
    commitment_opportunity_annual_usd: number
    average_budget_breach_probability: number
    coverage_gap_percent: number
    unallocated_percent: number
  }
  provider_mix: Array<{
    provider: string
    monthly_spend_usd: number
    share_percent: number
  }>
  top_actions: Array<{
    id?: string
    service?: string
    title?: string
    description?: string
    savings_monthly_usd?: number
    roi_percent?: number
    payback_months?: number
  }>
  risk_register: FinOpsOperatingReviewRiskItem[]
  execution_plan: FinOpsOperatingReviewPlanItem[]
  deterministic_inputs: Record<string, unknown>
  genai_context: Record<string, unknown>
  genai_narrative: string | null
  genai_prompt: string
  cost_context: Record<string, unknown>
}

export interface DecisionIntelligenceFrontierItem {
  scenario: string
  description: string
  timeline_days: number
  expected_annual_savings_usd: number
  execution_risk_score: number
  confidence: number
  downside_incremental_risk_usd: number
  utility_score: number
  estimated_payback_months: number | null
}

export interface DecisionIntelligenceResponse {
  generated_at: string
  forecast_months: number
  baseline_annualized_spend_usd: number
  expected_monthly_savings_pool_usd: number
  frontier: DecisionIntelligenceFrontierItem[]
  recommended_scenario: string | null
  recommended_sequence: Array<{
    phase: string
    focus: string
    actions: string[]
  }>
  decision_guardrails: Record<string, number>
  supporting_blocks: Record<string, unknown>
  genai_context: Record<string, unknown>
  genai_narrative: string | null
  genai_prompt: string
  rag: Record<string, unknown>
  cost_context: Record<string, unknown>
}

export interface FinOpsControlTowerLane {
  lane: string
  label: string
  status: 'healthy' | 'watch' | 'attention' | string
  primary_metric: number
  primary_metric_label: string
  evidence: unknown
  next_action: string
}

export interface FinOpsControlTowerResponse {
  generated_at: string
  forecast_months: number
  posture: string
  control_score: number
  executive_summary: {
    monthly_spend_usd: number
    annualized_run_rate_usd: number
    risk_score: number
    maturity_score: number
    forecast_confidence_score: number
    recommended_scenario?: string | null
    expected_monthly_savings_pool_usd?: number
  }
  control_lanes: FinOpsControlTowerLane[]
  priority_actions: string[]
  supporting_blocks: Record<string, unknown>
  genai_context: Record<string, unknown>
  rag: Record<string, unknown>
  rag_by_lane: Record<string, Record<string, unknown>>
  genai_narrative: string | null
  genai_prompt: string
  cost_context: Record<string, unknown>
}
