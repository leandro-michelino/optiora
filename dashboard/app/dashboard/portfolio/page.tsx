'use client'

import { useEffect, useState } from 'react'
import { Building2, Loader, RefreshCw } from 'lucide-react'
import { fetchPartnerCustomerPortfolio, forceNextApiRefresh } from '@/lib/api'
import { PartnerCustomerPortfolioResponse } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Expander } from '@/components/ui/expander'

function fmt(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(value?: string | null): string {
  if (!value) return 'No activity'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function healthTone(status: string): string {
  if (status === 'healthy') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
  if (status === 'attention') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
}

export default function PortfolioPage() {
  const [data, setData] = useState<PartnerCustomerPortfolioResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadPortfolio() {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchPartnerCustomerPortfolio())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load customer portfolio.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadPortfolio() }, [])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-md">MSP / Partner</Badge>
            {data?.partner_mode_enabled ? (
              <Badge className="rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">Partner mode enabled</Badge>
            ) : null}
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            {data?.white_label.brand_name || 'Customer Portfolio'}
          </h1>
          <p className="mt-2 max-w-3xl text-slate-600 dark:text-slate-400">
            Consolidated customer health, spend, savings, and alert posture across organizations available to your account.
          </p>
        </div>
        <Button variant="outline" onClick={() => { forceNextApiRefresh(); void loadPortfolio() }} disabled={loading} className="rounded-lg">
          {loading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center text-slate-500">
          <Loader className="mr-2 h-5 w-5 animate-spin" />
          Loading portfolio...
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="rounded-lg">
              <CardContent className="p-4">
                <p className="text-xs uppercase text-slate-500">Customers</p>
                <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{data.customer_count}</p>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardContent className="p-4">
                <p className="text-xs uppercase text-slate-500">Portfolio Spend</p>
                <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{fmt(data.total_cost_usd)}</p>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardContent className="p-4">
                <p className="text-xs uppercase text-slate-500">Savings Identified</p>
                <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{fmt(data.savings_identified_usd)}</p>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardContent className="p-4">
                <p className="text-xs uppercase text-slate-500">Open Alerts</p>
                <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{data.open_alert_count}</p>
              </CardContent>
            </Card>
          </div>

          <Expander
            title="Customers"
            description="Customer health, spend, savings, providers, scans, and latest activity."
            icon={<Building2 className="h-5 w-5" />}
            defaultOpen
          >
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Customers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/60">
                    <tr>
                      <th className="px-4 py-3 font-medium">Customer</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Spend</th>
                      <th className="px-4 py-3 font-medium text-right">Savings</th>
                      <th className="px-4 py-3 font-medium">Providers</th>
                      <th className="px-4 py-3 font-medium text-right">Accounts</th>
                      <th className="px-4 py-3 font-medium text-right">Scans</th>
                      <th className="px-4 py-3 font-medium">Last Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.customers.map(customer => (
                      <tr key={customer.organization_id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900 dark:text-white">{customer.customer_name}</p>
                          <p className="text-xs text-slate-500">{customer.customer_id} · {customer.role} · {customer.plan}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`rounded-md border ${healthTone(customer.health_status)}`}>{customer.health_status.replace('_', ' ')}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{fmt(customer.total_cost_usd)}</td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{fmt(customer.savings_identified_usd)}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{customer.providers.length ? customer.providers.join(', ').toUpperCase() : 'None'}</td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{customer.account_count}</td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{customer.scan_count}</td>
                        <td className="px-4 py-3 text-slate-500">{formatDate(customer.last_activity_at)}</td>
                      </tr>
                    ))}
                    {data.customers.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">No customer organizations available.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              {data.white_label.show_powered_by ? (
                <p className="mt-3 text-xs text-slate-500">Powered by OptiOra partner portfolio analytics.</p>
              ) : null}
            </CardContent>
          </Card>
          </Expander>
        </>
      ) : null}
    </div>
  )
}
