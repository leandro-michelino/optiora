'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Loader, Upload } from 'lucide-react';
import CredentialForm from '@/app/components/CredentialForm';
import ScanningApproval from '@/app/components/ScanningApproval';
import { fetchImportedCostSummary, uploadImportedCostCsv } from '@/lib/api';
import { authorizedFetch } from '@/lib/auth-fetch';
import { backendUrl } from '@/lib/backend-url';
import { useAuth } from '@/lib/auth-context';
import { ImportedCostSummaryResponse } from '@/lib/types';


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

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Not imported yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatApiErrorMessage(message: string): string {
  try {
    const parsed = JSON.parse(message) as { detail?: string }
    return parsed.detail || message
  } catch {
    return message
  }
}

export default function SettingsPage() {
  const { authEnabled, user, organization } = useAuth()
  const [storedCredentials, setStoredCredentials] = useState<StoredCredential[]>([])
  const [loadingCredentials, setLoadingCredentials] = useState(true)
  const [scanningApprovalStep, setScanningApprovalStep] = useState(false)
  const [approvedProviders, setApprovedProviders] = useState<string[]>([])
  const [importedCostSummary, setImportedCostSummary] = useState<ImportedCostSummaryResponse | null>(null)
  const [loadingImportedCosts, setLoadingImportedCosts] = useState(true)
  const [selectedCsvFile, setSelectedCsvFile] = useState<File | null>(null)
  const [uploadingCsv, setUploadingCsv] = useState(false)
  const [csvUploadMessage, setCsvUploadMessage] = useState<string | null>(null)
  const [csvUploadError, setCsvUploadError] = useState<string | null>(null)
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

  const loadImportedCosts = useCallback(async () => {
    if (authEnabled && !user) {
      return
    }

    try {
      const data = await fetchImportedCostSummary()
      setImportedCostSummary(data)
    } catch (error) {
      console.error('Failed to load imported costs:', error)
    } finally {
      setLoadingImportedCosts(false)
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

  useEffect(() => {
    if (authEnabled && !user) {
      setImportedCostSummary(null)
      setLoadingImportedCosts(false)
      return
    }

    setLoadingImportedCosts(true)
    void loadImportedCosts()
  }, [authEnabled, user, loadImportedCosts])

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

  const handleCsvUpload = async () => {
    if (!canManageCloudSettings || !selectedCsvFile) {
      return
    }

    setUploadingCsv(true)
    setCsvUploadError(null)
    setCsvUploadMessage(null)
    try {
      const result = await uploadImportedCostCsv(selectedCsvFile)
      setCsvUploadMessage(
        `Imported ${result.rows_imported} row(s) from ${result.filename}. Uploaded CSV data is now the active cost source for this workspace.`,
      )
      setSelectedCsvFile(null)
      await loadImportedCosts()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CSV upload failed'
      setCsvUploadError(formatApiErrorMessage(message))
    } finally {
      setUploadingCsv(false)
    }
  }

  return (
    <div className="space-y-8">
      
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
          Cloud Settings
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Manage your cloud provider credentials, CSV billing imports, and scanning preferences
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

          <div>
            <h2 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-white">Upload Cost CSV</h2>
            <div className="card space-y-4">
              <div>
                <div className="font-medium text-slate-900 dark:text-white">CSV only for now</div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Upload a UTF-8 CSV to use manual billing data instead of live provider collection. Native Excel import is intentionally not enabled yet.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                Required columns: <code>provider</code>, <code>cost_usd</code>
                <br />
                Optional columns: <code>service_name</code>, <code>account_identifier</code>, <code>account_name</code>, <code>region</code>, <code>period_start</code>, <code>period_end</code>, <code>currency</code>
              </div>

              <div className="space-y-3">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={!canManageCloudSettings || uploadingCsv}
                  onChange={(event) => {
                    setCsvUploadError(null)
                    setCsvUploadMessage(null)
                    setSelectedCsvFile(event.target.files?.[0] || null)
                  }}
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:file:bg-slate-800 dark:file:text-slate-200"
                />

                <button
                  type="button"
                  onClick={() => void handleCsvUpload()}
                  disabled={!canManageCloudSettings || !selectedCsvFile || uploadingCsv}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  {uploadingCsv ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {uploadingCsv ? 'Uploading CSV...' : 'Upload CSV'}
                </button>
              </div>

              {csvUploadMessage && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                  {csvUploadMessage}
                </div>
              )}

              {csvUploadError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                  {csvUploadError}
                </div>
              )}
            </div>
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

          <div className="mt-6 card space-y-3">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Imported Cost Data</h3>
            {loadingImportedCosts ? (
              <div className="flex items-center justify-center p-6">
                <Loader className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : !importedCostSummary?.has_data ? (
              <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-900/50 dark:text-slate-400">
                No CSV cost import is active yet.
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900/50">
                  <div className="font-medium text-slate-900 dark:text-white">
                    {importedCostSummary.source_filename || 'CSV import'}
                  </div>
                  <div className="mt-1 text-slate-600 dark:text-slate-400">
                    Last imported {formatDateTime(importedCostSummary.last_imported_at)}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Rows</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                      {importedCostSummary.rows_imported}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Cost</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                      {formatCurrency(importedCostSummary.total_cost_usd)}
                    </div>
                  </div>
                </div>
                <div className="text-slate-600 dark:text-slate-400">
                  Providers: {importedCostSummary.providers.map((provider) => provider.toUpperCase()).join(', ')}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="card bg-white dark:bg-slate-800">
        <h3 className="font-semibold mb-3 text-slate-900 dark:text-white">How it works</h3>
        <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
          <li><strong>1. Choose a source:</strong> Connect live cloud credentials or upload a billing CSV</li>
          <li><strong>2. Validate:</strong> OptiOra tests provider API access when live credentials are used</li>
          <li><strong>3. Approve scanning:</strong> Review and approve cost analysis settings for live scans</li>
          <li><strong>4. Begin analysis:</strong> OptiOra uses the active cost source to power dashboards and recommendations</li>
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
                  Narrative, AI insights, and advisor features use OCI GenAI in London South (`uk-london-1`) for this deployment.
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
