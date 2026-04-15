'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Loader } from 'lucide-react';
import CredentialForm from '@/app/components/CredentialForm';
import ScanningApproval from '@/app/components/ScanningApproval';
import { authorizedFetch } from '@/lib/auth-fetch';
import { backendUrl } from '@/lib/backend-url';
import { useAuth } from '@/lib/auth-context';


interface StoredCredential {
  provider: string
  is_valid: boolean
  tested_at?: string
  last_tested?: string
}

interface ScanApprovalConfig {
  scan_frequency: 'hourly' | 'daily' | 'weekly'
  auto_remediate: boolean
  notification_email: string
  monthly_budget_usd: number
  warning_threshold_percent: number
  critical_threshold_percent: number
  notifications_enabled: boolean
}

export default function SettingsPage() {
  const { authEnabled, user, organization } = useAuth()
  const [storedCredentials, setStoredCredentials] = useState<StoredCredential[]>([])
  const [loadingCredentials, setLoadingCredentials] = useState(true)
  const [scanningApprovalStep, setScanningApprovalStep] = useState(false)
  const [approvedProviders, setApprovedProviders] = useState<string[]>([])
  const canManageCloudSettings = !authEnabled || ['owner', 'admin'].includes(organization?.role || '')

  const loadCredentials = useCallback(async () => {
    if (authEnabled && !user) {
      return
    }

    try {
      const res = await authorizedFetch(backendUrl('/api/v1/credentials'))
      if (res.ok) {
        const data = await res.json()
        setStoredCredentials(data.credentials || [])
      }
    } catch (error) {
      console.error('Failed to load credentials:', error)
    } finally {
      setLoadingCredentials(false)
    }
  }, [authEnabled, user])

  useEffect(() => {
    if (authEnabled && !user) {
      setStoredCredentials([])
      setLoadingCredentials(false)
      return
    }

    setLoadingCredentials(true)
    void loadCredentials()
  }, [authEnabled, user, loadCredentials])

  const handleCredentialSubmitted = async (provider: string, _credentials: Record<string, string>) => {
    if (!canManageCloudSettings) {
      return
    }
    void _credentials
    // After validation & storage, show scanning approval step
    setApprovedProviders([provider])
    setScanningApprovalStep(true)
    
    // Reload credentials list
    await loadCredentials()
  }

  const handleDeleteCredential = async (provider: string) => {
    if (!canManageCloudSettings) {
      return
    }
    if (!confirm(`Delete ${provider.toUpperCase()} credentials?`)) return

    try {
      const res = await authorizedFetch(
        backendUrl(`/api/v1/credentials/${provider}`),
        {
          method: 'DELETE'
        }
      )

      if (res.ok) {
        await loadCredentials()
      }
    } catch (error) {
      console.error('Failed to delete credential:', error)
    }
  }

  const handleScanningApproved = async (config: ScanApprovalConfig) => {
    if (!canManageCloudSettings) {
      return
    }
    try {
      const res = await authorizedFetch(backendUrl('/api/v1/scanning/approve'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })

      if (res.ok) {
        // Directly start the scan
        const scanRes = await authorizedFetch(backendUrl('/api/v1/scanning/start'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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
        {organization && (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Active organization: <strong>{organization.name}</strong> · role: <strong>{organization.role}</strong>
          </p>
        )}
      </div>

      {!canManageCloudSettings && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Your current role is read-only for cloud setup. Ask an organization owner or admin to manage credentials and scan approvals.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Forms */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Add Credentials Section */}
          <div>
            <h2 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-white">Add Cloud Provider</h2>
            {canManageCloudSettings ? (
              <CredentialForm onSubmit={handleCredentialSubmitted} />
            ) : (
              <div className="card text-sm text-slate-600 dark:text-slate-400">
                Credential management is disabled for your current role.
              </div>
            )}
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
                    disabled={!canManageCloudSettings}
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
                  Organization Plan
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Current billing and feature tier for this workspace
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium uppercase text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                {organization?.plan || 'free'}
              </span>
            </div>

            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  AI Provider
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Narrative and advisor features use OCI GenAI for this deployment.
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                OCI GenAI
              </span>
            </div>

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
          {!authEnabled && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              Authentication is disabled for this deployment. User/password and RBAC remain an optional hardening step for a later deployment phase.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={user?.email || 'public-access@disabled.local'}
              disabled
              className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Session Status
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value="Token managed by backend"
                disabled
                className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-400"
              />
              <button className="btn-secondary" disabled>Managed</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
