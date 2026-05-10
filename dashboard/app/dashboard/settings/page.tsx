'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Loader, Upload, Download, Send, Eye, EyeOff } from 'lucide-react';
import { useCloudVisibility } from '@/lib/cloud-visibility';
import CredentialForm from '@/app/components/CredentialForm';
import ScanningApproval from '@/app/components/ScanningApproval';
import {
  createExportJob,
  downloadImportedCostTemplateCsv,
  fetchImportedCostSummary,
  fetchNotificationDestinations,
  fetchAlertRoutingPolicies,
  listExportJobRuns,
  listExportJobs,
  previewImportedCostCsv,
  runExportJob,
  simulateAlertRouting,
  testNotificationDestination,
  toggleNotificationDestination,
  uploadImportedCostCsv,
} from '@/lib/api';
import { authorizedFetch } from '@/lib/auth-fetch';
import { backendUrl } from '@/lib/backend-url';
import { useAuth } from '@/lib/auth-context';
import {
  ExportJob,
  ExportJobRun,
  ImportedCostSummaryResponse,
  ImportPreviewResponse,
  NotificationDestinationStatus,
  AlertRoutingPolicy,
  AlertRoutingPolicySimulationResponse,
} from '@/lib/types';
import { Expander } from '@/components/ui/expander';


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
  const [csvPreview, setCsvPreview] = useState<ImportPreviewResponse | null>(null)
  const [loadingCsvPreview, setLoadingCsvPreview] = useState(false)
  const [notificationDestinations, setNotificationDestinations] = useState<NotificationDestinationStatus[]>([])
  const [loadingDestinations, setLoadingDestinations] = useState(true)
  const [destinationTarget, setDestinationTarget] = useState('')
  const [testingChannel, setTestingChannel] = useState<string | null>(null)
  const [destinationMessage, setDestinationMessage] = useState<string | null>(null)
  const [destinationError, setDestinationError] = useState<string | null>(null)
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([])
  const [exportJobRunsByJobId, setExportJobRunsByJobId] = useState<Record<number, ExportJobRun[]>>({})
  const [loadingExportJobs, setLoadingExportJobs] = useState(true)
  const [creatingExportJob, setCreatingExportJob] = useState(false)
  const [runningExportJobId, setRunningExportJobId] = useState<number | null>(null)
  const [exportJobName, setExportJobName] = useState('Weekly Executive Export')
  const [routingPolicies, setRoutingPolicies] = useState<AlertRoutingPolicy[]>([])
  const [loadingRoutingPolicies, setLoadingRoutingPolicies] = useState(true)
  const [simulatorSeverity, setSimulatorSeverity] = useState<'warning' | 'critical'>('warning')
  const [simulatorTitle, setSimulatorTitle] = useState('Test Alert')
  const [simulatorResult, setSimulatorResult] = useState<AlertRoutingPolicySimulationResponse | null>(null)
  const [simulatingRouting, setSimulatingRouting] = useState(false)
  const [routingSimulatorError, setRoutingSimulatorError] = useState<string | null>(null)
  const [exportJobFrequency, setExportJobFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [exportJobFormat, setExportJobFormat] = useState<'csv' | 'xls'>('csv')
  const [exportJobMessage, setExportJobMessage] = useState<string | null>(null)
  const [exportJobError, setExportJobError] = useState<string | null>(null)
  const canManageCloudSettings = !authEnabled || ['owner', 'admin'].includes(organization?.role || '')
  const { hiddenProviders, toggleProvider, isVisible } = useCloudVisibility()

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

  const loadNotificationDestinations = useCallback(async () => {
    if (authEnabled && !user) {
      return
    }

    try {
      const data = await fetchNotificationDestinations()
      setNotificationDestinations(data.destinations || [])
    } catch (error) {
      console.error('Failed to load notification destinations:', error)
    } finally {
      setLoadingDestinations(false)
    }
  }, [authEnabled, user])

  const loadExportJobs = useCallback(async () => {
    if (authEnabled && !user) {
      return
    }

    try {
      const jobs = await listExportJobs()
      setExportJobs(jobs)
      const runEntries = await Promise.all(
        jobs.slice(0, 8).map(async (job) => {
          try {
            const runs = await listExportJobRuns(job.id, 3)
            return [job.id, runs] as const
          } catch {
            return [job.id, []] as const
          }
        }),
      )
      setExportJobRunsByJobId(Object.fromEntries(runEntries))
    } catch (error) {
      console.error('Failed to load export jobs:', error)
    } finally {
      setLoadingExportJobs(false)
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

  useEffect(() => {
    if (authEnabled && !user) {
      setNotificationDestinations([])
      setLoadingDestinations(false)
      return
    }

    setLoadingDestinations(true)
    void loadNotificationDestinations()
  }, [authEnabled, user, loadNotificationDestinations])

  useEffect(() => {
    if (authEnabled && !user) {
      setExportJobs([])
      setExportJobRunsByJobId({})
      setLoadingExportJobs(false)
      return
    }

    setLoadingExportJobs(true)
    void loadExportJobs()
  }, [authEnabled, user, loadExportJobs])

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
        `Imported ${result.rows_imported} row(s) from ${result.filename}. The CSV is now available as an optional manual billing source for this workspace. Live provider APIs remain the preferred source whenever runtime cloud access is configured.`,
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

  const handleToggleDestination = async (channel: 'email' | 'slack' | 'teams', enabled: boolean) => {
    if (!canManageCloudSettings) return
    setDestinationError(null)
    setDestinationMessage(null)
    try {
      const data = await toggleNotificationDestination(channel, enabled)
      setNotificationDestinations(data.destinations || [])
      setDestinationMessage(`${channel.toUpperCase()} ${enabled ? 'enabled' : 'disabled'} for alerts.`)
    } catch (error) {
      setDestinationError(error instanceof Error ? formatApiErrorMessage(error.message) : 'Failed to update destination toggle.')
    }
  }

  const handleTestDestination = async (channel: 'email' | 'slack' | 'teams') => {
    if (!canManageCloudSettings) return
    setDestinationError(null)
    setDestinationMessage(null)
    setTestingChannel(channel)
    try {
      const target = destinationTarget.trim() || undefined
      const result = await testNotificationDestination(channel, target)
      if (result.success) {
        setDestinationMessage(result.detail)
        await loadNotificationDestinations()
      } else {
        setDestinationError(result.detail)
      }
    } catch (error) {
      setDestinationError(error instanceof Error ? formatApiErrorMessage(error.message) : 'Failed to send destination test.')
    } finally {
      setTestingChannel(null)
    }
  }

  const handleCreateExportJob = async () => {
    if (!canManageCloudSettings) return
    if (!exportJobName.trim()) {
      setExportJobError('Export job name is required.')
      return
    }
    setCreatingExportJob(true)
    setExportJobError(null)
    setExportJobMessage(null)
    try {
      await createExportJob({
        name: exportJobName.trim(),
        report_type: 'executive_summary',
        export_format: exportJobFormat,
        schedule_frequency: exportJobFrequency,
        is_active: true,
      })
      setExportJobMessage('Export job created successfully.')
      await loadExportJobs()
    } catch (error) {
      setExportJobError(
        error instanceof Error ? formatApiErrorMessage(error.message) : 'Failed to create export job.',
      )
    } finally {
      setCreatingExportJob(false)
    }
  }

  const handleRunExportJob = async (jobId: number) => {
    if (!canManageCloudSettings) return
    setRunningExportJobId(jobId)
    setExportJobError(null)
    setExportJobMessage(null)
    try {
      const run = await runExportJob(jobId)
      setExportJobMessage(`Export job run completed with status: ${run.status}.`)
      await loadExportJobs()
    } catch (error) {
      setExportJobError(
        error instanceof Error ? formatApiErrorMessage(error.message) : 'Failed to run export job.',
      )
    } finally {
      setRunningExportJobId(null)
    }
  }

  const loadRoutingPolicies = useCallback(async () => {
    if (authEnabled && !user) {
      return
    }

    try {
      const policies = await fetchAlertRoutingPolicies()
      setRoutingPolicies(policies)
    } catch (error) {
      console.error('Failed to load routing policies:', error)
    } finally {
      setLoadingRoutingPolicies(false)
    }
  }, [authEnabled, user])

  useEffect(() => {
    if (authEnabled && !user) {
      setRoutingPolicies([])
      setLoadingRoutingPolicies(false)
      return
    }

    setLoadingRoutingPolicies(true)
    void loadRoutingPolicies()
  }, [authEnabled, user, loadRoutingPolicies])

  const handleSimulateRouting = async () => {
    setSimulatingRouting(true)
    setRoutingSimulatorError(null)
    setSimulatorResult(null)
    try {
      const result = await simulateAlertRouting(
        simulatorSeverity,
        simulatorTitle.trim() || undefined,
      )
      setSimulatorResult(result)
    } catch (error) {
      setRoutingSimulatorError(
        error instanceof Error ? formatApiErrorMessage(error.message) : 'Failed to simulate routing.',
      )
    } finally {
      setSimulatingRouting(false)
    }
  }

  return (
    <div className="space-y-8">
      
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
          Cloud Settings
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Manage your cloud provider credentials, optional CSV billing imports, and scanning preferences
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          OptiOra prefers live cloud provider APIs and runtime credentials. CSV upload is optional for manual finance imports, backfill, or cases where live runtime access is not configured yet.
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

      <Expander
        title="Cloud Connections And Cost Imports"
        description="Credentials, optional CSV billing import, scan approval, connected providers, and imported data status."
        icon={<Upload className="h-5 w-5" />}
        defaultOpen
      >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Forms */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Add Credentials Section */}
          <div>
            <h2 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-white">Preferred: Connect Cloud Provider</h2>
            {canManageCloudSettings ? (
              <CredentialForm onSubmit={handleCredentialSubmitted} />
            ) : (
              <div className="card text-sm text-slate-600 dark:text-slate-400">
                Credential management is disabled for your current role.
              </div>
            )}
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-white">Optional: Upload Cost CSV</h2>
            <div className="card space-y-4">
              <div>
                <div className="font-medium text-slate-900 dark:text-white">Manual fallback import</div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Upload a UTF-8 CSV only when you want a manual billing dataset for backfill, finance reconciliation, or environments where live provider APIs are not available yet. Use the template below for account and region rollups.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                Required columns: <code>provider</code>, <code>cost_usd</code>
                <br />
                Optional columns: <code>service_name</code>, <code>account_identifier</code>, <code>account_name</code>, <code>region</code>, <code>period_start</code>, <code>period_end</code>, <code>currency</code>
                <br />
                Live provider APIs remain the preferred source whenever runtime cloud access is configured.
              </div>

              <button
                type="button"
                onClick={() => void downloadImportedCostTemplateCsv()}
                data-testid="csv-template-download"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Download className="h-4 w-4" />
                Download CSV template
              </button>

              <div className="space-y-3">
                <input
                  data-testid="csv-upload-input"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={!canManageCloudSettings || uploadingCsv}
                  onChange={(event) => {
                    setCsvUploadError(null)
                    setCsvUploadMessage(null)
                    setCsvPreview(null)
                    setSelectedCsvFile(event.target.files?.[0] || null)
                  }}
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:file:bg-slate-800 dark:file:text-slate-200"
                />

                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedCsvFile) return
                    setLoadingCsvPreview(true)
                    setCsvPreview(null)
                    try {
                      const preview = await previewImportedCostCsv(selectedCsvFile)
                      setCsvPreview(preview)
                    } catch {
                      // preview errors are non-blocking
                    } finally {
                      setLoadingCsvPreview(false)
                    }
                  }}
                  data-testid="csv-preview-btn"
                  disabled={!selectedCsvFile || loadingCsvPreview}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {loadingCsvPreview ? <Loader className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  {loadingCsvPreview ? 'Previewing...' : 'Preview'}
                </button>

                <button
                  type="button"
                  onClick={() => void handleCsvUpload()}
                  data-testid="csv-upload-submit"
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
                <div
                  data-testid="csv-upload-message"
                  className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                >
                  {csvUploadMessage}
                </div>
              )}

              {csvUploadError && (
                <div className="whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                  {csvUploadError}
                </div>
              )}

              {csvPreview && (
                <div data-testid="csv-preview-panel" className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex gap-4 text-sm">
                    <span className="text-emerald-700 dark:text-emerald-300">{csvPreview.accepted_rows} accepted rows</span>
                    <span className="text-slate-500">{csvPreview.total_rows} total</span>
                    {csvPreview.rejected_rows > 0 && <span className="text-amber-600">{csvPreview.rejected_rows} skipped</span>}
                  </div>
                  {Object.keys(csvPreview.mapping_feedback).length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Mapping feedback</div>
                      <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                        {Object.entries(csvPreview.mapping_feedback).map(([k, v], i) => <li key={i}>{k}: {String(v)}</li>)}
                      </ul>
                    </div>
                  )}
                  {csvPreview.reconciliation_guidance.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Reconciliation guidance</div>
                      <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                        {csvPreview.reconciliation_guidance.map((n: string, i: number) => <li key={i}>{n}</li>)}
                      </ul>
                    </div>
                  )}
                  {csvPreview.issues.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-amber-700 dark:text-amber-300">Issues</div>
                      <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-amber-600 dark:text-amber-400">
                        {csvPreview.issues.slice(0, 5).map((w, i) => (
                          <li key={i}>Line {w.line_number}: {w.message}</li>
                        ))}
                        {csvPreview.issues.length > 5 && <li>…and {csvPreview.issues.length - 5} more</li>}
                      </ul>
                    </div>
                  )}
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
            {hiddenProviders.length > 0 && (
              <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <span>{hiddenProviders.length} provider(s) hidden from dashboard</span>
                <button
                  type="button"
                  onClick={() => hiddenProviders.forEach(p => toggleProvider(p))}
                  className="ml-2 underline hover:no-underline"
                >
                  Show all
                </button>
              </div>
            )}
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
                  className={`p-3 bg-white dark:bg-slate-800 rounded-lg border transition hover:shadow-sm ${
                    isVisible(cred.provider)
                      ? 'border-slate-200 dark:border-slate-700'
                      : 'border-slate-200 dark:border-slate-700 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${cred.is_valid ? 'bg-green-500' : 'bg-red-500'}`} />
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-slate-900 dark:text-white">
                          {cred.provider.toUpperCase()}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {cred.is_valid ? '✓ Valid' : '✗ Invalid'}
                          {!isVisible(cred.provider) && (
                            <span className="ml-2 text-amber-600 dark:text-amber-400">· hidden from dashboard</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Visibility toggle */}
                      <button
                        type="button"
                        onClick={() => toggleProvider(cred.provider)}
                        title={isVisible(cred.provider) ? 'Hide from dashboard' : 'Show in dashboard'}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition"
                      >
                        {isVisible(cred.provider) ? (
                          <><Eye className="w-3.5 h-3.5" /><span>Visible</span></>
                        ) : (
                          <><EyeOff className="w-3.5 h-3.5" /><span>Hidden</span></>
                        )}
                      </button>

                      {/* Disconnect button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteCredential(cred.provider)}
                        disabled={!canManageCloudSettings}
                        title="Disconnect cloud provider"
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  </div>
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
                No optional CSV billing import has been uploaded for this workspace.
              </div>
            ) : (
              <div data-testid="imported-cost-summary" className="space-y-3 text-sm">
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
                <div className="text-slate-600 dark:text-slate-400">
                  This imported dataset is available as a manual source. Live provider APIs remain preferred whenever runtime credentials are configured on the OptiOra host.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      </Expander>

      {/* Info Section */}
      <Expander
        title="Setup Flow"
        description="Preferred live-provider setup path and optional manual import fallback."
        icon={<Eye className="h-5 w-5" />}
      >
      <div className="card bg-white dark:bg-slate-800">
        <h3 className="font-semibold mb-3 text-slate-900 dark:text-white">How it works</h3>
        <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
          <li><strong>1. Preferred path:</strong> Connect live cloud credentials so OptiOra can use provider APIs directly</li>
          <li><strong>2. Validate:</strong> OptiOra tests provider API access when live credentials are used</li>
          <li><strong>3. Approve scanning:</strong> Review and approve cost analysis settings for live scans</li>
          <li><strong>4. Optional fallback:</strong> Upload a billing CSV only when you need a manual source for backfill or when live runtime access is not configured</li>
        </ol>
      </div>
      </Expander>

      {/* Preferences */}
      <Expander
        title="Preferences, Notifications, Routing, And Exports"
        description="Workspace plan, AI provider, alert delivery destinations, routing simulation, and scheduled report jobs."
        icon={<Send className="h-5 w-5" />}
      >
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

          <div className="p-4 border-b border-slate-200 dark:border-slate-700 space-y-3">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Notification Destinations</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Configure delivery channel toggles and send a test notification before enabling production alerts.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Test target (required for email, optional webhook override for Slack/Teams)
              </label>
              <input
                value={destinationTarget}
                onChange={(event) => setDestinationTarget(event.target.value)}
                placeholder="name@example.com or webhook URL"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            {loadingDestinations ? (
              <div className="flex items-center justify-center py-6">
                <Loader className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="space-y-2">
                {notificationDestinations.map((destination) => (
                  <div
                    key={destination.channel}
                    className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">
                          {destination.channel.toUpperCase()}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">
                          Configured: {destination.configured ? 'yes' : 'no'} · Last delivery: {formatDateTime(destination.last_delivery_at)}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">
                          Success: {formatDateTime(destination.last_success_at)} · Error: {formatDateTime(destination.last_error_at)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={destination.enabled}
                          disabled={!canManageCloudSettings}
                          onChange={(event) => {
                            void handleToggleDestination(
                              destination.channel as 'email' | 'slack' | 'teams',
                              event.target.checked,
                            )
                          }}
                          className="w-5 h-5"
                        />
                        <button
                          type="button"
                          onClick={() => void handleTestDestination(destination.channel as 'email' | 'slack' | 'teams')}
                          disabled={!canManageCloudSettings || testingChannel === destination.channel}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {testingChannel === destination.channel ? (
                            <Loader className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Test
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {destinationMessage && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                {destinationMessage}
              </div>
            )}

            {destinationError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                {destinationError}
              </div>
            )}
          </div>

          <div className="p-4 border-b border-slate-200 dark:border-slate-700 space-y-3">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Alert Routing Simulator</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Preview which notification channels will receive alerts based on severity and current routing policies before saving new configurations.
              </p>
            </div>

            {loadingRoutingPolicies ? (
              <div className="flex items-center justify-center py-6">
                <Loader className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : routingPolicies.length === 0 ? (
              <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-900/50 dark:text-slate-400">
                No routing policies configured yet. Configure policies under Notification Destinations first.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Test Severity
                  </label>
                  <select
                    value={simulatorSeverity}
                    onChange={(e) => setSimulatorSeverity(e.target.value as 'warning' | 'critical')}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Test Alert Title (optional)
                  </label>
                  <input
                    value={simulatorTitle}
                    onChange={(e) => setSimulatorTitle(e.target.value)}
                    placeholder="E.g., CPU usage exceeded threshold"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void handleSimulateRouting()}
                  disabled={simulatingRouting}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  {simulatingRouting ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      Simulating...
                    </>
                  ) : (
                    'Run Simulation'
                  )}
                </button>

                {simulatorResult && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="text-sm space-y-2">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">Matched Policy</div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">
                          {simulatorResult.matched_policy_id ? `Policy ID: ${simulatorResult.matched_policy_id}` : 'No matching policy (using defaults)'}
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">Expected Channels</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {simulatorResult.expected_channels.length > 0 ? (
                            simulatorResult.expected_channels.map((ch) => (
                              <span
                                key={ch}
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                              >
                                {ch}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-500">No channels configured for this severity</span>
                          )}
                        </div>
                      </div>
                      {simulatorResult.configured_channels.length > 0 && (
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white text-xs mt-2">Configured Channels</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {simulatorResult.configured_channels.map((ch) => (
                              <span
                                key={ch}
                                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              >
                                {ch}
                              </span>
                            ))
                          }
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {routingSimulatorError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                    {routingSimulatorError}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-4 border-b border-slate-200 dark:border-slate-700 space-y-3">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Scheduled Export Jobs</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Configure recurring executive report exports and run on demand.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
              <input
                value={exportJobName}
                onChange={(event) => setExportJobName(event.target.value)}
                placeholder="Job name"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 lg:col-span-2"
              />
              <select
                value={exportJobFrequency}
                onChange={(event) => setExportJobFrequency(event.target.value as 'daily' | 'weekly' | 'monthly')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <div className="flex gap-2">
                <select
                  value={exportJobFormat}
                  onChange={(event) => setExportJobFormat(event.target.value as 'csv' | 'xls')}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="csv">CSV</option>
                  <option value="xls">Excel</option>
                </select>
                <button
                  type="button"
                  data-testid="settings-create-export-job"
                  onClick={() => void handleCreateExportJob()}
                  disabled={!canManageCloudSettings || creatingExportJob}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  {creatingExportJob ? <Loader className="h-4 w-4 animate-spin" /> : 'Create'}
                </button>
              </div>
            </div>

            {loadingExportJobs ? (
              <div className="flex items-center justify-center py-6">
                <Loader className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : exportJobs.length === 0 ? (
              <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-900/50 dark:text-slate-400">
                No export jobs configured yet.
              </div>
            ) : (
              <div className="space-y-2">
                {exportJobs.map((job) => {
                  const latestRun = exportJobRunsByJobId[job.id]?.[0]
                  return (
                    <div
                      key={job.id}
                      className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">{job.name}</div>
                          <div className="text-xs text-slate-600 dark:text-slate-400">
                            {job.schedule_frequency} · {job.export_format.toUpperCase()} · {job.report_type}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-500">
                            Last run: {formatDateTime(job.last_run_at)}
                          </div>
                          {latestRun && (
                            <div className="text-xs text-slate-500 dark:text-slate-500">
                              Latest result: {latestRun.status} · {latestRun.row_count} rows · {latestRun.output_filename || 'no artifact'}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          data-testid={`settings-run-export-job-${job.id}`}
                          onClick={() => void handleRunExportJob(job.id)}
                          disabled={!canManageCloudSettings || runningExportJobId === job.id}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {runningExportJobId === job.id ? (
                            <Loader className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Run now
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {exportJobMessage && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                {exportJobMessage}
              </div>
            )}

            {exportJobError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                {exportJobError}
              </div>
            )}
          </div>
        </div>
      </div>
      </Expander>

      {/* Account */}
      <Expander
        title="Account"
        description="Current account and session state."
        icon={<EyeOff className="h-5 w-5" />}
      >
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
      </Expander>
    </div>
  )
}
