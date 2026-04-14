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

export interface CostTrendPoint {
  month: string
  [provider: string]: string | number
}

const defaultData: CostTrendPoint[] = [
  { month: 'Jan', aws: 4200, azure: 2400, gcp: 1800, oci: 1200 },
  { month: 'Feb', aws: 4500, azure: 2600, gcp: 1900, oci: 1300 },
  { month: 'Mar', aws: 4800, azure: 2800, gcp: 2100, oci: 1400 },
  { month: 'Apr', aws: 5100, azure: 3000, gcp: 2200, oci: 1500 },
  { month: 'May', aws: 5200, azure: 3100, gcp: 2300, oci: 1550 },
  { month: 'Jun', aws: 5400, azure: 3400, gcp: 2350, oci: 1500 },
  { month: 'Jul', aws: 5600, azure: 3200, gcp: 2280, oci: 1480 },
  { month: 'Aug', aws: 5200, azure: 3100, gcp: 2200, oci: 1450 },
  { month: 'Sep', aws: 5300, azure: 3300, gcp: 2400, oci: 1500 },
  { month: 'Oct', aws: 5400, azure: 3400, gcp: 2350, oci: 1520 },
  { month: 'Nov', aws: 5500, azure: 3500, gcp: 2400, oci: 1550 },
  { month: 'Dec', aws: 5800, azure: 3600, gcp: 2500, oci: 1600 },
]

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
