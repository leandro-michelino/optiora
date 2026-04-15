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
import { AlertCircle, Download, Target, TrendingUp } from 'lucide-react'
import { fetchForecast } from '@/lib/api'
import { ForecastPoint, ForecastResponse, ForecastScenario } from '@/lib/types'

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

export default function PredictiveAnalyticsPage() {
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [selectedScenario, setSelectedScenario] = useState('balanced')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadForecast() {
      try {
        const data = await fetchForecast(12)
        setForecast(data)
        if (data.scenarios?.[2]) {
          setSelectedScenario(data.scenarios[2].name)
        }
      } catch (forecastError) {
        setError(
          forecastError instanceof Error
            ? forecastError.message
            : 'Unable to load forecast data.',
        )
      } finally {
        setLoading(false)
      }
    }

    void loadForecast()
  }, [])

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
          <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded"></div>
        </div>
      </div>
    )
  }

  if (error || !forecast) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        {error || 'Forecast data is unavailable.'}
      </div>
    )
  }

  const selectedScenarioData =
    forecast.scenarios.find((scenario) => scenario.name === selectedScenario) ||
    forecast.scenarios[0]

  const fanBands = forecast.fan_percentiles || forecast.forecast.map((row) => ({
    month: row.month,
    p10: row.p10 ?? row.lower_bound,
    p50: row.p50 ?? row.baseline,
    p90: row.p90 ?? row.upper_bound,
    budget_flag: row.budget_flag,
  }))

  const budgetGuardrails = forecast.budget_guardrails
  const selectedColor = scenarioColors[selectedScenarioData.name] || '#10b981'

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
            <TrendingUp className="w-10 h-10 text-emerald-600" />
            Predictive Cost Analytics
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            12-month forecast using provider-weighted seasonality, trend, and volatility.
          </p>
        </div>
        <button
          onClick={() => downloadScenarioCSV(selectedScenarioData, forecast.forecast)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
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
          <p className="text-sm text-slate-600 dark:text-slate-400">Scenario Savings</p>
          <p className="text-2xl font-bold text-emerald-600">
            {formatCurrency(selectedScenarioData.savings_usd)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="card bg-white dark:bg-slate-800">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
              Forecast Trajectory
            </h2>
            <ResponsiveContainer width="100%" height={400}>
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
                  <div className="grid grid-cols-3 gap-4">
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

        <div className="space-y-4">
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
                ></div>
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
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
