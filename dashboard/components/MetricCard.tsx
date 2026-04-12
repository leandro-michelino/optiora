'use client'

import { ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  color: string
}

export function MetricCard({ icon: Icon, label, value, color }: MetricCardProps) {
  return (
    <div className={`${color} rounded-lg p-6 text-white`}>
      <Icon className="w-8 h-8 mb-3 opacity-90" />
      <p className="text-sm opacity-90">{label}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
  )
}
