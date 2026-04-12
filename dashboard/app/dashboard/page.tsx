'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CostChart } from '@/components/CostChart'
import { ServiceBreakdown } from '@/components/ServiceBreakdown'
import { MetricCard } from '@/components/MetricCard'
import { fetchCosts } from '@/lib/api'
import { DollarSign, TrendingUp, AlertCircle, Target, AlertTriangle, CheckCircle2, Download, Eye } from 'lucide-react'

interface CostData {
  totalCost: number
  trend: number
  anomalies: number
  potentialSavings: number
}

interface BudgetAlert {
  cloud: string
  current: number
  budget: number
  percentage: number
  status: 'warning' | 'critical' | 'ok'
  icon: string
}

function downloadCSV() {
  const csvContent = `Cloud,Current Cost,Budget,Percentage,Status
AWS,5200,6000,86.7,OK
Azure,3850,3500,110,CRITICAL
GCP,2100,2500,84,OK
OCI,1300,1500,86.7,OK

Cost Summary
Total Monthly Cost,12450.50
Month-over-Month Change,+8.2%
Active Anomalies,3
Potential Savings,2340.00

Generated: ${new Date().toISOString()}`

  const element = document.createElement('a')
  element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent))
  element.setAttribute('download', `cost-report-${new Date().toISOString().split('T')[0]}.csv`)
  element.style.display = 'none'
  document.body.appendChild(element)
  element.click()
  document.body.removeChild(element)
}

export default function DashboardPage() {
  const [costs, setCosts] = useState<CostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [budgets, setBudgets] = useState<BudgetAlert[]>([])

  useEffect(() => {
    const loadCosts = async () => {
      try {
        const data = await fetchCosts()
        setCosts(data)
      } catch (error) {
        console.error('Failed to load costs:', error)
        // Use mock data as fallback
        setCosts({
          totalCost: 12450.50,
          trend: 8.2,
          anomalies: 3,
          potentialSavings: 2340.00,
        })
      } finally {
        setLoading(false)
      }
    }

    loadCosts()

    // Set budget data for each cloud
    setBudgets([
      {
        cloud: 'AWS',
        current: 5200,
        budget: 6000,
        percentage: 86.7,
        status: 'ok',
        icon: '☁️',
      },
      {
        cloud: 'Azure',
        current: 3850,
        budget: 3500,
        percentage: 110,
        status: 'critical',
        icon: '🔵',
      },
      {
        cloud: 'GCP',
        current: 2100,
        budget: 2500,
        percentage: 84,
        status: 'ok',
        icon: '🌈',
      },
      {
        cloud: 'OCI',
        current: 1300,
        budget: 1500,
        percentage: 86.7,
        status: 'ok',
        icon: '🏢',
      },
    ])
  }, [])

  if (loading) {
    return <div className="text-center py-12">Loading dashboard...</div>
  }

  if (!costs) {
    return <div className="text-center py-12 text-red-600">Failed to load cost data</div>
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
          Cost Overview
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Track and optimize your multi-cloud spending
        </p>
      </div>

      {/* Critical Alert - Azure Budget Exceeded */}
      <div className="p-4 bg-red-50 dark:bg-red-950/20 border-2 border-red-400 dark:border-red-600 rounded-lg">
        <div className="flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h3 className="font-bold text-red-900 dark:text-red-100 mb-1">
              🔵 CRITICAL: Azure Budget Exceeded by $350
            </h3>
            <p className="text-sm text-red-800 dark:text-red-200 mb-3">
              Azure spending has exceeded the monthly budget. Current: <strong>$3,850</strong> / Budget: <strong>$3,500</strong> (110% utilized)
            </p>
            <div className="flex gap-2 flex-wrap">
              <Link href="/dashboard/anomalies" className="px-3 py-1 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 inline-flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                View Anomalies
              </Link>
              <Link href="/dashboard/recommendations" className="px-3 py-1 bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100 rounded text-sm font-medium hover:bg-red-200 inline-flex items-center gap-1">
                <Target className="w-4 h-4" />
                Get Recommendations
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid md:grid-cols-4 gap-6">
        <MetricCard
          icon={DollarSign}
          label="Total Monthly Cost"
          value={`$${costs.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          color="bg-gradient-to-br from-blue-500 to-blue-600"
        />
        <MetricCard
          icon={TrendingUp}
          label="Month-over-Month"
          value={`${costs.trend > 0 ? '+' : ''}${costs.trend.toFixed(1)}%`}
          color={costs.trend > 0 ? 'bg-gradient-to-br from-orange-500 to-orange-600' : 'bg-gradient-to-br from-green-500 to-green-600'}
        />
        <MetricCard
          icon={AlertCircle}
          label="Active Anomalies"
          value={costs.anomalies.toString()}
          color="bg-gradient-to-br from-red-500 to-red-600"
        />
        <MetricCard
          icon={Target}
          label="Potential Savings"
          value={`$${costs.potentialSavings.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          color="bg-gradient-to-br from-green-500 to-green-600"
        />
      </div>

      {/* Budget Progress Bars */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Cloud Budget Status
          </h2>
          <Link href="/dashboard/settings" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            Edit Budgets
          </Link>
        </div>
        <div className="space-y-6">
          {budgets.map((budget, idx) => (
            <div key={idx}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{budget.icon}</span>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {budget.cloud}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      ${budget.current.toLocaleString()} / ${budget.budget.toLocaleString()} budget
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${
                    budget.status === 'critical'
                      ? 'text-red-600 dark:text-red-400'
                      : budget.status === 'warning'
                        ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-green-600 dark:text-green-400'
                  }`}>
                    {budget.percentage.toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    budget.status === 'critical'
                      ? 'bg-gradient-to-r from-red-500 to-red-600'
                      : budget.status === 'warning'
                        ? 'bg-gradient-to-r from-yellow-500 to-yellow-600'
                        : 'bg-gradient-to-r from-green-500 to-green-600'
                  }`}
                  style={{ width: `${Math.min(budget.percentage, 100)}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <Link href="/dashboard/forecasting" className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border border-emerald-200 dark:border-emerald-700 rounded-lg hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-900 dark:text-white">Cost Forecasting</h3>
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Explore 3 scenarios and save $45K with optimization</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">→ Compare Scenarios</p>
        </Link>

        <Link href="/dashboard/my-dashboards" className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-700 rounded-lg hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-900 dark:text-white">My Dashboards</h3>
            <Eye className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">View 6 department-specific dashboards</p>
          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">→ View All</p>
        </Link>

        <button onClick={() => downloadCSV()} className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border border-purple-200 dark:border-purple-700 rounded-lg hover:shadow-md transition-shadow text-left">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-900 dark:text-white">Export Data</h3>
            <Download className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Download cost report as CSV</p>
          <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">→ Download</p>
        </button>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-white">
            Cost Trend (Last 12 Months)
          </h2>
          <CostChart />
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-white">
            Service Breakdown
          </h2>
          <ServiceBreakdown />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-white">
          Recent Insights
        </h2>
        <div className="space-y-4">
          <div className="flex gap-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-yellow-900 dark:text-yellow-100">
                Unusual activity detected
              </p>
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                AWS compute costs increased 15% week-over-week
              </p>
            </div>
          </div>

          <div className="flex gap-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <Target className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-green-900 dark:text-green-100">
                Optimization opportunity
              </p>
              <p className="text-sm text-green-800 dark:text-green-200">
                Reserve instances could save $2,340/month on AWS
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
