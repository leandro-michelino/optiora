'use client'

import { useEffect, useState } from 'react'
import { Activity, RefreshCw, ShieldCheck } from 'lucide-react'
import { fetchAdminDiagnostics } from '@/lib/api'
import { AdminDiagnosticsSnapshot } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function formatDateTime(value?: string | null): string {
  if (!value) return 'n/a'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function AdminDiagnosticsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<AdminDiagnosticsSnapshot | null>(null)

  async function loadSnapshot() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAdminDiagnostics()
      setSnapshot(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load diagnostics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSnapshot()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Admin Diagnostics</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Health, scheduler, data freshness, and destination status in one operational view.
          </p>
        </div>
        <Button onClick={() => void loadSnapshot()} disabled={loading} className="rounded-lg">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm">API Health</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className="rounded-md border">
              {snapshot?.api_health?.status || 'unknown'}
            </Badge>
            <p className="mt-2 text-xs text-slate-500">Version {snapshot?.api_health?.version || 'n/a'}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm">Scheduler</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 dark:text-slate-400">
            <p>Enabled: {snapshot?.scheduler?.scheduler_enabled ? 'yes' : 'no'}</p>
            <p>Cadence: {snapshot?.scheduler?.effective_scan_frequency || snapshot?.scheduler?.scan_frequency || 'n/a'}</p>
            <p>Overdue: {snapshot?.scheduler?.overdue ? 'yes' : 'no'}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm">Data Freshness</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 dark:text-slate-400">
            <p>Status: {snapshot?.data_freshness?.scheduler_status || 'unknown'}</p>
            <p>Lag: {snapshot?.data_freshness?.scheduler_lag_seconds ?? 'n/a'}s</p>
            <p>Generated: {formatDateTime(snapshot?.generated_at)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Notification Destinations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(snapshot?.notification_destinations?.destinations || []).map((destination) => (
            <div key={destination.channel} className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
              <div className="font-medium">{destination.channel.toUpperCase()}</div>
              <div className="text-xs text-slate-500">
                configured: {destination.configured ? 'yes' : 'no'} · enabled: {destination.enabled ? 'yes' : 'no'}
              </div>
              <div className="text-xs text-slate-500">
                success: {formatDateTime(destination.last_success_at)} · error: {formatDateTime(destination.last_error_at)}
              </div>
            </div>
          ))}
          {(snapshot?.notification_destinations?.destinations || []).length === 0 && (
            <p className="text-slate-500">No destination telemetry available.</p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Provider Diagnostics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(snapshot?.provider_diagnostics || []).map((item) => (
            <div key={item.provider} className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
              <div className="font-medium uppercase">{item.provider}</div>
              <div className="text-xs text-slate-500">
                configured: {item.configured ? 'yes' : 'no'} · missing: {(item.missing_settings || []).join(', ') || 'none'}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
