'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ElementType } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  KeyRound,
  Loader2,
  Network,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
} from 'lucide-react'
import {
  acknowledgeAlert,
  downloadAlertsCsv,
  downloadAuditLogsCsv,
  downloadScanDiffCsv,
  downloadScanHistoryCsv,
  fetchAlerts,
  fetchApiHealth,
  fetchApiInfo,
  fetchAuditLogs,
  fetchCredentials,
  fetchScanDiff,
  fetchScanHistory,
  fetchScanningPermission,
  startScan,
} from '@/lib/api'
import {
  AlertEvent,
  AuditLogEntry,
  ApiHealth,
  ApiInfo,
  ScanDiffResponse,
  ScanHistoryItem,
  ScanningPermission,
  StoredCredential,
  ScanStartResponse,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface OperationsState {
  health: ApiHealth | null
  info: ApiInfo | null
  credentials: StoredCredential[]
  permission: ScanningPermission | null
  scan: ScanStartResponse | null
  history: ScanHistoryItem[]
  latestDiff: ScanDiffResponse | null
  alerts: AlertEvent[]
  auditLogs: AuditLogEntry[]
  error: string | null
}

const initialState: OperationsState = {
  health: null,
  info: null,
  credentials: [],
  permission: null,
  scan: null,
  history: [],
  latestDiff: null,
  alerts: [],
  auditLogs: [],
  error: null,
}

function statusTone(ok: boolean): string {
  return ok
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800'
    : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800'
}

function CapabilityCard({
  title,
  value,
  detail,
  ok,
  icon: Icon,
}: {
  title: string
  value: string
  detail: string
  ok: boolean
  icon: ElementType
}) {
  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {title}
        </CardTitle>
        <Icon className={ok ? 'h-5 w-5 text-emerald-600' : 'h-5 w-5 text-amber-600'} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{detail}</p>
      </CardContent>
    </Card>
  )
}

export default function OperationsPage() {
  const [state, setState] = useState<OperationsState>(initialState)
  const [loading, setLoading] = useState(true)
  const [scanLoading, setScanLoading] = useState(false)

  const connectedProviders = useMemo(
    () => state.credentials.filter((credential) => credential.is_valid),
    [state.credentials],
  )

  const supportedProviders = state.info?.supported_providers || ['aws', 'azure', 'gcp', 'oci']
  const scanApproved = state.permission?.state === 'approved' || state.permission?.state === 'running'

  async function loadOperations() {
    setLoading(true)
    setState((current) => ({ ...current, error: null }))

    const [health, info, credentials, permission, history, alerts, auditLogs] = await Promise.allSettled([
      fetchApiHealth(),
      fetchApiInfo(),
      fetchCredentials(),
      fetchScanningPermission(),
      fetchScanHistory(8),
      fetchAlerts(8),
      fetchAuditLogs(8),
    ])

    const historyItems = history.status === 'fulfilled' ? history.value : []
    const latestCompletedScan = historyItems.find((item) => item.state === 'completed')
    let latestDiff: ScanDiffResponse | null = null
    if (latestCompletedScan) {
      try {
        latestDiff = await fetchScanDiff(latestCompletedScan.scan_id)
      } catch {
        latestDiff = null
      }
    }

    setState((current) => ({
      ...current,
      health: health.status === 'fulfilled' ? health.value : null,
      info: info.status === 'fulfilled' ? info.value : null,
      credentials: credentials.status === 'fulfilled' ? credentials.value.credentials || [] : [],
      permission: permission.status === 'fulfilled' ? permission.value : null,
      history: historyItems,
      latestDiff,
      alerts: alerts.status === 'fulfilled' ? alerts.value : [],
      auditLogs: auditLogs.status === 'fulfilled' ? auditLogs.value : [],
      error:
        health.status === 'rejected'
          ? 'Backend health check failed. Verify API service and NEXT_PUBLIC_API_URL.'
          : null,
    }))
    setLoading(false)
  }

  async function handleStartScan() {
    setScanLoading(true)
    setState((current) => ({ ...current, error: null }))
    try {
      const providerList = connectedProviders.map((credential) => credential.provider)
      const scan = await startScan(providerList.length > 0 ? providerList : undefined)
      setState((current) => ({ ...current, scan }))
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Unable to start scan.',
      }))
    } finally {
      setScanLoading(false)
    }
  }

  async function handleAcknowledgeAlert(alertId: number) {
    try {
      await acknowledgeAlert(alertId)
      await loadOperations()
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Unable to acknowledge alert.',
      }))
    }
  }

  useEffect(() => {
    void loadOperations()
  }, [])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Operations
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Run checks, confirm provider readiness, and start approved cost scans.
          </p>
        </div>
        <Button onClick={() => void loadOperations()} disabled={loading} className="rounded-lg">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {state.error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CapabilityCard
          title="API"
          value={state.health?.status || 'Unknown'}
          detail={state.health?.version ? `Version ${state.health.version}` : 'Health endpoint check'}
          ok={state.health?.status === 'healthy'}
          icon={Server}
        />
        <CapabilityCard
          title="Providers"
          value={`${connectedProviders.length}/${supportedProviders.length}`}
          detail="Validated billing connections"
          ok={connectedProviders.length > 0}
          icon={Cloud}
        />
        <CapabilityCard
          title="Scanning"
          value={state.permission?.state || 'Not approved'}
          detail={state.permission?.scan_frequency || 'Approval required before scans'}
          ok={scanApproved}
          icon={Activity}
        />
        <CapabilityCard
          title="Infrastructure"
          value="Terraform + Ansible"
          detail="Network and host provisioning split"
          ok
          icon={Network}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="rounded-lg xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Provider Readiness
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Tested</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supportedProviders.map((provider) => {
                  const credential = state.credentials.find((item) => item.provider === provider)
                  const valid = Boolean(credential?.is_valid)
                  return (
                    <TableRow key={provider}>
                      <TableCell className="font-medium uppercase">{provider}</TableCell>
                      <TableCell>
                        <Badge className={`rounded-md border ${statusTone(valid)}`}>
                          {valid ? 'Connected' : 'Needs credentials'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400">
                        {credential?.tested_at || credential?.last_tested || 'Never'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Scan Control
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <div className="flex items-center justify-between">
                <span>Permission</span>
                <Badge className={`rounded-md border ${statusTone(scanApproved)}`}>
                  {state.permission?.state || 'Missing'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>Auto remediate</span>
                <span>{state.permission?.auto_remediate ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Providers</span>
                <span>{connectedProviders.length || 0}</span>
              </div>
            </div>

            <Button
              onClick={() => void handleStartScan()}
              disabled={!scanApproved || scanLoading || connectedProviders.length === 0}
              className="w-full rounded-lg"
            >
              {scanLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Start Cost Scan
            </Button>

            {state.scan && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                Started scan {state.scan.scan_id}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="rounded-lg">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Scan History</CardTitle>
            <Button variant="outline" className="rounded-lg" onClick={() => void downloadScanHistoryCsv()}>
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Providers</TableHead>
                  <TableHead>Savings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-slate-500 dark:text-slate-400">
                      No scans recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  state.history.map((item) => (
                    <TableRow key={item.scan_id}>
                      <TableCell className="font-medium">{item.scan_id}</TableCell>
                      <TableCell>{item.state}</TableCell>
                      <TableCell>{item.providers.join(', ')}</TableCell>
                      <TableCell>${item.savings_identified.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Latest Scan Diff</CardTitle>
            <Button
              variant="outline"
              className="rounded-lg"
              disabled={!state.latestDiff}
              onClick={() => state.latestDiff ? void downloadScanDiffCsv(state.latestDiff.current_scan_id, state.latestDiff.previous_scan_id || undefined) : undefined}
            >
              Export CSV
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {!state.latestDiff ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Run at least two completed scans to view deltas versus the previous snapshot set.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Current</div>
                    <div className="text-lg font-semibold">${state.latestDiff.total_current_cost_usd.toFixed(2)}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Previous</div>
                    <div className="text-lg font-semibold">${state.latestDiff.total_previous_cost_usd.toFixed(2)}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Delta</div>
                    <div className="text-lg font-semibold">${state.latestDiff.total_delta_cost_usd.toFixed(2)}</div>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Current</TableHead>
                      <TableHead>Previous</TableHead>
                      <TableHead>Delta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {state.latestDiff.entries.map((entry) => (
                      <TableRow key={entry.provider}>
                        <TableCell className="uppercase">{entry.provider}</TableCell>
                        <TableCell>${entry.current_cost_usd.toFixed(2)}</TableCell>
                        <TableCell>${entry.previous_cost_usd.toFixed(2)}</TableCell>
                        <TableCell>${entry.delta_cost_usd.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="rounded-lg">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Alerts</CardTitle>
            <Button variant="outline" className="rounded-lg" onClick={() => void downloadAlertsCsv()}>
              Export CSV
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.alerts.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No active alerts.</p>
            ) : (
              state.alerts.map((alert) => (
                <div key={alert.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900 dark:text-white">{alert.title}</div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">{alert.message}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                        {alert.severity} · channels: {alert.delivered_channels.join(', ') || 'none'}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="rounded-lg"
                      disabled={Boolean(alert.acknowledged_at)}
                      onClick={() => void handleAcknowledgeAlert(alert.id)}
                    >
                      {alert.acknowledged_at ? 'Acknowledged' : 'Acknowledge'}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Audit Trail</CardTitle>
            <Button variant="outline" className="rounded-lg" onClick={() => void downloadAuditLogsCsv()}>
              Export CSV
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.auditLogs.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Audit entries are visible to owners and admins once privileged actions occur.
              </p>
            ) : (
              state.auditLogs.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="font-medium text-slate-900 dark:text-white">{entry.action}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    {entry.entity_type}{entry.entity_id ? ` · ${entry.entity_id}` : ''}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                    {new Date(entry.created_at).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Capability Map</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              title: 'Authentication',
              ok: Boolean(state.info?.features?.credential_management),
              detail: 'Login, profiles, refresh tokens',
            },
            {
              title: 'Credential Validation',
              ok: Boolean(state.info?.features?.credential_validation),
              detail: 'Cloud API access checks',
            },
            {
              title: 'Scanning Permissions',
              ok: Boolean(state.info?.features?.scanning_permissions),
              detail: 'Approval before background scans',
            },
            {
              title: 'Dashboard APIs',
              ok: Boolean(state.info?.features?.dashboard_endpoints),
              detail: 'Cost, anomaly, recommendation views',
            },
          ].map(({ title, ok, detail }) => (
            <div key={title} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
              <div className="mb-2 flex items-center gap-2">
                {ok ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                )}
                <span className="font-semibold text-slate-900 dark:text-white">{title}</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">{detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
