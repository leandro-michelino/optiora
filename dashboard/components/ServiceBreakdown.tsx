'use client'

import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts'

const data = [
  { name: 'AWS', value: 42 },
  { name: 'Azure', value: 27 },
  { name: 'GCP', value: 19 },
  { name: 'OCI', value: 12 },
]

const COLORS = ['#f59e0b', '#3b82f6', '#ef4444', '#10b981']

export function ServiceBreakdown() {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, value }) => `${name} ${value}%`}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  )
}
