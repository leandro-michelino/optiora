'use client'

import { AlertTriangle, TrendingUp } from 'lucide-react'

interface Anomaly {
  id: string
  service: string
  cloud: string
  message: string
  severity: 'high' | 'medium' | 'low'
  timestamp: string
  change: number
}

export default function AnomaliesPage() {
  const anomalies: Anomaly[] = [
    {
      id: '1',
      service: 'EC2',
      cloud: 'AWS',
      message: 'Compute costs increased 45% week-over-week',
      severity: 'high',
      timestamp: '2 hours ago',
      change: 45,
    },
    {
      id: '2',
      service: 'AppService',
      cloud: 'Azure',
      message: 'App Service billing jumped unexpectedly',
      severity: 'medium',
      timestamp: '5 hours ago',
      change: 23,
    },
    {
      id: '3',
      service: 'BigQuery',
      cloud: 'GCP',
      message: 'New BigQuery queries detected',
      severity: 'low',
      timestamp: '1 day ago',
      change: 12,
    },
    {
      id: '4',
      service: 'Compute',
      cloud: 'OCI',
      message: 'Unusual compute instance activity',
      severity: 'medium',
      timestamp: '2 days ago',
      change: 18,
    },
  ]

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      case 'medium':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
      case 'low':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
      default:
        return 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600'
    }
  }

  const getSeverityTextColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'text-red-900 dark:text-red-100'
      case 'medium':
        return 'text-yellow-900 dark:text-yellow-100'
      case 'low':
        return 'text-blue-900 dark:text-blue-100'
      default:
        return ''
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
          Cost Anomalies
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Detected unusual cost patterns and sudden spikes
        </p>
      </div>

      <div className="space-y-4">
        {anomalies.map((anomaly) => (
          <div
            key={anomaly.id}
            className={`card border-l-4 ${getSeverityColor(anomaly.severity)} ${getSeverityTextColor(
              anomaly.severity
            )}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex gap-4">
                <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-1" />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{anomaly.service}</h3>
                    <span className="text-sm px-2 py-1 bg-slate-200 dark:bg-slate-600 rounded">
                      {anomaly.cloud}
                    </span>
                  </div>
                  <p className="text-sm mt-1">{anomaly.message}</p>
                  <p className="text-xs mt-2 opacity-75">{anomaly.timestamp}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-4">
                <div className="flex items-center gap-2 justify-end">
                  <TrendingUp className="w-5 h-5" />
                  <span className="text-2xl font-bold">+{anomaly.change}%</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {anomalies.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-slate-600 dark:text-slate-400">
            No anomalies detected - your costs are stable
          </p>
        </div>
      )}
    </div>
  )
}
