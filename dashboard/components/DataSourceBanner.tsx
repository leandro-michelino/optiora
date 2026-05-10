'use client'

import { AlertTriangle, Database, Loader2, Radio, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { DataSourceBannerState } from '@/lib/data-source'

function toneClasses(state: DataSourceBannerState['state']): string {
  switch (state) {
    case 'checking':
      return 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200'
    case 'imported':
      return 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100'
    case 'live':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
    case 'partial':
      return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
    default:
      return 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100'
  }
}

function StateIcon({ state }: { state: DataSourceBannerState['state'] }) {
  if (state === 'checking') {
    return <Loader2 className="h-4 w-4 animate-spin" />
  }
  if (state === 'imported') {
    return <Database className="h-4 w-4" />
  }
  if (state === 'live') {
    return <Radio className="h-4 w-4" />
  }
  if (state === 'partial') {
    return <AlertTriangle className="h-4 w-4" />
  }
  return <ShieldAlert className="h-4 w-4" />
}

export function DataSourceBanner({ status }: { status: DataSourceBannerState }) {
  return (
    <Alert
      data-testid="data-source-banner"
      data-state={status.state}
      className={toneClasses(status.state)}
    >
      <StateIcon state={status.state} />
      <div className="flex flex-wrap items-center gap-2">
        <AlertTitle>{status.title}</AlertTitle>
        <Badge variant="outline" className="rounded-md border-current/30 bg-white/60 dark:bg-slate-950/30">
          {status.label}
        </Badge>
      </div>
      <AlertDescription className="text-current/80">
        {status.description}
      </AlertDescription>
    </Alert>
  )
}
