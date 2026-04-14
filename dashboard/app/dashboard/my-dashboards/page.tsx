'use client'

import Link from 'next/link'
import { Grid, TrendingUp, Users, Database, Cloud, Zap, BarChart3 } from 'lucide-react'

interface Dashboard {
  id: string
  name: string
  department: string
  description: string
  icon: React.ReactNode
  color: string
  lastUpdated: string
  spending: number
  trend: number
  services: number
}

const departmentDashboards: Dashboard[] = [
  {
    id: 'engineering',
    name: 'Engineering Dashboard',
    department: 'Engineering',
    description: 'Track compute, database, and storage costs across development, staging, and production environments',
    icon: <Database className="w-6 h-6" />,
    color: 'from-blue-500 to-blue-600',
    lastUpdated: '2 hours ago',
    spending: 5200,
    trend: 12.5,
    services: 8,
  },
  {
    id: 'data',
    name: 'Data & Analytics Dashboard',
    department: 'Data Science',
    description: 'Monitor BigQuery, Redshift, and analytics services. Track ML model training costs',
    icon: <BarChart3 className="w-6 h-6" />,
    color: 'from-purple-500 to-purple-600',
    lastUpdated: '1 hour ago',
    spending: 3100,
    trend: -5.2,
    services: 5,
  },
  {
    id: 'infra',
    name: 'Infrastructure Dashboard',
    department: 'Infrastructure',
    description: 'Network, CDN, load balancers, and container orchestration. Kubernetes costs included',
    icon: <Cloud className="w-6 h-6" />,
    color: 'from-emerald-500 to-emerald-600',
    lastUpdated: '30 min ago',
    spending: 2400,
    trend: 3.1,
    services: 6,
  },
  {
    id: 'security',
    name: 'Security Dashboard',
    department: 'Security',
    description: 'Security tools, compliance scanning, encryption, and threat detection services',
    icon: <Zap className="w-6 h-6" />,
    color: 'from-red-500 to-red-600',
    lastUpdated: '4 hours ago',
    spending: 1800,
    trend: 0.8,
    services: 4,
  },
  {
    id: 'support',
    name: 'Customer Support Dashboard',
    department: 'Support Ops',
    description: 'Call centers, ticketing systems, knowledge bases, and monitoring tools for customer-facing services',
    icon: <Users className="w-6 h-6" />,
    color: 'from-orange-500 to-orange-600',
    lastUpdated: '1 hour ago',
    spending: 950,
    trend: 2.3,
    services: 3,
  },
  {
    id: 'finance',
    name: 'Finance & Admin Dashboard',
    department: 'Finance',
    description: 'Accounting software, reporting tools, and administrative services costs',
    icon: <TrendingUp className="w-6 h-6" />,
    color: 'from-indigo-500 to-indigo-600',
    lastUpdated: '5 hours ago',
    spending: 400,
    trend: -1.5,
    services: 2,
  },
]

export default function MyDashboardsPage() {
  const totalSpending = departmentDashboards.reduce((sum, d) => sum + d.spending, 0)
  const avgTrend = (departmentDashboards.reduce((sum, d) => sum + d.trend, 0) / departmentDashboards.length).toFixed(1)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
          <Grid className="w-10 h-10 text-indigo-600" />
          My Dashboards
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Department-specific cost dashboards for better visibility and accountability
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="card bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Department Spending</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            ${totalSpending.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Across 6 departments</p>
        </div>

        <div className="card bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20">
          <p className="text-sm text-blue-700 dark:text-blue-300 mb-1">Average Trend</p>
          <p className="text-3xl font-bold text-blue-900 dark:text-blue-100 mb-2">
            {parseFloat(avgTrend) > 0 ? '+' : ''}{avgTrend}%
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400">Month-over-month</p>
        </div>

        <div className="card bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/20">
          <p className="text-sm text-green-700 dark:text-green-300 mb-1">Active Services</p>
          <p className="text-3xl font-bold text-green-900 dark:text-green-100 mb-2">
            {departmentDashboards.reduce((sum, d) => sum + d.services, 0)}
          </p>
          <p className="text-xs text-green-600 dark:text-green-400">Across all departments</p>
        </div>
      </div>

      {/* Dashboards Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {departmentDashboards.map((dashboard) => (
          <Link
            key={dashboard.id}
            href={`/dashboard/department/${dashboard.id}`}
            className="card hover:shadow-lg transition-all hover:border-indigo-300 dark:hover:border-indigo-700 cursor-pointer group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`p-3 bg-gradient-to-br ${dashboard.color} rounded-lg text-white group-hover:scale-110 transition-transform`}>
                {dashboard.icon}
              </div>
              <div className={`px-2 py-1 rounded text-xs font-medium ${
                dashboard.trend > 0
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              }`}>
                {dashboard.trend > 0 ? '📈' : '📉'} {Math.abs(dashboard.trend)}%
              </div>
            </div>

            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
              {dashboard.name}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              {dashboard.department}
            </p>

            <p className="text-xs text-slate-600 dark:text-slate-500 mb-4 line-clamp-2">
              {dashboard.description}
            </p>

            <div className="grid grid-cols-3 gap-3 mb-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Monthly Spend</p>
                <p className="font-bold text-slate-900 dark:text-white">
                  ${(dashboard.spending / 1000).toFixed(1)}k
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Services</p>
                <p className="font-bold text-slate-900 dark:text-white">
                  {dashboard.services}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Last Update</p>
                <p className="font-bold text-slate-900 dark:text-white text-sm">
                  {dashboard.lastUpdated}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 text-sm font-medium group-hover:gap-1 flex items-center gap-0 transition-all">
              View Dashboard →
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="card bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 border border-indigo-200 dark:border-indigo-800">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Department Dashboard Features</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">✨ Individual Insights</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Each dashboard provides department-specific cost breakdowns, trend analysis, and optimization recommendations tailored to their services.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">📊 Real-time Data</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Updated automatically with the latest cloud provider data. Track spending changes in real-time and set custom budget alerts.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">🤝 Team Collaboration</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Share dashboards with team members, assign budget owners, and enable department leads to manage their own cloud costs.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">📈 Performance Analytics</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Compare performance across departments, identify best practices, and benchmark spending patterns against industry standards.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
