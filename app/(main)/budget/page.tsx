'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'
import { formatTaka } from '@/lib/utils'
import { getMonthRange } from '@/lib/utils'

const PRESET_CATS = [
  { name: 'বাজার / খাবার', icon: '🍚' },
  { name: 'বাড়ি ভাড়া', icon: '🏠' },
  { name: 'বিল', icon: '⚡' },
  { name: 'চিকিৎসা', icon: '💊' },
  { name: 'শিক্ষা', icon: '📚' },
  { name: 'যাতায়াত', icon: '🚌' },
]

export default function BudgetPage() {
  const supabase = createBrowserClient()
  const [budgets, setBudgets] = useState<any[]>([])
  const [spending, setSpending] = useState<Record<string, number>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    // Load budgets
    const { data: budgetData } = await supabase
      .from('budgets')
      .select('*, categories(name, icon)')
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('year', year)
    setBudgets(budgetData || [])

    // Load all categories
    const { data: cats } = await supabase
      .from('categories')
      .select('*')
      .or(`is_preset.eq.true,user_id.eq.${user.id}`)
      .eq('type', 'expense')
    setCategories(cats || [])

    // Load spending this month
    const { start, end } = getMonthRange(1)
    const { data: txns } = await supabase
      .from('transactions')
      .select('amount, category_id, categories(name)')
      .eq('user_id', user.id)
      .eq('type', 'expense')
      .gte('transaction_date', start)
      .lte('transaction_date', end)

    const spendMap: Record<string, number> = {}
    for (const t of (txns || [])) {
      const k = t.categories?.name || 'other'
      spendMap[k] = (spendMap[k] || 0) + Number(t.amount)
    }
    setSpending(spendMap)
    setLoading(false)
  }

  const saveBudget = async (categoryId: string, catName: string) => {
    if (!editAmount) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const now = new Date()
    const existing = budgets.find(b => b.category_id === categoryId)

    if (existing) {
      await supabase.from('budgets').update({ monthly_limit: parseFloat(editAmount) }).eq('id', existing.id)
    } else {
      await supabase.from('budgets').insert({
        user_id: user.id,
        category_id: categoryId,
        monthly_limit: parseFloat(editAmount),
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        alert_pct: 80,
      })
    }
    setEditing(null)
    setEditAmount('')
    load()
  }

  const getProgress = (catName: string, limit: number) => {
    const spent = spending[catName] || 0
    return { spent, pct: Math.min((spent / limit) * 100, 100) }
  }

  const budgetedCatIds = new Set(budgets.map(b => b.category_id))
  const unbudgetedCats = categories.filter(c => !budgetedCatIds.has(c.id))

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-primary px-4 pt-12 pb-6">
        <h1 className="text-white text-xl font-bold text-center">🎯 বাজেট</h1>
        <p className="text-blue-200 text-sm text-center mt-1">
          {new Date().toLocaleDateString('bn-BD', { month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {/* Existing budgets */}
        {budgets.map(budget => {
          const catName = budget.categories?.name || ''
          const catIcon = budget.categories?.icon || '📦'
          const { spent, pct } = getProgress(catName, budget.monthly_limit)
          const isOver = pct >= 100
          const isWarning = pct >= 80

          return (
            <div key={budget.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{catIcon}</span>
                  <span className="font-medium text-gray-800">{catName}</span>
                </div>
                <button
                  onClick={() => { setEditing(budget.category_id); setEditAmount(String(budget.monthly_limit)) }}
                  className="text-primary text-sm font-medium"
                >
                  সম্পাদন
                </button>
              </div>

              {editing === budget.category_id ? (
                <div className="flex gap-2 mt-2">
                  <input
                    type="number"
                    value={editAmount}
                    onChange={e => setEditAmount(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-primary"
                    inputMode="numeric"
                  />
                  <button onClick={() => saveBudget(budget.category_id, catName)}
                    className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium">সংরক্ষণ</button>
                  <button onClick={() => setEditing(null)}
                    className="px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm">বাতিল</button>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-sm text-gray-500 mb-1.5">
                    <span>{formatTaka(spent)} খরচ</span>
                    <span className={isOver ? 'text-red-500 font-medium' : ''}>
                      {formatTaka(budget.monthly_limit)} বাজেট
                    </span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isOver ? 'bg-red-500' : isWarning ? 'bg-amber-400' : 'bg-green-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {isOver && (
                    <p className="text-red-500 text-xs mt-1">⚠️ বাজেট অতিক্রম হয়েছে!</p>
                  )}
                  {isWarning && !isOver && (
                    <p className="text-amber-500 text-xs mt-1">⚡ বাজেটের {Math.round(pct)}% ব্যবহার হয়েছে</p>
                  )}
                </>
              )}
            </div>
          )
        })}

        {/* Add budget for unbudgeted categories */}
        {unbudgetedCats.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-3">বাজেট যোগ করুন</h3>
            <div className="space-y-2">
              {unbudgetedCats.slice(0, 6).map(cat => (
                <div key={cat.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <span className="flex items-center gap-2 text-gray-700">
                    <span>{cat.icon}</span>
                    <span>{cat.name}</span>
                  </span>
                  {editing === cat.id ? (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={editAmount}
                        onChange={e => setEditAmount(e.target.value)}
                        placeholder="৳ পরিমাণ"
                        className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary"
                        inputMode="numeric"
                        autoFocus
                      />
                      <button
                        onClick={() => saveBudget(cat.id, cat.name)}
                        className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs"
                      >✓</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditing(cat.id); setEditAmount('') }}
                      className="text-primary text-sm font-medium"
                    >+ বাজেট</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && budgets.length === 0 && (
          <div className="text-center py-12">
            <div className="text-5xl mb-3">🎯</div>
            <p className="text-gray-500 font-medium">এখনো কোনো বাজেট সেট করা হয়নি</p>
            <p className="text-gray-400 text-sm mt-1">উপরের ক্যাটাগরিতে বাজেট যোগ করুন</p>
          </div>
        )}
      </div>
    </div>
  )
}
