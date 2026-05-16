'use client'
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { Budget, Category } from '@/types'
import { formatCurrency, getCurrentMonth, getCurrentMonthRange, toBengaliNumber } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface BudgetWithSpent extends Budget {
  spent: number
  percentage: number
}

export default function BudgetPage() {
  const { user } = useAuthStore()
  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newBudget, setNewBudget] = useState({ category_id: '', monthly_limit: '' })

  const fetchBudgets = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { start, end } = getCurrentMonthRange()
    const month = getCurrentMonth()

    const [budgetRes, txRes, catRes] = await Promise.all([
      supabase.from('budgets').select('*, category:categories(name,icon,color)').eq('user_id', user.id).eq('month', month),
      supabase.from('transactions').select('*').eq('user_id', user.id).eq('type', 'expense').gte('date', start).lte('date', end),
      supabase.from('categories').select('*').eq('user_id', user.id).eq('type', 'expense'),
    ])

    const txData = txRes.data || []
    const budgetData = (budgetRes.data || []).map((b) => {
      const spent = txData.filter((t) => t.category_id === b.category_id).reduce((s: number, t: { amount: number }) => s + t.amount, 0)
      const percentage = Math.min(Math.round((spent / b.monthly_limit) * 100), 100)
      return { ...b, spent, percentage }
    })

    setBudgets(budgetData)
    setCategories(catRes.data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetchBudgets() }, [fetchBudgets])

  const handleAddBudget = async () => {
    if (!newBudget.category_id || !newBudget.monthly_limit || !user) return
    const month = getCurrentMonth()
    await supabase.from('budgets').upsert({
      user_id: user.id,
      category_id: newBudget.category_id,
      monthly_limit: parseFloat(newBudget.monthly_limit),
      month,
    }, { onConflict: 'user_id,category_id,month' })
    setNewBudget({ category_id: '', monthly_limit: '' })
    setShowAdd(false)
    fetchBudgets()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('budgets').delete().eq('id', id)
    fetchBudgets()
  }

  const usedCatIds = budgets.map((b) => b.category_id)
  const availableCats = categories.filter((c) => !usedCatIds.includes(c.id))

  const bengaliMonths = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর']
  const currentMonth = bengaliMonths[new Date().getMonth()]

  return (
    <div className="min-h-full bg-bg">
      <div className="bg-white px-5 pt-12 pb-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">💰 বাজেট</h1>
            <p className="text-xs text-gray-400 mt-0.5">{currentMonth} মাসের বাজেট</p>
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-xl active:scale-95 transition-all"
          >
            + নতুন
          </button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Add Budget Form */}
        {showAdd && (
          <div className="card p-4 animate-slide-up">
            <h3 className="font-semibold text-gray-700 mb-3">নতুন বাজেট সেট করুন</h3>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {availableCats.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setNewBudget({ ...newBudget, category_id: cat.id })}
                  className={cn('p-2 rounded-xl flex flex-col items-center gap-1 transition-all border-2', newBudget.category_id === cat.id ? 'border-primary-500 bg-primary-50' : 'border-gray-100')}
                >
                  <span className="text-xl">{cat.icon}</span>
                  <span className="text-[10px] text-gray-600 text-center">{cat.name}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <input
                type="number"
                value={newBudget.monthly_limit}
                onChange={(e) => setNewBudget({ ...newBudget, monthly_limit: e.target.value })}
                placeholder="বাজেট পরিমাণ"
                inputMode="numeric"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-400"
              />
              <button
                onClick={handleAddBudget}
                disabled={!newBudget.category_id || !newBudget.monthly_limit}
                className="px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 active:scale-95 transition-all"
              >
                সংরক্ষণ
              </button>
            </div>
          </div>
        )}

        {/* Budget List */}
        {loading ? (
          <div className="card p-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : budgets.length === 0 ? (
          <div className="card p-8 text-center">
            <span className="text-4xl block mb-2">🎯</span>
            <p className="text-gray-500 text-sm mb-1">কোনো বাজেট সেট করা নেই</p>
            <p className="text-gray-400 text-xs">উপরে + নতুন বোতামে ক্লিক করুন</p>
          </div>
        ) : (
          <div className="space-y-3">
            {budgets.map((budget) => {
              const color = budget.percentage >= 100 ? '#EF4444' : budget.percentage >= 80 ? '#F97316' : '#22C55E'
              return (
                <div key={budget.id} className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{budget.category?.icon}</span>
                      <div>
                        <p className="font-semibold text-gray-800">{budget.category?.name}</p>
                        <p className="text-xs text-gray-400">
                          {formatCurrency(budget.spent)} / {formatCurrency(budget.monthly_limit)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold" style={{ color }}>
                        {toBengaliNumber(budget.percentage)}%
                      </span>
                      <button onClick={() => handleDelete(budget.id)} className="text-gray-300 hover:text-red-400 text-lg">×</button>
                    </div>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${budget.percentage}%`, backgroundColor: color }}
                    />
                  </div>
                  {budget.percentage >= 80 && (
                    <p className="text-xs mt-2 text-orange-500">
                      {budget.percentage >= 100 ? '⛔ বাজেট শেষ!' : `⚠️ বাজেটের ${toBengaliNumber(budget.percentage)}% খরচ হয়েছে`}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
