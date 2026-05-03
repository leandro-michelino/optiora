'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { type ChartCostTrendPoint } from '@/lib/cost-trend'

export type CostTrendPoint = ChartCostTrendPoint

const defaultData: CostTrendPoint[] = []

const chartConfig = {
  aws:   { label: 'AWS',   color: '#f59e0b' },
  azure: { label: 'Azure', color: '#3b82f6' },
  gcp:   { label: 'GCP',   color: '#ef4444' },
  oci:   { label: 'OCI',   color: '#10b981' },
} satisfies ChartConfig

export function CostChart({ data = defaultData }: { data?: CostTrendPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorAws" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorAzure" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorGcp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorOci" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => [`$${Number(value).toLocaleString()}`, '']}
            />
          }
        />
        <Legend />
        <Area type="monotone" dataKey="aws"   stroke="#f59e0b" fillOpacity={1} fill="url(#colorAws)" />
        <Area type="monotone" dataKey="azure" stroke="#3b82f6" fillOpacity={1} fill="url(#colorAzure)" />
        <Area type="monotone" dataKey="gcp"   stroke="#ef4444" fillOpacity={1} fill="url(#colorGcp)" />
        <Area type="monotone" dataKey="oci"   stroke="#10b981" fillOpacity={1} fill="url(#colorOci)" />
      </AreaChart>
    </ChartContainer>
  )
}
