'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts'
import { Cloud, TrendingUp, TrendingDown, Share2, Download, AlertCircle, CheckCircle2, Zap } from 'lucide-react'

interface Service {
  name: string
  cost: number
  trend: number // percentage change
  lastMonth?: number
}

interface CostData {
  cloud: string
  cost: number
  lastMonth: number
  services: Service[]
  savingsPotential: number
}

interface CompetitorComparison {
  feature: string
  optiora: string
  kubecost: string
  vantage: string
  cloudhealth: string
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

const competitorData: CompetitorComparison[] = [
  {
    feature: 'Multi-Cloud Support',
    optiora: '✅ True Equal (AWS, Azure, GCP, OCI)',
    kubecost: '❌ Kubernetes only',
    vantage: '⚠️ Limited, API only',
    cloudhealth: '❌ VMware-biased'
  },
  {
    feature: 'AI-Powered Insights',
    optiora: '✅ Claude AI Real-time',
    kubecost: '❌ Rule-based only',
    vantage: '❌ Basic heuristics',
    cloudhealth: '❌ No AI features'
  },
  {
    feature: 'Chat Interface',
    optiora: '✅ Cost Advisor ChatBot',
    kubecost: '❌ No chat',
    vantage: '❌ No chat',
    cloudhealth: '❌ No chat'
  },
  {
    feature: 'Predictive Analytics',
    optiora: '✅ 12-month scenarios',
    kubecost: '❌ No forecasting',
    vantage: '⚠️ Basic only',
    cloudhealth: '⚠️ Limited'
  },
  {
    feature: 'Deployment',
    optiora: '✅ Self-hosted (OCI)',
    kubecost: '❌ Kubernetes only',
    vantage: '❌ SaaS only',
    cloudhealth: '❌ SaaS only'
  },
  {
    feature: 'Cost',
    optiora: '✅ Open model',
    kubecost: '⚠️ Free +Premium',
    vantage: '❌ $$$$$',
    cloudhealth: '❌ $$$$$$'
  }
]

export default function CostsPage() {
  const [costs, setCosts] = useState<CostData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCloud, setSelectedCloud] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState('month')

  useEffect(() => {
    // Mock data for cloud costs with trends
    setLoading(false)
    setCosts([
      {
        cloud: 'AWS',
        cost: 5200,
        lastMonth: 4800,
        savingsPotential: 1200,
        services: [
          { name: 'EC2', cost: 2100, trend: 5, lastMonth: 2000 },
          { name: 'S3', cost: 800, trend: -3, lastMonth: 825 },
          { name: 'RDS', cost: 1500, trend: 8, lastMonth: 1390 },
          { name: 'Lambda', cost: 800, trend: 2, lastMonth: 785 },
        ],
      },
      {
        cloud: 'Azure',
        cost: 3400,
        lastMonth: 3200,
        savingsPotential: 680,
        services: [
          { name: 'Virtual Machines', cost: 1800, trend: -2, lastMonth: 1835 },
          { name: 'App Service', cost: 900, trend: 4, lastMonth: 865 },
          { name: 'Storage', cost: 500, trend: 1, lastMonth: 495 },
          { name: 'SQL Database', cost: 200, trend: 0, lastMonth: 200 },
        ],
      },
      {
        cloud: 'GCP',
        cost: 2350,
        lastMonth: 2100,
        savingsPotential: 470,
        services: [
          { name: 'Compute Engine', cost: 1200, trend: 12, lastMonth: 1070 },
          { name: 'BigQuery', cost: 650, trend: 5, lastMonth: 620 },
          { name: 'Cloud Storage', cost: 350, trend: -1, lastMonth: 354 },
          { name: 'Cloud SQL', cost: 150, trend: 3, lastMonth: 145 },
        ],
      },
      {
        cloud: 'OCI',
        cost: 1500,
        lastMonth: 1400,
        savingsPotential: 300,
        services: [
          { name: 'Compute', cost: 800, trend: 7, lastMonth: 747 },
          { name: 'Storage', cost: 400, trend: 2, lastMonth: 392 },
          { name: 'Database', cost: 300, trend: 0, lastMonth: 300 },
        ],
      },
    ])
  }, [])

  const totalCost = costs.reduce((sum, c) => sum + c.cost, 0)
  const totalLastMonth = costs.reduce((sum, c) => sum + c.lastMonth, 0)
  const totalTrend = ((totalCost - totalLastMonth) / totalLastMonth * 100).toFixed(1)
  const totalSavingsPotential = costs.reduce((sum, c) => sum + c.savingsPotential, 0)

  const chartData = costs.map(c => ({
    name: c.cloud,
    cost: c.cost,
    lastMonth: c.lastMonth
  }))

  const pieData = costs.map(c => ({
    name: c.cloud,
    value: c.cost
  }))

  const allServices = costs.flatMap(cloud =>
    cloud.services.map(service => ({
      service: `${service.name} (${cloud.cloud})`,
      cost: service.cost,
      trend: service.trend,
      cloud: cloud.cloud
    }))
  ).sort((a, b) => b.cost - a.cost)

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading costs breakdown...</div>
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
          Cost Breakdown & Analysis
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Advanced multi-cloud cost analysis with AI-powered insights
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800 p-6 rounded-lg border border-blue-200 dark:border-blue-700">
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">Total Monthly Spend</p>
          <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">${totalCost.toLocaleString()}</p>
          <p className={`text-sm mt-2 flex items-center gap-1 ${totalTrend > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {totalTrend > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {Math.abs(parseFloat(totalTrend))}% vs last month
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900 dark:to-green-800 p-6 rounded-lg border border-green-200 dark:border-green-700">
          <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">Savings Potential</p>
          <p className="text-3xl font-bold text-green-900 dark:text-green-100">${totalSavingsPotential.toLocaleString()}</p>
          <p className="text-sm mt-2 text-green-700 dark:text-green-300">{(totalSavingsPotential / totalCost * 100).toFixed(1)}% of total spend</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900 dark:to-purple-800 p-6 rounded-lg border border-purple-200 dark:border-purple-700">
          <p className="text-sm font-medium text-purple-600 dark:text-purple-400 mb-2">Cloud Providers</p>
          <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">{costs.length}</p>
          <p className="text-sm mt-2 text-purple-700 dark:text-purple-300">Equal multi-cloud support</p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900 dark:to-amber-800 p-6 rounded-lg border border-amber-200 dark:border-amber-700">
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">Services Monitored</p>
          <p className="text-3xl font-bold text-amber-900 dark:text-amber-100">{allServices.length}</p>
          <p className="text-sm mt-2 text-amber-700 dark:text-amber-300">With trend analysis</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <div className="card">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-600" />
            Provider Spend Comparison
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
              <Legend />
              <Bar dataKey="cost" fill="#3B82F6" name="This Month" />
              <Bar dataKey="lastMonth" fill="#93C5FD" name="Last Month" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart */}
        <div className="card">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Cloud className="w-5 h-5 text-purple-600" />
            Provider Distribution
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Services Table */}
      <div className="card">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-orange-600" />
          Top Services by Cost
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-3 px-4 font-semibold text-slate-900 dark:text-white">Service</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-900 dark:text-white">Cost</th>
                <th className="text-center py-3 px-4 font-semibold text-slate-900 dark:text-white">Trend</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-900 dark:text-white">% of Total</th>
                <th className="text-center py-3 px-4 font-semibold text-slate-900 dark:text-white">Action</th>
              </tr>
            </thead>
            <tbody>
              {allServices.slice(0, 10).map((service, idx) => (
                <tr key={idx} className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="py-3 px-4 text-slate-900 dark:text-white font-medium">{service.service}</td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-white">${service.cost.toLocaleString()}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium ${
                      service.trend > 0 ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200' : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200'
                    }`}>
                      {service.trend > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {service.trend > 0 ? '+' : ''}{service.trend}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-400">{(service.cost / totalCost * 100).toFixed(1)}%</td>
                  <td className="py-3 px-4 text-center">
                    <button className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-sm">
                      Optimize
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cloud Provider Breakdown */}
      <div className="space-y-6">
        {costs.map((cloud) => (
          <div key={cloud.cloud} className="card">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  cloud.cloud === 'AWS' ? 'bg-orange-100 dark:bg-orange-900' :
                  cloud.cloud === 'Azure' ? 'bg-blue-100 dark:bg-blue-900' :
                  cloud.cloud === 'GCP' ? 'bg-red-100 dark:bg-red-900' :
                  'bg-purple-100 dark:bg-purple-900'
                }`}>
                  <Cloud className={`w-6 h-6 ${
                    cloud.cloud === 'AWS' ? 'text-orange-600' :
                    cloud.cloud === 'Azure' ? 'text-blue-600' :
                    cloud.cloud === 'GCP' ? 'text-red-600' :
                    'text-purple-600'
                  }`} />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold text-slate-900 dark:text-white">{cloud.cloud}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {cloud.services.length} services monitored
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-900 dark:text-white">
                  ${cloud.cost.toLocaleString()}
                </p>
                <p className={`text-sm font-medium mt-1 flex items-center justify-end gap-1 ${
                  cloud.cost > cloud.lastMonth ? 'text-red-600' : 'text-green-600'
                }`}>
                  {cloud.cost > cloud.lastMonth ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {cloud.cost > cloud.lastMonth ? '+' : ''}{((cloud.cost - cloud.lastMonth) / cloud.lastMonth * 100).toFixed(1)}%
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              {cloud.services.map((service) => (
                <div key={service.name} className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">{service.name}</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">${service.cost.toLocaleString()}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
              <span className="inline-block px-3 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-sm rounded-full">
                💰 ${cloud.savingsPotential.toLocaleString()} savings potential
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Competitor Comparison */}
      <div className="card bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
          <CheckCircle2 className="w-6 h-6 text-green-600" />
          Why OptiOra Beats Competitors
        </h2>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-300 dark:border-slate-600">
                <th className="text-left py-4 px-4 font-semibold text-slate-900 dark:text-white">Feature</th>
                <th className="text-left py-4 px-4 font-semibold text-green-600 dark:text-green-400">OptiOra</th>
                <th className="text-left py-4 px-4 font-semibold text-slate-600 dark:text-slate-400">Kubecost</th>
                <th className="text-left py-4 px-4 font-semibold text-slate-600 dark:text-slate-400">Vantage</th>
                <th className="text-left py-4 px-4 font-semibold text-slate-600 dark:text-slate-400">CloudHealth</th>
              </tr>
            </thead>
            <tbody>
              {competitorData.map((row, idx) => (
                <tr key={idx} className="border-b border-slate-200 dark:border-slate-700">
                  <td className="py-4 px-4 font-medium text-slate-900 dark:text-white">{row.feature}</td>
                  <td className="py-4 px-4 text-slate-900 dark:text-white">{row.optiora}</td>
                  <td className="py-4 px-4 text-slate-600 dark:text-slate-400">{row.kubecost}</td>
                  <td className="py-4 px-4 text-slate-600 dark:text-slate-400">{row.vantage}</td>
                  <td className="py-4 px-4 text-slate-600 dark:text-slate-400">{row.cloudhealth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 p-4 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg">
          <p className="text-green-900 dark:text-green-100 font-medium">
            ✨ OptiOra combines the best of all worlds: true multi-cloud support, AI-powered intelligence, chat interface for easy access, predictive forecasting, self-hosted deployment options, and transparent pricing. We're not just better—we're fundamentally different.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <button className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition">
          <Download className="w-5 h-5" />
          Export Report
        </button>
        <button className="flex items-center gap-2 px-6 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded-lg font-medium transition">
          <Share2 className="w-5 h-5" />
          Share Analysis
        </button>
        <button className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition">
          <Zap className="w-5 h-5" />
          Get AI Insights
        </button>
      </div>
    </div>
  )
}
