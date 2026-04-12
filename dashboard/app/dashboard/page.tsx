'use client'

import { useEffect, useState } from 'react'
import { CostChart } from '@/components/CostChart'
import { ServiceBreakdown } from '@/components/ServiceBreakdown'
import { MetricCard } from '@/components/MetricCard'
import { fetchCosts } from '@/lib/api'
import { DollarSign, TrendingUp, AlertCircle, Target } from 'lucide-react'

interface CostData {
  totalCost: number
  trend: number
  anomalies: number
  potentialSavings: number
}

export default function DashboardPage() {
  const [costs, setCosts] = useState<CostData | null>(null)
  const [loading, setLoading] = useState(true)

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
