'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  type ChartCostTrendPoint,
  formatTrendMonthLabel,
  getTrendPointTotal,
} from '@/lib/cost-trend'

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

function getProviderKeys(data: ChartCostTrendPoint[]): string[] {
  return Array.from(
    new Set(
      data.flatMap((point) => Object.keys(point).filter((key) => key !== 'month')),
    ),
  )
}

function getProviderValue(point: ChartCostTrendPoint | undefined, provider: string): number {
  const value = point?.[provider]
  return typeof value === 'number' ? value : 0
}

export function MonthlyComparisonCard({
  data,
  title = 'Monthly Comparison',
  className,
}: {
  data: ChartCostTrendPoint[]
  title?: string
  className?: string
}) {
  const months = useMemo(() => Array.from(new Set(data.map((point) => String(point.month)))), [data])
  const providerKeys = useMemo(() => getProviderKeys(data), [data])
  const [fromMonth, setFromMonth] = useState('')
  const [toMonth, setToMonth] = useState('')

  useEffect(() => {
    if (months.length === 0) {
      setFromMonth('')
      setToMonth('')
      return
    }

    const nextFrom = months[Math.max(0, months.length - 2)]
    const nextTo = months[months.length - 1]

    setFromMonth((current) => (months.includes(current) ? current : nextFrom))
    setToMonth((current) => (months.includes(current) ? current : nextTo))
  }, [months])

  const fromPoint = useMemo(
    () => data.find((point) => String(point.month) === fromMonth),
    [data, fromMonth],
  )
  const toPoint = useMemo(
    () => data.find((point) => String(point.month) === toMonth),
    [data, toMonth],
  )

  if (months.length < 2) {
    const currentPoint = data.length > 0 ? data[data.length - 1] : undefined
    const currentTotal = currentPoint ? getTrendPointTotal(currentPoint) : 0
    const currentMonth = currentPoint ? String(currentPoint.month) : ''

    return (
      <Card className={className}>
        <CardHeader className="border-b border-slate-200 dark:border-slate-700">
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {currentPoint ? (
            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {formatTrendMonthLabel(currentMonth)}
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                {formatCurrency(currentTotal)}
              </p>
            </div>
          ) : null}
          <div className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
            Month-over-month comparison needs at least two distinct monthly periods.
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!fromPoint || !toPoint) {
    return null
  }

  const fromTotal = getTrendPointTotal(fromPoint)
  const toTotal = getTrendPointTotal(toPoint)
  const delta = toTotal - fromTotal
  const deltaPercent = fromTotal > 0 ? (delta / fromTotal) * 100 : null
  const isSavings = delta < 0
  const isIncrease = delta > 0
  const providerDeltas = providerKeys
    .map((provider) => {
      const previousValue = getProviderValue(fromPoint, provider)
      const currentValue = getProviderValue(toPoint, provider)
      return {
        provider,
        previousValue,
        currentValue,
        delta: currentValue - previousValue,
      }
    })
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))

  return (
    <Card className={className}>
      <CardHeader className="border-b border-slate-200 dark:border-slate-700">
        <CardTitle className="text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">From month</span>
            <select
              value={fromMonth}
              onChange={(event) => setFromMonth(event.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {months.map((month) => (
                <option key={`from-${month}`} value={month}>
                  {formatTrendMonthLabel(month)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">To month</span>
            <select
              value={toMonth}
              onChange={(event) => setToMonth(event.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {months.map((month) => (
                <option key={`to-${month}`} value={month}>
                  {formatTrendMonthLabel(month)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {formatTrendMonthLabel(fromMonth)}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              {formatCurrency(fromTotal)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {formatTrendMonthLabel(toMonth)}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              {formatCurrency(toTotal)}
            </p>
          </div>
          <div
            className={cn(
              'rounded-lg border p-4',
              isSavings && 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30',
              isIncrease && 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30',
              !isSavings && !isIncrease && 'border-slate-200 dark:border-slate-700',
            )}
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {isSavings ? <ArrowDownRight className="h-4 w-4 text-emerald-600" /> : null}
              {isIncrease ? <ArrowUpRight className="h-4 w-4 text-rose-600" /> : null}
              {!isSavings && !isIncrease ? <Minus className="h-4 w-4" /> : null}
              Change
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              {delta > 0 ? '+' : ''}{formatCurrency(delta)}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {deltaPercent === null
                ? 'No baseline for percentage change'
                : `${delta > 0 ? '+' : ''}${deltaPercent.toFixed(1)}% ${isSavings ? 'cost savings' : isIncrease ? 'cost increase' : 'change'}`}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-900 dark:text-white">Provider deltas</p>
          <div className="space-y-2">
            {providerDeltas.map((item) => (
              <div
                key={item.provider}
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
              >
                <span className="font-medium uppercase text-slate-900 dark:text-white">{item.provider}</span>
                <span className={cn(
                  'font-medium',
                  item.delta < 0 && 'text-emerald-600 dark:text-emerald-400',
                  item.delta > 0 && 'text-rose-600 dark:text-rose-400',
                  item.delta === 0 && 'text-slate-500 dark:text-slate-400',
                )}>
                  {item.delta > 0 ? '+' : ''}{formatCurrency(item.delta)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
