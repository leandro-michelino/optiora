'use client'

import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatTrendMonthLabel, type ChartCostTrendPoint } from '@/lib/cost-trend'

export type CostTrendPoint = ChartCostTrendPoint

const defaultData: CostTrendPoint[] = []

const providerLabels: Record<string, string> = {
  aws: 'AWS',
  azure: 'Azure',
  gcp: 'GCP',
  oci: 'OCI',
  current: 'Current',
  imported: 'Imported',
  'multi-cloud': 'Multi-cloud',
  unknown: 'Unknown',
}

const providerColors: Record<string, string> = {
  aws: '#f59e0b',
  azure: '#3b82f6',
  gcp: '#ef4444',
  oci: '#10b981',
  current: '#64748b',
  imported: '#8b5cf6',
  'multi-cloud': '#06b6d4',
  unknown: '#64748b',
}

const fallbackColors = ['#14b8a6', '#6366f1', '#ec4899', '#84cc16', '#f97316', '#0ea5e9']

function getSeriesKeys(data: CostTrendPoint[]): string[] {
  return Array.from(
    new Set(
      data.flatMap((point) =>
        Object.entries(point)
          .filter(([key, value]) => key !== 'month' && typeof value === 'number')
          .map(([key]) => key),
      ),
    ),
  )
}

function formatProviderLabel(provider: string): string {
  if (providerLabels[provider]) return providerLabels[provider]

  return provider
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatAxisCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}k`
  }
  return `$${value.toFixed(0)}`
}

function gradientId(provider: string): string {
  return `cost-trend-${provider.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

export function CostChart({ data = defaultData }: { data?: CostTrendPoint[] }) {
  const seriesKeys = useMemo(() => getSeriesKeys(data), [data])
  const chartConfig = useMemo(
    () =>
      seriesKeys.reduce<ChartConfig>((config, key, index) => {
        config[key] = {
          label: formatProviderLabel(key),
          color: providerColors[key] || fallbackColors[index % fallbackColors.length],
        }
        return config
      }, {}),
    [seriesKeys],
  )

  if (data.length === 0 || seriesKeys.length === 0) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
        Cost trend data will appear after imported billing rows, period summaries, or live provider snapshots are available.
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <AreaChart data={data}>
        <defs>
          {seriesKeys.map((key, index) => {
            const color = providerColors[key] || fallbackColors[index % fallbackColors.length]
            return (
              <linearGradient key={key} id={gradientId(key)} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.36} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            )
          })}
        </defs>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} tickFormatter={(value) => formatTrendMonthLabel(String(value))} />
        <YAxis width={72} tick={{ fontSize: 12 }} tickFormatter={(value) => formatAxisCurrency(Number(value))} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) => formatTrendMonthLabel(String(value))}
              formatter={(value, name) => [
                `$${Number(value).toLocaleString()}`,
                formatProviderLabel(String(name)),
              ]}
            />
          }
        />
        <Legend formatter={(value) => formatProviderLabel(String(value))} />
        {seriesKeys.map((key, index) => {
          const color = providerColors[key] || fallbackColors[index % fallbackColors.length]
          return (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stroke={color}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#${gradientId(key)})`}
              connectNulls
              activeDot={{ r: 4 }}
            />
          )
        })}
      </AreaChart>
    </ChartContainer>
  )
}
