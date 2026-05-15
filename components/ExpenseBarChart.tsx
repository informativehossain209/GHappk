'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { formatTaka } from '@/lib/utils'

interface Props {
  data: { name: string; icon: string; total: number }[]
}

const COLORS = ['#1a6fb5', '#2d8de0', '#4da3f0', '#6ab8ff', '#87ccff', '#a3d9ff']

export default function ExpenseBarChart({ data }: Props) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
        <span>📊</span> ক্যাটাগরি অনুযায়ী খরচ
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={90}
            tick={{ fontSize: 11, fontFamily: 'Hind Siliguri' }}
            tickFormatter={(v, i) => `${data[i]?.icon || ''} ${v}`}
          />
          <Tooltip
            formatter={(v: any) => [formatTaka(v), 'খরচ']}
            labelStyle={{ fontFamily: 'Hind Siliguri' }}
            contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
          />
          <Bar dataKey="total" radius={[0, 8, 8, 0]} maxBarSize={28}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
