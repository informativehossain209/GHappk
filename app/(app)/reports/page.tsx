'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { Transaction, Category } from '@/types'
import { formatCurrency, formatShortDate, toBengaliNumber } from '@/lib/utils'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

type Filter = 'monthly' | 'yearly' | 'custom'

export default function ReportsPage() {
  const { user } = useAuthStore()
  const [filter, setFilter] = useState<Filter>('monthly')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })

  const fetchTransactions = useCallback(async () => {
    if (!user) return
    setLoading(true)
    let start: string, end: string

    if (filter === 'monthly') {
      const [y, m] = selectedMonth.split('-').map(Number)
      start = `${y}-${String(m).padStart(2, '0')}-01`
      const last = new Date(y, m, 0).getDate()
      end = `${y}-${String(m).padStart(2, '0')}-${last}`
    } else if (filter === 'yearly') {
      const y = new Date().getFullYear()
      start = `${y}-01-01`
      end = `${y}-12-31`
    } else {
      const y = new Date().getFullYear()
      start = `${y}-01-01`
      end = `${y}-12-31`
    }

    const { data } = await supabase
      .from('transactions')
      .select('*, category:categories(name, icon, color)')
      .eq('user_id', user.id)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })

    setTransactions(data || [])
    setLoading(false)
  }, [user, filter, selectedMonth])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  const income = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const savings = income - expense
  const savingsPct = income > 0 ? Math.round((savings / income) * 100) : 0

  // Category breakdown for expense
  const catBreakdown: Record<string, { name: string; icon: string; color: string; amount: number }> = {}
  transactions.filter((t) => t.type === 'expense').forEach((t) => {
    const key = t.category_id
    if (!catBreakdown[key]) {
      catBreakdown[key] = {
        name: t.category?.name || 'অন্যান্য',
        icon: t.category?.icon || '📦',
        color: t.category?.color || '#64748B',
        amount: 0,
      }
    }
    catBreakdown[key].amount += t.amount
  })
  const pieData = Object.values(catBreakdown).sort((a, b) => b.amount - a.amount).slice(0, 6)

  // Group by date
  const grouped: Record<string, Transaction[]> = {}
  transactions.forEach((t) => {
    if (!grouped[t.date]) grouped[t.date] = []
    grouped[t.date].push(t)
  })

  const filterLabels: Record<Filter, string> = { monthly: 'মাসিক', yearly: 'বার্ষিক', custom: 'কাস্টম' }
  const bengaliMonths = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রি', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে']

  return (
    <div className="min-h-full bg-bg">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-4 shadow-sm">
        <h1 className="text-xl font-bold text-gray-800 mb-4">📊 রিপোর্ট</h1>
        <div className="flex gap-2">
          {(['monthly', 'yearly'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filter === f ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500'}`}
            >
              {filterLabels[f]}
            </button>
          ))}
          {filter === 'monthly' && (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="ml-auto text-sm text-gray-600 bg-gray-100 rounded-xl px-3 py-2 focus:outline-none"
            />
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">আয়</p>
            <p className="text-success font-bold text-sm">{formatCurrency(income)}</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">খরচ</p>
            <p className="text-danger font-bold text-sm">{formatCurrency(expense)}</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">সঞ্চয়</p>
            <p className={`font-bold text-sm ${savings >= 0 ? 'text-primary-600' : 'text-danger'}`}>{toBengaliNumber(savingsPct)}%</p>
          </div>
        </div>

        {/* Pie Chart */}
        {pieData.length > 0 && (
          <div className="card p-4">
            <h3 className="font-semibold text-gray-700 mb-3">খরচের বিভাজন</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="amount"
                  nameKey="name"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Category List */}
        {pieData.length > 0 && (
          <div className="card p-4">
            <h3 className="font-semibold text-gray-700 mb-3">ক্যাটাগরি অনুযায়ী</h3>
            <div className="space-y-3">
              {pieData.map((cat) => (
                <div key={cat.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span>{cat.icon}</span>
                      <span className="text-sm text-gray-700">{cat.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-800">{formatCurrency(cat.amount)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(cat.amount / expense) * 100}%`, backgroundColor: cat.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transaction Timeline */}
        <div>
          <h3 className="font-semibold text-gray-700 mb-3">লেনদেনের তালিকা</h3>
          {loading ? (
            <div className="card p-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="card p-8 text-center">
              <span className="text-4xl block mb-2">📭</span>
              <p className="text-gray-400 text-sm">কোনো লেনদেন পাওয়া যায়নি</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(grouped)
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([date, txList]) => {
                  const dayIncome = txList.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
                  const dayExpense = txList.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
                  return (
                    <div key={date} className="card overflow-hidden">
                      <div className="px-4 py-2 bg-gray-50 flex items-center justify-between border-b border-gray-100">
                        <p className="text-xs font-semibold text-gray-500">{formatShortDate(date)}</p>
                        <div className="flex gap-3 text-xs">
                          {dayIncome > 0 && <span className="text-success">+{formatCurrency(dayIncome)}</span>}
                          {dayExpense > 0 && <span className="text-danger">-{formatCurrency(dayExpense)}</span>}
                        </div>
                      </div>
                      {txList.map((tx) => (
                        <div key={tx.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                            style={{ backgroundColor: (tx.category?.color || '#64748B') + '20' }}
                          >
                            {tx.category?.icon || '📦'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{tx.category?.name || 'অন্যান্য'}</p>
                            {tx.note && <p className="text-xs text-gray-400 truncate">{tx.note}</p>}
                          </div>
                          <p className={`text-sm font-bold ${tx.type === 'income' ? 'text-success' : 'text-danger'}`}>
                            {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
