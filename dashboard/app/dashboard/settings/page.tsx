'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, Loader, AlertCircle, CheckCircle, Plus } from 'lucide-react';
import CredentialForm from '@/app/components/CredentialForm';
import ScanningApproval from '@/app/components/ScanningApproval';


interface StoredCredential {
  provider: string
  is_valid: boolean
  tested_at?: string
  last_tested?: string
}

export default function SettingsPage() {
  const [storedCredentials, setStoredCredentials] = useState<StoredCredential[]>([])
  const [loadingCredentials, setLoadingCredentials] = useState(true)
  const [scanningApprovalStep, setScanningApprovalStep] = useState(false)
  const [approvedProviders, setApprovedProviders] = useState<string[]>([])

  useEffect(() => {
    loadCredentials()
  }, [])

  const loadCredentials = async () => {
    try {
      const res = await fetch('/api/v1/credentials?customer_id=demo')
      if (res.ok) {
        const data = await res.json()
        setStoredCredentials(data.credentials || [])
      }
    } catch (error) {
      console.error('Failed to load credentials:', error)
    } finally {
      setLoadingCredentials(false)
    }
  }

  const handleCredentialSubmitted = async (provider: string, credentials: Record<string, string>) => {
    // After validation & storage, show scanning approval step
    setApprovedProviders([provider])
    setScanningApprovalStep(true)
    
    // Reload credentials list
    await loadCredentials()
  }

  const handleDeleteCredential = async (provider: string) => {
    if (!confirm(`Delete ${provider.toUpperCase()} credentials?`)) return

    try {
      const res = await fetch(`/api/v1/credentials/${provider}?customer_id=demo`, {
        method: 'DELETE'
      })

      if (res.ok) {
        await loadCredentials()
      }
    } catch (error) {
      console.error('Failed to delete credential:', error)
    }
  }

  const handleScanningApproved = async (config: any) => {
    try {
      const res = await fetch('/api/v1/scanning/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: 'demo',
          ...config
        })
      })

      if (res.ok) {
        // Directly start the scan
        const scanRes = await fetch('/api/v1/scanning/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: 'demo',
            providers: approvedProviders
          })
        })

        if (scanRes.ok) {
          setScanningApprovalStep(false)
          // Redirect to dashboard
          window.location.href = '/dashboard'
        }
      }
    } catch (error) {
      console.error('Failed to approve scanning:', error)
    }
  }

  return (
    <div className="space-y-8">
      
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
          Cloud Settings
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Manage your cloud provider credentials and scanning preferences
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Forms */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Add Credentials Section */}
          <div>
            <h2 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-white">Add Cloud Provider</h2>
            <CredentialForm onSubmit={handleCredentialSubmitted} />
          </div>

          {/* Scanning Approval Section */}
          {scanningApprovalStep && (
            <div>
              <h2 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-white">Complete Setup</h2>
              <ScanningApproval
                providers={approvedProviders}
                onApprove={handleScanningApproved}
              />
            </div>
          )}
        </div>

        {/* Right Column: Stored Credentials */}
        <div>
          <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-white">Connected Providers</h2>
          
          <div className="card space-y-3">
            {loadingCredentials ? (
              <div className="flex items-center justify-center p-8">
                <Loader className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : storedCredentials.length === 0 ? (
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg text-center text-slate-600 dark:text-slate-400 text-sm">
                No credentials stored yet
              </div>
            ) : (
              storedCredentials.map(cred => (
                <div
                  key={cred.provider}
                  className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between hover:shadow-sm transition"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`w-2 h-2 rounded-full ${cred.is_valid ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div>
                      <div className="font-medium text-sm text-slate-900 dark:text-white">{cred.provider.toUpperCase()}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {cred.is_valid ? '✓ Valid' : '✗ Invalid'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteCredential(cred.provider)}
                    className="p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Quick Stats */}
          {storedCredentials.length > 0 && (
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="text-sm">
                <div className="font-semibold text-blue-900 dark:text-blue-300 mb-2">Setup Status</div>
                <div className="space-y-1 text-xs text-blue-800 dark:text-blue-200">
                  <div>✓ {storedCredentials.length} cloud provider(s) connected</div>
                  <div>✓ Credentials validated</div>
                  {storedCredentials.every(c => c.is_valid) && (
                    <div>✓ Ready to scan</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info Section */}
      <div className="card bg-white dark:bg-slate-800">
        <h3 className="font-semibold mb-3 text-slate-900 dark:text-white">How it works</h3>
        <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
          <li><strong>1. Add credentials:</strong> Securely store your cloud provider credentials</li>
          <li><strong>2. Validate:</strong> OptiOra tests access to your cloud billing APIs</li>
          <li><strong>3. Approve scanning:</strong> Review and approve cost analysis settings</li>
          <li><strong>4. Begin analysis:</strong> OptiOra starts finding cost optimization opportunities</li>
        </ol>
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
