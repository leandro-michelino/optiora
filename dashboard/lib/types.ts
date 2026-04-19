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
    narrative_type: 'waste_insights' | 'optimization_roadmap' | 'executive_narrative'
    narrative: string | null
    prompt: string
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

export interface AlertRoutingPolicy {
  id: number
  severity: 'warning' | 'critical' | string
  channels: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface NotificationDestinationStatus {
  channel: 'email' | 'slack' | 'teams' | string
  configured: boolean
  enabled: boolean
  last_delivery_at?: string | null
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
  report_type: 'executive_summary' | string
  export_format: 'csv' | 'xls' | string
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
  data_source: 'computed' | 'raw_records' | 'empty' | string
  points: CostTrendPoint[]
  provider_totals: Record<string, number>
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
  historical_monthly_spend: Array<{ month: string; cost_usd: number }>
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

export interface ScorecardsResponse {
  generated_at: string
  organization_grade: string
  organization_score: number
  teams: ScorecardEntry[]
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
}

export interface ResourceInventoryResponse {
  generated_at: string
  total_resources: number
  total_cost_usd: number
  flagged_waste_count: number
  items: ResourceInventoryItem[]
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
  efficiency_note: string
  opencost_integration: string
}

export interface KubernetesSummaryResponse {
  generated_at: string
  kubernetes_enabled: boolean
  clusters_configured: number
  estimated_k8s_share_percent: number
  estimated_k8s_cost_usd: number
  total_cloud_cost_usd: number
  setup_hint: string
  opencost_docs: string
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


