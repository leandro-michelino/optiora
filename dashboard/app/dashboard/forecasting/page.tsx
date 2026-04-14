'use client';

import React, { useState, useEffect } from 'react';
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, Target, AlertCircle, Download } from 'lucide-react';

interface ForecastData {
  month: string;
  baseline: number;
  optimized: number;
  current: number;
}

interface ScenarioData {
  name: string;
  description: string;
  annualSavings: number;
  implementation: string;
  color: string;
}

function downloadScenarioCSV(scenario: ScenarioData, forecastData: ForecastData[]) {
  const csvContent = `${scenario.name} Scenario - Cost Forecast Report
Generated: ${new Date().toISOString().split('T')[0]}

Scenario Details
Name,${scenario.name}
Description,${scenario.description}
Annual Savings,$${scenario.annualSavings.toLocaleString()}
Implementation Timeline,${scenario.implementation}

Month-by-Month Projection
Month,Baseline Spend,Optimized Spend,Current Spend
${forecastData.map((row) => `${row.month},$${row.baseline.toLocaleString()},$${row.optimized.toLocaleString()},$${row.current.toLocaleString()}`).join('\n')}

Summary
Total Baseline Annual Cost,$${forecastData.reduce((sum, row) => sum + row.baseline, 0).toLocaleString()}
Total Optimized Annual Cost,$${forecastData.reduce((sum, row) => sum + row.optimized, 0).toLocaleString()}
Total Annual Savings,$${scenario.annualSavings.toLocaleString()}
Savings Percentage,${scenario.annualSavings > 0 ? ((scenario.annualSavings / (forecastData.reduce((sum, row) => sum + row.baseline, 0) * 12)) * 100).toFixed(1) : 0}%`;

  const element = document.createElement('a');
  element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));
  element.setAttribute('download', `forecast-${scenario.name.toLowerCase().replace(/\s/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

export default function PredictiveAnalyticsPage() {
  const [forecastData, setForecastData] = useState<ForecastData[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const scenarios: ScenarioData[] = [
    {
      name: 'Do Nothing',
      description: 'Continue current spending patterns (baseline)',
      annualSavings: 0,
      implementation: 'N/A',
      color: '#94a3b8',
    },
    {
      name: 'Conservative',
      description: 'Implement easy, low-risk optimizations',
      annualSavings: 18500 * 12 * 0.25,
      implementation: '1-2 weeks',
      color: '#3b82f6',
    },
    {
      name: 'Aggressive',
      description: 'Comprehensive optimization across all areas',
      annualSavings: 18500 * 12 * 0.45,
      implementation: '4-6 weeks',
      color: '#10b981',
    },
  ];

  useEffect(() => {
    // Simulate loading forecast data
    setTimeout(() => {
      const data: ForecastData[] = [];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      let currentBaseline = 45000;
      let currentOptimized = 45000;
      let currentCost = 45000;

      months.forEach((month) => {
        currentBaseline = currentBaseline * (1 + Math.random() * 0.03 - 0.015); // ±1.5% variance
        currentCost = currentBaseline * (1 + (Math.random() * 0.05 - 0.025)); // More variance
        currentOptimized = currentBaseline * 0.6; // 40% reduction

        data.push({
          month,
          baseline: Math.round(currentBaseline),
          optimized: Math.round(currentOptimized),
          current: Math.round(currentCost),
        });
      });

      setForecastData(data);
      setLoading(false);
    }, 500);
  }, []);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
          <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  const selectedScenarioData = scenarios[selectedScenario];
  const totalAnnualSavings = selectedScenarioData.annualSavings;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
            <TrendingUp className="w-10 h-10 text-emerald-600" />
            Predictive Cost Analytics
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            AI-powered 12-month cost forecasting based on your historical patterns
          </p>
        </div>
        <button
          onClick={() => downloadScenarioCSV(scenarios[selectedScenario], forecastData)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart */}
        <div className="lg:col-span-2 space-y-6">
          {/* Chart */}
          <div className="card bg-white dark:bg-slate-800">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
              12-Month Cost Trajectory
            </h2>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart
                data={forecastData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#64748b" />
                <YAxis stroke="#64748b" tickFormatter={(value: any) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value) => `$${(value as number).toLocaleString()}`}
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    border: 'none',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend />
                {selectedScenario === 0 && (
                  <Line
                    type="monotone"
                    dataKey="current"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    name="Current Spend"
                  />
                )}
                {selectedScenario > 0 && (
                  <>
                    <Area
                      type="monotone"
                      dataKey="baseline"
                      fill="#94a3b8"
                      stroke="#94a3b8"
                      strokeWidth={1}
                      name="Baseline"
                    />
                    <Line
                      type="monotone"
                      dataKey="optimized"
                      stroke={selectedScenarioData.color}
                      strokeWidth={3}
                      dot={false}
                      name="Optimized Spend"
                    />
                  </>
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Scenario Details */}
          {selectedScenario > 0 && (
            <div className="card bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="font-semibold text-emerald-900 dark:text-emerald-200 mb-2">
                    {selectedScenarioData.name} Scenario
                  </h3>
                  <p className="text-sm text-emerald-800 dark:text-emerald-300 mb-4">
                    {selectedScenarioData.description}
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">Annual Savings</p>
                      <p className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                        £{(totalAnnualSavings / 1000).toFixed(0)}k
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">Monthly Average</p>
                      <p className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                        £{(totalAnnualSavings / 12 / 1000).toFixed(1)}k
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">Reduction vs Baseline</p>
                      <p className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                        {((selectedScenario === 1 ? 25 : 45))}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar - Scenarios */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white px-1">Optimization Scenarios</h2>

          {scenarios.map((scenario, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedScenario(idx)}
              className={`w-full p-4 rounded-lg border-2 transition text-left ${
                selectedScenario === idx
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="font-semibold text-slate-900 dark:text-white">{scenario.name}</h4>
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5"
                  style={{ backgroundColor: scenario.color }}
                ></div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">{scenario.description}</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Annual Savings</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    £{(scenario.annualSavings / 1000).toFixed(0)}k
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Timeline</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{scenario.implementation}</span>
                </div>
              </div>
            </button>
          ))}

          {/* Implementation Guide */}
          <div className="card bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20">
            <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-3 flex items-center gap-2">
              <Target className="w-4 h-4" />
              Implementation Guide
            </h3>
            <ol className="text-xs text-blue-800 dark:text-blue-300 space-y-2 list-decimal list-inside">
              <li>Review recommendations</li>
              <li>Prioritize by impact</li>
              <li>Allocate team resources</li>
              <li>Execute changes</li>
              <li>Monitor and measure</li>
            </ol>
          </div>

          {/* CTA */}
          <button className="w-full px-4 py-3 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-lg font-semibold hover:shadow-lg transition">
            View Detailed Plan
          </button>
        </div>
      </div>
    </div>
  );
}
