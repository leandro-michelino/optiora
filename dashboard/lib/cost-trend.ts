'use client'

import { CostResponse, CostTrendResponse } from './types'

export interface ChartCostTrendPoint {
  month: string
  [provider: string]: string | number
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function makeFallbackTrendData(costs: CostResponse | null): ChartCostTrendPoint[] {
  void costs
  return []
}

export function transformApiTrend(response: CostTrendResponse): ChartCostTrendPoint[] {
  const byPeriod: Record<string, ChartCostTrendPoint> = {}

  for (const point of response.points) {
    const label = point.period_start.slice(0, 7)
    if (!byPeriod[label]) {
      byPeriod[label] = { month: label }
    }

    const existing = byPeriod[label][point.provider]
    byPeriod[label][point.provider] =
      typeof existing === 'number' ? existing + point.total_cost_usd : point.total_cost_usd
  }

  return Object.values(byPeriod).sort((left, right) => String(left.month).localeCompare(String(right.month)))
}

export function getTrendPointTotal(point: ChartCostTrendPoint): number {
  return Object.entries(point)
    .filter(([key]) => key !== 'month')
    .reduce((sum, [, value]) => sum + (typeof value === 'number' ? value : 0), 0)
}

export function formatTrendMonthLabel(value: string): string {
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-')
    const monthIndex = Number(month) - 1
    if (monthIndex >= 0 && monthIndex < MONTH_LABELS.length) {
      return `${MONTH_LABELS[monthIndex]} ${year}`
    }
  }
  return value
}
