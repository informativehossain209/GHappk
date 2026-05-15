'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'
import CategoryGrid from '@/components/CategoryGrid'
import { formatTaka } from '@/lib/utils'

const EXPENSE_CATS = [
  { id: 'preset-1',  name: 'বাজার / খাবার', icon: '🍚', type: 'expense' },
  { id: 'preset-2',  name: 'বাড়ি ভাড়া',    icon: '🏠', type: 'expense' },
  { id: 'preset-3',  name: 'বিল',           icon: '⚡', type: 'expense' },
  { id: 'preset-4',  name: 'চিকিৎসা',      icon: '💊', type: 'expense' },
  { id: 'preset-5',  name: 'শিক্ষা',        icon: '📚', type: 'expense' },
  { id: 'preset-6',  name: 'যাতায়াত',      icon: '🚌', type: 'expense' },
  { id: 'preset-7',  name: 'পোশাক',         icon: '👗', type: 'expense' },
  { id: 'preset-8',  name: 'মোবাইল',        icon: '📱', type: 'expense' },
  { id: 'preset-9',  name: 'ধর্মীয়',       icon: '🕌', type: 'expense' },
  { id: 'preset-10', name: 'বিনোদন',        icon: '🎉', type: 'expense' },
  { id: 'preset-11', name: 'পারিবারিক',    icon: '🤲', type: 'expense' },
  { id: 'preset-12', name: 'মেরামত',        icon: '🛠️', type: 'expense' },
]

const INCOME_CATS = [
  { id: 'preset-13', name: 'বেতন',           icon: '💼', type: 'income' },
  { id: 'preset-14', name: 'ব্যবসায়িক আয়', icon: '🏪', type: 'income' },
  { id: 'preset-15', name: 'ভাড়া আয়',      icon: '🏘️', type: 'income' },
  { id: 'preset-16', name: 'ফ্রিল্যান্স',   icon: '📦', type: 'income' },
  { id: 'preset-17', name: 'উপহার',          icon: '💸', type: 'income' },
  { id: 'preset-18', name: 'বিনিয়োগ',       icon: '📈', type: 'income' },
]

interface TransactionFormProps {
  initialTab?: 'expense' | 'income'
  initialAmount?: string
  onSuccess?: () => void
  onCancel?: () => void
  /** compact = bottom-sheet mode, false = full page mode */
  compact?: boolean
}

export default function TransactionForm({
  initialTab = 'expense',
  initialAmount = '',
  onSuccess,
  onCancel,
  compact = false,
}: TransactionFormProps) {
  const supabase = createBrowserClient()
  const [tab, setTab] = useState<'expense' | 'income'>(initialTab)
  const [amount, setAmount] = useState(initialAmount)
  const [selectedCat, setSelectedCat] = useState<any>(null)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [customCats, setCustomCats] = useState<any[]>([])

  useEffect(() => {
    loadCustomCategories()
    setSelectedCat(null)
  }, [tab])

  const loadCustomCategories = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .in('type', [tab, 'both'])
    setCustomCats(data || [])
  }

  const categories = [
    ...(tab === 'expense' ? EXPENSE_CATS : INCOME_CATS),
    ...customCats,
  ]

  const handleSave = async () => {
    setError('')
    if (!amount || parseFloat(amount) <= 0) {
      setError('সঠিক পরিমাণ দিন')
      return
    }
    if (!selectedCat) {
      setError('একটি ক্যাটাগরি বেছে নিন')
      return
    }

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Resolve category ID from DB
    let catId: string | null = null
    if (selectedCat.id.startsWith('preset-')) {
      const { data: cat } = await supabase
        .from('categories')
        .select('id')
        .eq('name', selectedCat.name)
        .eq('is_preset', true)
        .maybeSingle()
      catId = cat?.id || null
    } else {
      catId = selectedCat.id
    }

    const { error: dbError } = await supabase.from('transactions').insert({
      user_id: user.id,
      type: tab,
      amount: parseFloat(amount),
      category_id: catId,
      note: note.trim() || null,
      transaction_date: date,
    })

    if (dbError) {
      setError('সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।')
    } else {
      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        setAmount('')
        setSelectedCat(null)
        setNote('')
        onSuccess?.()
      }, 900)
    }
    setLoading(false)
  }

  return (
    <div className={compact ? '' : 'space-y-4'}>
      {/* Tab switcher */}
      <div className="flex bg-gray-100 rounded-xl p-1">
        {(['expense', 'income'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all ${
              tab === t
                ? t === 'expense'
                  ? 'bg-red-500 text-white shadow'
                  : 'bg-green-500 text-white shadow'
                : 'text-gray-500'
            }`}
          >
            {t === 'expense' ? '💸 খরচ' : '💰 আয়'}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <label className="text-gray-500 text-xs block mb-2">পরিমাণ (৳)</label>
        <div className="flex items-center gap-2">
          <span className="text-3xl text-gray-300">৳</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="০"
            inputMode="decimal"
            className="flex-1 text-4xl font-bold text-gray-800 outline-none bg-transparent"
          />
        </div>
        {amount && parseFloat(amount) > 0 && (
          <p className="text-gray-400 text-xs mt-1">{formatTaka(parseFloat(amount))}</p>
        )}
      </div>

      {/* Category */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <label className="text-gray-500 text-xs block mb-3">ক্যাটাগরি বেছে নিন</label>
        <CategoryGrid
          categories={categories}
          selected={selectedCat}
          onSelect={setSelectedCat}
        />
      </div>

      {/* Date */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <label className="text-gray-500 text-xs block mb-2">তারিখ</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={new Date().toISOString().split('T')[0]}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 outline-none focus:border-blue-400 text-sm"
        />
      </div>

      {/* Note */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <label className="text-gray-500 text-xs block mb-2">নোট (ঐচ্ছিক)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="যেমন: বাজার থেকে কিনলাম..."
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 outline-none focus:border-blue-400 text-sm"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-500 text-sm text-center">{error}</p>
      )}

      {/* Buttons */}
      <div className={`flex gap-3 ${compact ? 'pt-2' : ''}`}>
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 rounded-2xl font-semibold text-gray-600 bg-gray-100 active:scale-95 transition-all"
          >
            বাতিল
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={!amount || !selectedCat || loading}
          className={`flex-1 py-3.5 rounded-2xl font-bold text-white text-base shadow-lg disabled:opacity-40 transition-all active:scale-95 ${
            success
              ? 'bg-green-500'
              : tab === 'expense'
              ? 'bg-red-500'
              : 'bg-green-500'
          }`}
        >
          {success ? '✅ সংরক্ষিত!' : loading ? 'সংরক্ষণ হচ্ছে...' : '💾 সংরক্ষণ করুন'}
        </button>
      </div>
    </div>
  )
}
