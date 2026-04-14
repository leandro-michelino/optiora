'use client'

import { PieChart, Pie, Cell, Legend } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

export interface ServiceBreakdownPoint {
  name: string
  label: string
  value: number
  cost?: number
}

const defaultData: ServiceBreakdownPoint[] = [
  { name: 'aws', label: 'AWS', value: 42 },
  { name: 'azure', label: 'Azure', value: 27 },
  { name: 'gcp', label: 'GCP', value: 19 },
  { name: 'oci', label: 'OCI', value: 12 },
]

const COLORS = ['#f59e0b', '#3b82f6', '#ef4444', '#10b981']

const chartConfig = {
  aws:   { label: 'AWS',   color: '#f59e0b' },
  azure: { label: 'Azure', color: '#3b82f6' },
  gcp:   { label: 'GCP',   color: '#ef4444' },
  oci:   { label: 'OCI',   color: '#10b981' },
} satisfies ChartConfig

export function ServiceBreakdown({ data = defaultData }: { data?: ServiceBreakdownPoint[] }) {
  const chartData = data.length > 0 ? data : defaultData

  return (
    <ChartContainer config={chartConfig} className="h-[250px] w-full">
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ payload, percent }) => `${payload.label} ${((percent ?? 0) * 100).toFixed(0)}%`}
          outerRadius={80}
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => [
                item.payload?.cost
                  ? `$${Number(item.payload.cost).toLocaleString()}`
                  : `${Number(value).toFixed(1)}%`,
                item.payload?.label ?? name,
              ]}
            />
          }
        />
        <Legend formatter={(value) => chartConfig[value as keyof typeof chartConfig]?.label ?? value} />
      </PieChart>
    </ChartContainer>
  )
}
