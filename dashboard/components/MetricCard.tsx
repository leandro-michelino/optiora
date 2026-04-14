'use client'

import { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  color: string
  trend?: string
}

export function MetricCard({ icon: Icon, label, value, color, trend }: MetricCardProps) {
  return (
    <Card className={cn('border-0 text-white shadow-md', color)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="rounded-lg bg-white/20 p-2">
            <Icon className="w-5 h-5" />
          </div>
          {trend && (
            <span className="text-xs font-medium bg-white/20 px-2 py-1 rounded-full">
              {trend}
            </span>
          )}
        </div>
        <div className="mt-4">
          <p className="text-sm font-medium opacity-90">{label}</p>
          <p className="text-3xl font-bold mt-1 tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
