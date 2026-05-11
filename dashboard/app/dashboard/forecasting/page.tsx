'use client'

import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertCircle, Download, Info, Target, TrendingUp } from 'lucide-react'
import {
  fetchApiHealth,
  fetchCostTrend,
  fetchForecast,
  fetchForecastModelDiagnostics,
  fetchForecastStressTest,
  fetchGenAICopilotPack,
  fetchImportedCostSummary,
  fetchOptimizationPortfolio,
  fetchProviderDiagnostics,
} from '@/lib/api'
import { DataSourceBanner } from '@/components/DataSourceBanner'
import { buildCostDataSourceStatus } from '@/lib/data-source'
import { Expander } from '@/components/ui/expander'
import {
  ApiHealth,
  CostTrendResponse,
  ForecastPoint,
  ForecastModelDiagnosticsResponse,
  ForecastResponse,
  ForecastScenario,
  ForecastStressTestResponse,
  GenAICopilotPackResponse,
  ImportedCostSummaryResponse,
  OptimizationPortfolioResponse,
  ProviderDiagnostic,
} from '@/lib/types'

const scenarioColors: Record<string, string> = {
  baseline: '#64748b',
  conservative: '#3b82f6',
  balanced: '#10b981',
  aggressive: '#ef4444',
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

function downloadScenarioCSV(scenario: ForecastScenario, forecastData: ForecastPoint[]) {
  const scenarioKey = scenario.name as keyof ForecastPoint
  const projectionRows = forecastData
    .map(
      (row) =>
        [
          row.month,
          row.baseline,
          Number(row[scenarioKey] || row.baseline),
          row.lower_bound,
          row.upper_bound,
        ].join(','),
    )
    .join('\n')
  const csvContent = `${scenario.name} Scenario - Cost Forecast Report
Generated: ${new Date().toISOString().split('T')[0]}

Scenario Details
Name,${scenario.name}
Description,${scenario.description}
Projected Total,${formatCurrency(scenario.projected_total_usd)}
Savings,${formatCurrency(scenario.savings_usd)}
Savings Percent,${scenario.savings_percent}%
Implementation Weeks,${scenario.implementation_weeks}
Risk Level,${scenario.risk_level}

Month-by-Month Projection
Month,Baseline,Scenario,Lower Bound,Upper Bound
${projectionRows}
`

  const element = document.createElement('a')
  element.setAttribute('href', `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`)
  element.setAttribute('download', `forecast-${scenario.name}-${new Date().toISOString().split('T')[0]}.csv`)
  element.style.display = 'none'
  document.body.appendChild(element)
  element.click()
  document.body.removeChild(element)
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 30_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (reason) => {
        window.clearTimeout(timer)
        reject(reason)
      },
    )
  })
}

export default function PredictiveAnalyticsPage() {
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [trend, setTrend] = useState<CostTrendResponse | null>(null)
  const [health, setHealth] = useState<ApiHealth | null>(null)
  const [importedSummary, setImportedSummary] = useState<ImportedCostSummaryResponse | null>(null)
  const [diagnostics, setDiagnostics] = useState<ProviderDiagnostic[]>([])
  const [modelDiagnostics, setModelDiagnostics] = useState<ForecastModelDiagnosticsResponse | null>(null)
  const [stressTest, setStressTest] = useState<ForecastStressTestResponse | null>(null)
  const [portfolio, setPortfolio] = useState<OptimizationPortfolioResponse | null>(null)
  const [copilotPack, setCopilotPack] = useState<GenAICopilotPackResponse | null>(null)
  const [selectedScenario, setSelectedScenario] = useState('balanced')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadForecast() {
      const [forecastResult, importedResult, healthResult, diagnosticsResult, trendResult, modelDiagnosticsResult, stressResult, portfolioResult, copilotResult] = await Promise.allSettled([
        withTimeout(fetchForecast(12), 'Forecast', 45_000),
        withTimeout(fetchImportedCostSummary(), 'Imported cost summary', 20_000),
        withTimeout(fetchApiHealth(), 'API health', 15_000),
        withTimeout(fetchProviderDiagnostics(), 'Provider diagnostics', 20_000),
        withTimeout(fetchCostTrend('monthly', 6), 'Cost trend', 20_000),
        withTimeout(fetchForecastModelDiagnostics(12), 'Forecast diagnostics', 25_000),
        withTimeout(fetchForecastStressTest({ months: 12, severity: 'medium' }), 'Forecast stress test', 25_000),
        withTimeout(fetchOptimizationPortfolio(), 'Optimization portfolio', 25_000),
        withTimeout(fetchGenAICopilotPack({ include: ['waste_insights', 'optimization_roadmap', 'executive_narrative', 'commitment_strategy', 'tagging_strategy', 'sustainability_narrative'] }), 'GenAI copilot pack', 30_000),
      ])

      if (forecastResult.status === 'fulfilled') {
        setForecast(forecastResult.value)
        if (forecastResult.value.scenarios?.[2]) {
          setSelectedScenario(forecastResult.value.scenarios[2].name)
        }
      } else {
        setError(
          forecastResult.reason instanceof Error
            ? forecastResult.reason.message
            : 'Unable to load forecast data.',
        )
      }

      setImportedSummary(importedResult.status === 'fulfilled' ? importedResult.value : null)
      setHealth(healthResult.status === 'fulfilled' ? healthResult.value : null)
      setDiagnostics(diagnosticsResult.status === 'fulfilled' ? diagnosticsResult.value : [])
      setTrend(trendResult.status === 'fulfilled' ? trendResult.value : null)
      setModelDiagnostics(modelDiagnosticsResult.status === 'fulfilled' ? modelDiagnosticsResult.value : null)
      setStressTest(stressResult.status === 'fulfilled' ? stressResult.value : null)
      setPortfolio(portfolioResult.status === 'fulfilled' ? portfolioResult.value : null)
      setCopilotPack(copilotResult.status === 'fulfilled' ? copilotResult.value : null)
      setLoading(false)
    }

    void loadForecast()
  }, [])
  const dataSourceStatus = buildCostDataSourceStatus({
    health,
    importedSummary,
    diagnostics,
    primaryLoaded: Boolean(forecast),
    pageName: 'Forecasting',
    isLoading: loading,
  })

  const selectedScenarioData = forecast
    ? forecast.scenarios.find((scenario) => scenario.name === selectedScenario) || forecast.scenarios[0]
    : null
  const fanBands = forecast
    ? forecast.fan_percentiles || forecast.forecast.map((row) => ({
      month: row.month,
      p10: row.p10 ?? row.lower_bound,
      p50: row.p50 ?? row.baseline,
      p90: row.p90 ?? row.upper_bound,
      budget_flag: row.budget_flag,
    }))
    : []
  const budgetGuardrails = forecast?.budget_guardrails || null
  const selectedColor = selectedScenarioData ? (scenarioColors[selectedScenarioData.name] || '#10b981') : '#10b981'

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
            <TrendingUp className="w-10 h-10 text-emerald-600" />
            Predictive Cost Analytics
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            12-month forecast using provider-weighted seasonality, trend, and volatility.
          </p>
        </div>
        {selectedScenarioData && forecast && (
          <button
            onClick={() => downloadScenarioCSV(selectedScenarioData, forecast.forecast)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        )}
      </div>

      <DataSourceBanner status={dataSourceStatus} />

      <Expander
        title="Forecasting Reading Guide"
        description="Open for the meaning of spend, growth, volatility, model quality, scenario savings, and budget risk."
        icon={<Info className="h-5 w-5 text-blue-600" />}
      >
        <div className="grid gap-3 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-3">
          <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
            <p className="font-semibold text-slate-900 dark:text-white">Baseline</p>
            <p className="mt-1">Current spend, growth, and volatility describe the expected run rate before any optimization scenario is applied.</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
            <p className="font-semibold text-slate-900 dark:text-white">Scenario</p>
            <p className="mt-1">Savings compares the selected scenario against the baseline forecast and keeps deterministic math as the source of truth.</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
            <p className="font-semibold text-slate-900 dark:text-white">Confidence</p>
            <p className="mt-1">History coverage, MAPE/wMAPE, fan bands, and budget guardrails show how much trust to place in the projection.</p>
          </div>
        </div>
      </Expander>

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-10 rounded bg-slate-200 dark:bg-slate-700 w-1/3"></div>
          <div className="h-64 rounded bg-slate-200 dark:bg-slate-700"></div>
        </div>
      ) : error || !forecast || !selectedScenarioData ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {error || 'Forecast data is unavailable.'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="card">
              <p className="text-sm text-slate-600 dark:text-slate-400">Current Monthly Spend</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {formatCurrency(forecast.current_monthly_spend_usd)}
              </p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-600 dark:text-slate-400">Model Growth</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {(forecast.model.monthly_growth_rate * 100).toFixed(2)}%
              </p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-600 dark:text-slate-400">Volatility</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {(forecast.model.weighted_volatility * 100).toFixed(1)}%
              </p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-600 dark:text-slate-400">Provider Concentration (HHI)</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {forecast.model.provider_concentration_hhi?.toFixed(2) ?? 'n/a'}
              </p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-600 dark:text-slate-400">Scenario Savings</p>
              <p className="text-2xl font-bold text-emerald-600">
                {formatCurrency(selectedScenarioData.savings_usd)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div className="card">
              <p className="text-sm text-slate-600 dark:text-slate-400">History Source</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white capitalize">
                {(forecast.history_source || 'no_history').replace('_', ' ')}
              </p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-600 dark:text-slate-400">History Coverage</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {forecast.history_coverage_months ?? forecast.history.length} months
              </p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-600 dark:text-slate-400">Backtest MAPE</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {typeof forecast.backtesting?.mape_percent === 'number'
                  ? `${forecast.backtesting.mape_percent.toFixed(2)}%`
                  : 'n/a'}
              </p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-600 dark:text-slate-400">Backtest wMAPE</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {typeof forecast.backtesting?.wmape_percent === 'number'
                  ? `${forecast.backtesting.wmape_percent.toFixed(2)}%`
                  : 'n/a'}
              </p>
            </div>
          </div>

          <Expander
            title="Forecast Detail And Scenario Controls"
            description="Open for historical trend, forecast fan chart, scenarios, model diagnostics, and GenAI narratives."
            icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
            defaultOpen
          >
          <div className="grid grid-cols-1 gap-6 lg:gap-8 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {/* Historical Cost Trend */}
              {trend && trend.points.length > 0 && (
                <div className="card bg-white dark:bg-slate-800">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-500" />
                    Historical Cost Trend
                    <span className="text-sm font-normal text-slate-400 ml-2">({trend.data_source})</span>
                  </h2>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={trend.points.map(p => ({
                      month: p.period_start.slice(0, 7),
                      total: p.total_cost_usd,
                      mapped: p.mapped_cost_usd,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => v != null ? formatCurrency(Number(v)) : ''} />
                      <Area type="monotone" dataKey="total" name="Total" stroke="#2563eb" fill="#2563eb" fillOpacity={0.12} />
                      <Area type="monotone" dataKey="mapped" name="Allocated" stroke="#10b981" fill="#10b981" fillOpacity={0.12} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="card bg-white dark:bg-slate-800">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
                  Forecast Trajectory
                </h2>
                <ResponsiveContainer width="100%" height={360}>
                  <AreaChart data={forecast.forecast} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" stroke="#64748b" />
                    <YAxis stroke="#64748b" tickFormatter={(value: number) => `$${(value / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value) => formatCurrency(value as number)}
                      contentStyle={{
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        border: 'none',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: '#e2e8f0' }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="upper_bound"
                      fill="#cbd5e1"
                      stroke="#cbd5e1"
                      name="Upper Bound"
                      fillOpacity={0.25}
                    />
                    <Area
                      type="monotone"
                      dataKey="lower_bound"
                      fill="#ffffff"
                      stroke="#cbd5e1"
                      name="Lower Bound"
                      fillOpacity={0.1}
                    />
                    <Line
                      type="monotone"
                      dataKey="baseline"
                      stroke="#64748b"
                      strokeWidth={2}
                      dot={false}
                      name="Baseline"
                    />
                    <Line
                      type="monotone"
                      dataKey="p10"
                      stroke="#0ea5e9"
                      strokeWidth={1.5}
                      dot={false}
                      name="p10 (fan)"
                      strokeDasharray="4 4"
                      data={fanBands}
                    />
                    <Line
                      type="monotone"
                      dataKey="p50"
                      stroke="#14b8a6"
                      strokeWidth={2}
                      dot={false}
                      name="p50 (fan)"
                      data={fanBands}
                    />
                    <Line
                      type="monotone"
                      dataKey="p90"
                      stroke="#f97316"
                      strokeWidth={1.5}
                      dot={false}
                      name="p90 (fan)"
                      strokeDasharray="4 4"
                      data={fanBands}
                    />
                    <Line
                      type="monotone"
                      dataKey={selectedScenarioData.name}
                      stroke={selectedColor}
                      strokeWidth={3}
                      dot={false}
                      name={selectedScenarioData.name}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {selectedScenarioData.name !== 'baseline' && (
                <div className="card bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-start gap-4">
                    <AlertCircle className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-emerald-900 dark:text-emerald-200 mb-2">
                        {selectedScenarioData.name} scenario
                      </h3>
                      <p className="text-sm text-emerald-800 dark:text-emerald-300 mb-4">
                        {selectedScenarioData.description}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-emerald-700 dark:text-emerald-400">Savings</p>
                          <p className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                            {formatCurrency(selectedScenarioData.savings_usd)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-emerald-700 dark:text-emerald-400">Reduction</p>
                          <p className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                            {selectedScenarioData.savings_percent.toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-emerald-700 dark:text-emerald-400">Timeline</p>
                          <p className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                            {selectedScenarioData.implementation_weeks} weeks
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4 lg:sticky lg:top-4 self-start">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white px-1">
                Optimization Scenarios
              </h2>

              {forecast.scenarios.map((scenario) => (
                <button
                  key={scenario.name}
                  onClick={() => setSelectedScenario(scenario.name)}
                  className={`w-full p-4 rounded-lg border-2 transition text-left ${
                    selectedScenario === scenario.name
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-semibold text-slate-900 dark:text-white capitalize">
                      {scenario.name}
                    </h4>
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5"
                      style={{ backgroundColor: scenarioColors[scenario.name] || '#10b981' }}
                    />
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">{scenario.description}</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Savings</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(scenario.savings_usd)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Risk</span>
                      <span className="font-semibold text-slate-900 dark:text-white capitalize">
                        {scenario.risk_level}
                      </span>
                    </div>
                  </div>
                </button>
              ))}

              <div className="card bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20">
                <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Model Notes
                </h3>
                <ol className="text-xs text-blue-800 dark:text-blue-300 space-y-2 list-decimal list-inside">
                  <li>Baseline uses trend and provider-weighted seasonality.</li>
                  <li>Fan shows deterministic p10 / p50 / p90 Monte Carlo percentiles.</li>
                  <li>Budget guardrails flag likely breaches at p90.</li>
                  <li>Balanced is the recommended executive planning view.</li>
                  <li>History prefers persisted cost snapshots when enough months exist.</li>
                  <li>Backtesting reports MAPE / wMAPE on a short holdout window.</li>
                  <li>GenAI can narrate actions; math remains deterministic.</li>
                </ol>
                {budgetGuardrails && (
                  <div className="mt-3 text-xs text-blue-800 dark:text-blue-200">
                    <p className="font-semibold">Budget guardrails</p>
                    <p>
                      Monthly budget: {formatCurrency(budgetGuardrails.budget_monthly_usd)} —
                      {budgetGuardrails.breaches > 0
                        ? ` ${budgetGuardrails.breaches} potential breach months (first: ${budgetGuardrails.first_breach_month ?? 'n/a'})`
                        : ' within bounds across forecast'}
                    </p>
                    {typeof budgetGuardrails.average_breach_probability === 'number' && (
                      <p>
                        Average breach probability: {(budgetGuardrails.average_breach_probability * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                )}
              </div>

              {modelDiagnostics && (
                <div className="card bg-white dark:bg-slate-800">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Model Diagnostics</h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-slate-50 dark:bg-slate-900 p-2">
                      <p className="text-slate-500">Champion</p>
                      <p className="font-semibold text-slate-900 dark:text-white break-words">{modelDiagnostics.champion_model.replace(/_/g, ' ')}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 dark:bg-slate-900 p-2">
                      <p className="text-slate-500">Risk</p>
                      <p className="font-semibold capitalize text-slate-900 dark:text-white">{modelDiagnostics.model_risk_level}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 dark:bg-slate-900 p-2">
                      <p className="text-slate-500">Data quality</p>
                      <p className="font-semibold text-slate-900 dark:text-white">{modelDiagnostics.data_quality_score.toFixed(1)}/100</p>
                    </div>
                    <div className="rounded-md bg-slate-50 dark:bg-slate-900 p-2">
                      <p className="text-slate-500">wMAPE</p>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {typeof modelDiagnostics.champion_wmape_percent === 'number' ? `${modelDiagnostics.champion_wmape_percent.toFixed(1)}%` : 'n/a'}
                      </p>
                    </div>
                  </div>
                  {modelDiagnostics.drift_signals.flags.length > 0 && (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      Drift: {modelDiagnostics.drift_signals.flags.join(', ').replace(/_/g, ' ')}
                    </p>
                  )}
                </div>
              )}

              {stressTest && (
                <div className="card bg-white dark:bg-slate-800">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Stress Test (Deterministic)</h3>
                  <p className="text-xs text-slate-500 mb-3">Worst-case: {stressTest.worst_case.name || 'n/a'}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-slate-50 dark:bg-slate-900 p-2">
                      <p className="text-slate-500">Incremental risk</p>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(stressTest.worst_case.incremental_risk_usd)}
                      </p>
                    </div>
                    <div className="rounded-md bg-slate-50 dark:bg-slate-900 p-2">
                      <p className="text-slate-500">Breach months</p>
                      <p className="font-semibold text-slate-900 dark:text-white">{stressTest.worst_case.breach_months}</p>
                    </div>
                  </div>
                </div>
              )}

              {portfolio && (
                <div className="card bg-white dark:bg-slate-800">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Optimization Portfolio</h3>
                  <p className="text-xs text-slate-500 mb-3">Ranked by savings, ROI, payback, and effort score.</p>
                  <div className="text-xs space-y-1">
                    <p><span className="text-slate-500">Annual opportunity:</span> <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(portfolio.total_annual_savings_usd)}</span></p>
                    <p><span className="text-slate-500">Quick wins:</span> <span className="font-semibold text-slate-900 dark:text-white">{portfolio.quick_wins.length}</span></p>
                    <p><span className="text-slate-500">Strategic bets:</span> <span className="font-semibold text-slate-900 dark:text-white">{portfolio.strategic_bets.length}</span></p>
                  </div>
                </div>
              )}

              {copilotPack?.narratives?.executive_narrative && (
                <div className="card bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
                  <h3 className="font-semibold text-indigo-900 dark:text-indigo-200 mb-2">GenAI Executive Narrative</h3>
                  <p className="text-xs text-indigo-800 dark:text-indigo-300 whitespace-pre-wrap">
                    {copilotPack.narratives.executive_narrative.narrative || copilotPack.narratives.executive_narrative.prompt}
                  </p>
                </div>
              )}

              {copilotPack?.narratives?.commitment_strategy && (
                <div className="card bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <h3 className="font-semibold text-emerald-900 dark:text-emerald-200 mb-2">GenAI Commitment Strategy</h3>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 whitespace-pre-wrap">
                    {copilotPack.narratives.commitment_strategy.narrative || copilotPack.narratives.commitment_strategy.prompt}
                  </p>
                </div>
              )}
            </div>
          </div>
          </Expander>
        </>
      )}
    </div>
  )
}
