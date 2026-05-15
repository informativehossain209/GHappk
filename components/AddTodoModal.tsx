'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddTodoModal({ isOpen, onClose, onSuccess }: Props) {
  const supabase = createBrowserClient()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(
    new Date(Date.now() + 86400000).toISOString().split('T')[0] // default: আগামীকাল
  )
  const [time, setTime] = useState('09:00')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setTitle('')
    setDate(new Date(Date.now() + 86400000).toISOString().split('T')[0])
    setTime('09:00')
    setAmount('')
    setError('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSave = async () => {
    setError('')
    if (!title.trim()) {
      setError('কাজের নাম লিখুন')
      return
    }
    if (!date) {
      setError('তারিখ বেছে নিন')
      return
    }

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { error: dbError } = await supabase.from('todos').insert({
      user_id: user.id,
      title: title.trim(),
      reminder_date: date,
      reminder_time: time || '09:00',
      amount: amount ? parseFloat(amount) : null,
      is_done: false,
    })

    if (dbError) {
      setError('যোগ করা যায়নি। আবার চেষ্টা করুন।')
    } else {
      reset()
      onSuccess()
      onClose()
    }
    setLoading(false)
  }

  if (!isOpen) return null

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      {/* Sheet */}
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl p-6 space-y-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto -mt-2 mb-2" />

        <h2 className="text-lg font-bold text-gray-800 text-center">📅 রিমাইন্ডার যোগ করুন</h2>

        {/* কাজের নাম */}
        <div>
          <label className="text-gray-500 text-xs block mb-1.5">কাজের নাম *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="যেমন: বিদ্যুৎ বিল দিন"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 outline-none focus:border-blue-400 text-sm"
            autoFocus
          />
        </div>

        {/* তারিখ ও সময় */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-gray-500 text-xs block mb-1.5">তারিখ *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full border border-gray-200 rounded-xl px-3 py-3 text-gray-800 outline-none focus:border-blue-400 text-sm"
            />
          </div>
          <div>
            <label className="text-gray-500 text-xs block mb-1.5">সময় (ঐচ্ছিক)</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-3 text-gray-800 outline-none focus:border-blue-400 text-sm"
            />
          </div>
        </div>

        {/* আনুমানিক পরিমাণ */}
        <div>
          <label className="text-gray-500 text-xs block mb-1.5">
            আনুমানিক পরিমাণ (ঐচ্ছিক)
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">৳</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="০"
              inputMode="decimal"
              className="w-full border border-gray-200 rounded-xl pl-8 pr-4 py-3 text-gray-800 outline-none focus:border-blue-400 text-sm"
            />
          </div>
        </div>

        {/* Error */}
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

        {/* Buttons */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleClose}
            className="flex-1 py-3.5 rounded-2xl font-semibold text-gray-600 bg-gray-100 active:scale-95 transition-all"
          >
            বাতিল
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-3.5 rounded-2xl font-bold text-white bg-blue-500 shadow-lg active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? 'যোগ হচ্ছে...' : '✅ যোগ করুন'}
          </button>
        </div>

        {/* Safe area padding for iOS */}
        <div className="h-4" />
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.25s ease-out;
        }
      `}</style>
    </div>
  )
}
