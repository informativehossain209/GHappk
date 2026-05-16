'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatShortDate, getGreeting, getCurrentMonthRange } from '@/lib/utils'
import { Transaction, Notice, Todo } from '@/types'
import Link from 'next/link'

export default function HomePage() {
  const { user } = useAuthStore()
  const [summary, setSummary] = useState({ income: 0, expense: 0 })
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { start, end } = getCurrentMonthRange()

    const [txRes, noticeRes, todoRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*, category:categories(name, icon, color)')
        .eq('user_id', user.id)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false }),
      supabase
        .from('notices')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('todos')
        .select('*')
        .eq('user_id', user.id)
        .eq('completed', false)
        .order('date', { ascending: true })
        .limit(3),
    ])

    const txData = txRes.data || []
    const income = txData.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = txData.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    setSummary({ income, expense })
    setTransactions(txData.slice(0, 5))
    setNotices(noticeRes.data || [])
    setTodos(todoRes.data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetchData() }, [fetchData])

  const dismissNotice = async (id: string) => {
    await supabase.from('notices').update({ is_read: true }).eq('id', id)
    setNotices((n) => n.filter((no) => no.id !== id))
  }

  const completeTodo = async (id: string) => {
    await supabase.from('todos').update({ completed: true }).eq('id', id)
    setTodos((t) => t.filter((td) => td.id !== id))
  }

  const savings = summary.income - summary.expense

  const bengaliMonths = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর']
  const currentMonth = bengaliMonths[new Date().getMonth()]

  return (
    <div className="min-h-full bg-bg">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary-600 via-primary-500 to-primary-700 px-5 pt-12 pb-24 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-4 w-32 h-32 bg-white rounded-full" />
          <div className="absolute bottom-0 left-8 w-20 h-20 bg-white rounded-full" />
        </div>
        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="text-white/70 text-sm">{getGreeting()},</p>
              <h2 className="text-white text-xl font-bold">{user?.name} 👋</h2>
            </div>
            <Link href="/settings" className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <span className="text-lg">⚙️</span>
            </Link>
          </div>
          <p className="text-white/60 text-xs mt-1">{currentMonth} মাসের হিসাব</p>

          {/* Balance */}
          <div className="mt-6 bg-white/15 backdrop-blur-md rounded-2xl p-4">
            <p className="text-white/70 text-xs mb-1">এই মাসের সঞ্চয়</p>
            <p className={`text-3xl font-bold ${savings >= 0 ? 'text-white' : 'text-red-300'}`}>
              {formatCurrency(Math.abs(savings))}
              {savings < 0 && <span className="text-sm ml-1 opacity-80">(ঘাটতি)</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-5 -mt-12 relative z-10">
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4 bg-white border-l-4 border-success">
            <p className="text-gray-500 text-xs mb-1">আয়</p>
            <p className="text-success font-bold text-lg">{formatCurrency(summary.income)}</p>
          </div>
          <div className="card p-4 bg-white border-l-4 border-danger">
            <p className="text-gray-500 text-xs mb-1">খরচ</p>
            <p className="text-danger font-bold text-lg">{formatCurrency(summary.expense)}</p>
          </div>
        </div>
      </div>

      <div className="px-5 mt-4 pb-4 space-y-4">
        {/* Smart Notices */}
        {notices.length > 0 && (
          <div className="space-y-2">
            {notices.map((notice) => (
              <div key={notice.id} className={`card p-4 flex items-start gap-3 border-l-4 ${
                notice.type === 'warning' ? 'border-accent-400' :
                notice.type === 'success' ? 'border-success' :
                notice.type === 'alert' ? 'border-danger' : 'border-primary-400'
              }`}>
                <span className="text-xl">
                  {notice.type === 'warning' ? '⚠️' : notice.type === 'success' ? '✅' : notice.type === 'alert' ? '🔔' : 'ℹ️'}
                </span>
                <p className="text-sm text-gray-700 flex-1">{notice.message}</p>
                <button onClick={() => dismissNotice(notice.id)} className="text-gray-400 text-lg leading-none">×</button>
              </div>
            ))}
          </div>
        )}

        {/* Todos */}
        {todos.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-700">📋 রিমাইন্ডার</h3>
            </div>
            <div className="card p-3 space-y-2">
              {todos.map((todo) => (
                <div key={todo.id} className="flex items-center gap-3 py-1">
                  <button
                    onClick={() => completeTodo(todo.id)}
                    className="w-5 h-5 border-2 border-primary-400 rounded-full flex-shrink-0 hover:bg-primary-50"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700">{todo.title}</p>
                    {todo.amount && <p className="text-xs text-gray-500">{formatCurrency(todo.amount)}</p>}
                  </div>
                  <p className="text-xs text-gray-400">{formatShortDate(todo.date)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3">
          <Link href="/add" className="card p-4 text-center active:scale-95 transition-all">
            <span className="text-2xl block mb-1">💸</span>
            <p className="text-xs text-gray-600 font-medium">খরচ যোগ</p>
          </Link>
          <Link href="/reports" className="card p-4 text-center active:scale-95 transition-all">
            <span className="text-2xl block mb-1">📊</span>
            <p className="text-xs text-gray-600 font-medium">রিপোর্ট</p>
          </Link>
          <Link href="/budget" className="card p-4 text-center active:scale-95 transition-all">
            <span className="text-2xl block mb-1">🎯</span>
            <p className="text-xs text-gray-600 font-medium">বাজেট</p>
          </Link>
        </div>

        {/* Recent Transactions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-700">🕐 সাম্প্রতিক লেনদেন</h3>
            <Link href="/reports" className="text-xs text-primary-500">সব দেখুন →</Link>
          </div>

          {loading ? (
            <div className="card p-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="card p-8 text-center">
              <span className="text-4xl block mb-2">📝</span>
              <p className="text-gray-500 text-sm">এখনো কোনো লেনদেন নেই</p>
              <Link href="/add" className="text-primary-500 text-sm font-medium mt-1 block">প্রথম লেনদেন যোগ করুন →</Link>
            </div>
          ) : (
            <div className="card divide-y divide-gray-50">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 p-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: (tx.category?.color || '#64748B') + '20' }}>
                    {tx.category?.icon || '📦'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{tx.category?.name || 'অন্যান্য'}</p>
                    {tx.note && <p className="text-xs text-gray-400 truncate">{tx.note}</p>}
                    <p className="text-xs text-gray-400">{formatShortDate(tx.date)}</p>
                  </div>
                  <p className={`font-semibold text-sm ${tx.type === 'income' ? 'text-success' : 'text-danger'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
