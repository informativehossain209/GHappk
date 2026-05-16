'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { Category } from '@/types'
import { cn } from '@/lib/utils'

export default function AddPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [tab, setTab] = useState<'expense' | 'income'>('expense')
  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState({
    amount: '',
    category_id: '',
    date: new Date().toISOString().split('T')[0],
    note: '',
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .eq('type', tab)
      .then(({ data }) => {
        setCategories(data || [])
        setForm((f) => ({ ...f, category_id: '' }))
      })
  }, [user, tab])

  const handleSubmit = async () => {
    if (!form.amount || !form.category_id || !user) return

    setLoading(true)
    try {
      await supabase.from('transactions').insert({
        user_id: user.id,
        type: tab,
        category_id: form.category_id,
        amount: parseFloat(form.amount),
        date: form.date,
        note: form.note || null,
      })

      setSuccess(true)
      setForm({ amount: '', category_id: '', date: new Date().toISOString().split('T')[0], note: '' })
      setTimeout(() => {
        setSuccess(false)
        router.push('/home')
      }, 1200)
    } catch {
      // handle error
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-full bg-bg">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-4 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
            ←
          </button>
          <h1 className="text-lg font-bold text-gray-800">লেনদেন যোগ করুন</h1>
        </div>

        {/* Tabs */}
        <div className="bg-gray-100 rounded-2xl p-1 flex">
          <button
            onClick={() => setTab('expense')}
            className={cn('flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all', tab === 'expense' ? 'bg-danger text-white shadow-sm' : 'text-gray-500')}
          >
            💸 খরচ
          </button>
          <button
            onClick={() => setTab('income')}
            className={cn('flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all', tab === 'income' ? 'bg-success text-white shadow-sm' : 'text-gray-500')}
          >
            💰 আয়
          </button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Amount */}
        <div className="card p-4">
          <label className="text-gray-500 text-xs block mb-2">পরিমাণ (টাকা)</label>
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${tab === 'expense' ? 'text-danger' : 'text-success'}`}>৳</span>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="০"
              inputMode="decimal"
              className="flex-1 text-3xl font-bold text-gray-800 bg-transparent focus:outline-none placeholder-gray-200"
            />
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="text-gray-500 text-xs block mb-2 px-1">ক্যাটাগরি বেছে নিন</label>
          <div className="grid grid-cols-4 gap-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setForm({ ...form, category_id: cat.id })}
                className={cn(
                  'card p-2 flex flex-col items-center gap-1 transition-all active:scale-95',
                  form.category_id === cat.id ? 'ring-2 ring-primary-500 bg-primary-50' : ''
                )}
              >
                <span className="text-2xl">{cat.icon}</span>
                <span className="text-[10px] text-gray-600 text-center leading-tight">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div className="card p-4">
          <label className="text-gray-500 text-xs block mb-2">তারিখ</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="w-full text-gray-800 font-medium bg-transparent focus:outline-none"
          />
        </div>

        {/* Note */}
        <div className="card p-4">
          <label className="text-gray-500 text-xs block mb-2">নোট (ঐচ্ছিক)</label>
          <input
            type="text"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="বিস্তারিত লিখুন..."
            className="w-full text-gray-800 bg-transparent focus:outline-none placeholder-gray-300"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!form.amount || !form.category_id || loading}
          className={cn(
            'w-full py-4 rounded-2xl font-bold text-white text-base transition-all active:scale-95',
            tab === 'expense' ? 'bg-gradient-to-r from-danger to-red-600' : 'bg-gradient-to-r from-success to-emerald-600',
            (!form.amount || !form.category_id || loading) && 'opacity-50 cursor-not-allowed'
          )}
        >
          {loading ? 'সংরক্ষণ হচ্ছে...' : success ? '✅ সংরক্ষিত হয়েছে!' : `${tab === 'expense' ? '💸 খরচ' : '💰 আয়'} সংরক্ষণ করুন`}
        </button>
      </div>
    </div>
  )
}
