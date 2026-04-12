'use client'

import { useEffect, useState } from 'react'
import { Cloud } from 'lucide-react'

interface CostBreakdown {
  cloud: string
  cost: number
  services: { name: string; cost: number }[]
}

export default function CostsPage() {
  const [costs, setCosts] = useState<CostBreakdown[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Mock data for cloud costs
    setLoading(false)
    setCosts([
      {
        cloud: 'AWS',
        cost: 5200,
        services: [
          { name: 'EC2', cost: 2100 },
          { name: 'S3', cost: 800 },
          { name: 'RDS', cost: 1500 },
          { name: 'Lambda', cost: 800 },
        ],
      },
      {
        cloud: 'Azure',
        cost: 3400,
        services: [
          { name: 'Virtual Machines', cost: 1800 },
          { name: 'App Service', cost: 900 },
          { name: 'Storage', cost: 500 },
          { name: 'SQL Database', cost: 200 },
        ],
      },
      {
        cloud: 'GCP',
        cost: 2350,
        services: [
          { name: 'Compute Engine', cost: 1200 },
          { name: 'BigQuery', cost: 650 },
          { name: 'Cloud Storage', cost: 350 },
          { name: 'Cloud SQL', cost: 150 },
        ],
      },
      {
        cloud: 'OCI',
        cost: 1500,
        services: [
          { name: 'Compute', cost: 800 },
          { name: 'Storage', cost: 400 },
          { name: 'Database', cost: 300 },
        ],
      },
    ])
  }, [])

  if (loading) {
    return <div>Loading costs breakdown...</div>
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
          Cost Breakdown by Cloud
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Detailed view of services and costs across all cloud providers
        </p>
      </div>

      <div className="space-y-6">
        {costs.map((cloud) => (
          <div key={cloud.cloud} className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Cloud className="w-6 h-6 text-blue-600" />
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                  {cloud.cloud}
                </h2>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-900 dark:text-white">
                  ${cloud.cost.toLocaleString()}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {((cloud.cost / costs.reduce((sum, c) => sum + c.cost, 0)) * 100).toFixed(1)}% of total
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {cloud.services.map((service) => (
                <div key={service.name} className="flex items-center justify-between py-2 px-4 bg-slate-50 dark:bg-slate-700 rounded">
                  <span className="text-slate-700 dark:text-slate-300">{service.name}</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    ${service.cost.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
