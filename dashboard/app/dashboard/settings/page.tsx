'use client'

import { Cloud, Key, Trash2 } from 'lucide-react'
import { useState } from 'react'

interface CloudCredential {
  id: string
  provider: string
  status: 'connected' | 'disconnected' | 'error'
  lastSync: string
}

export default function SettingsPage() {
  const [credentials, setCredentials] = useState<CloudCredential[]>([
    { id: '1', provider: 'AWS', status: 'connected', lastSync: '5 minutes ago' },
    { id: '2', provider: 'Azure', status: 'connected', lastSync: '10 minutes ago' },
    { id: '3', provider: 'GCP', status: 'connected', lastSync: '15 minutes ago' },
    { id: '4', provider: 'OCI', status: 'disconnected', lastSync: 'Never' },
  ])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'text-green-600 dark:text-green-400'
      case 'error':
        return 'text-red-600 dark:text-red-400'
      case 'disconnected':
        return 'text-slate-600 dark:text-slate-400'
      default:
        return ''
    }
  }

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-green-100 dark:bg-green-900/30'
      case 'error':
        return 'bg-red-100 dark:bg-red-900/30'
      case 'disconnected':
        return 'bg-slate-100 dark:bg-slate-800'
      default:
        return ''
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
          Settings
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Manage cloud provider integrations and preferences
        </p>
      </div>

      {/* Cloud Integrations */}
      <div className="card">
        <h2 className="text-2xl font-semibold mb-6 text-slate-900 dark:text-white">
          Cloud Provider Credentials
        </h2>

        <div className="space-y-4">
          {credentials.map((cred) => (
            <div
              key={cred.id}
              className={`flex items-center justify-between p-4 rounded-lg border ${getStatusBg(
                cred.status
              )}`}
            >
              <div className="flex items-center gap-4">
                <Cloud className="w-8 h-8 text-blue-600" />
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    {cred.provider}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Last synced: {cred.lastSync}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(cred.status)}`}>
                  <span className="w-2 h-2 bg-current rounded-full inline-block mr-2"></span>
                  {cred.status.charAt(0).toUpperCase() + cred.status.slice(1)}
                </div>
                <button className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition">
                  <Key className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </button>
                <button className="p-2 hover:bg-red-200 dark:hover:bg-red-900/30 rounded-lg transition">
                  <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button className="mt-6 btn-primary">
          + Add Cloud Provider
        </button>
      </div>

      {/* Preferences */}
      <div className="card">
        <h2 className="text-2xl font-semibold mb-6 text-slate-900 dark:text-white">
          Preferences
        </h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Email Notifications
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Receive alerts for cost anomalies
              </p>
            </div>
            <input type="checkbox" defaultChecked className="w-5 h-5" />
          </div>

          <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Weekly Summary Report
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Get weekly cost analysis via email
              </p>
            </div>
            <input type="checkbox" defaultChecked className="w-5 h-5" />
          </div>

          <div className="flex items-center justify-between p-4">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                High-likelihood Recommendations Only
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Show only recommendations with 70%+ success rate
              </p>
            </div>
            <input type="checkbox" defaultChecked className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Account */}
      <div className="card">
        <h2 className="text-2xl font-semibold mb-6 text-slate-900 dark:text-white">
          Account
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value="user@example.com"
              disabled
              className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              API Key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value="••••••••••••••••"
                disabled
                className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-400"
              />
              <button className="btn-secondary">Regenerate</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
