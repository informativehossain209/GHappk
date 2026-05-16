'use client'
export const dynamic = 'force-dynamic';

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { hashPin } from '@/lib/utils'
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '@/lib/categories'

export default function RegisterPage() {
  const router = useRouter()
  const { setUser } = useAuthStore()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ name: '', phone: '', pin: '', confirmPin: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleNext = () => {
    if (step === 1) {
      if (!form.name.trim()) return setError('নাম দিন')
      if (!form.phone.trim() || form.phone.length < 11) return setError('সঠিক মোবাইল নম্বর দিন')
      setError('')
      setStep(2)
    }
  }

  const handleRegister = async () => {
    if (form.pin.length !== 4) return setError('৪ সংখ্যার পিন দিন')
    if (form.pin !== form.confirmPin) return setError('পিন মিলছে না')

    setLoading(true)
    setError('')

    try {
      const hashed = hashPin(form.pin)

      // Check pin uniqueness
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('pin', hashed)

      if (existing && existing.length > 0) {
        setError('এই পিন ইতিমধ্যে ব্যবহৃত। অন্য পিন ব্যবহার করুন।')
        setLoading(false)
        return
      }

      // Create user
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({ name: form.name.trim(), phone: form.phone.trim(), pin: hashed })
        .select()
        .single()

      if (userError || !newUser) {
        setError('রেজিস্ট্রেশন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।')
        setLoading(false)
        return
      }

      // Insert default categories
      const expenseCats = DEFAULT_EXPENSE_CATEGORIES.map((c) => ({
        user_id: newUser.id, name: c.name, icon: c.icon, type: 'expense', is_default: true, color: c.color,
      }))
      const incomeCats = DEFAULT_INCOME_CATEGORIES.map((c) => ({
        user_id: newUser.id, name: c.name, icon: c.icon, type: 'income', is_default: true, color: c.color,
      }))
      await supabase.from('categories').insert([...expenseCats, ...incomeCats])

      setUser(newUser)
      router.replace('/home')
    } catch {
      setError('কোনো সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-500 to-primary-700 flex flex-col">
      <div className="flex-1 flex flex-col px-6 pt-12 pb-8">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
            <span className="text-3xl">🏠</span>
          </div>
          <h1 className="text-2xl font-bold text-white">ঘর খরচ</h1>
          <p className="text-primary-100 text-sm mt-1">নতুন অ্যাকাউন্ট তৈরি করুন</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className={`h-2 rounded-full transition-all ${step === 1 ? 'w-8 bg-white' : 'w-4 bg-white/40'}`} />
          <div className={`h-2 rounded-full transition-all ${step === 2 ? 'w-8 bg-white' : 'w-4 bg-white/40'}`} />
        </div>

        <div className="bg-white/15 backdrop-blur-md rounded-3xl p-6 animate-slide-up">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-white font-semibold text-lg mb-4">আপনার তথ্য দিন</h2>
              <div>
                <label className="text-white/70 text-sm block mb-1">পূর্ণ নাম</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="যেমন: রহিম সাহেব"
                  className="w-full bg-white/20 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60 text-base"
                />
              </div>
              <div>
                <label className="text-white/70 text-sm block mb-1">মোবাইল নম্বর</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="017XXXXXXXX"
                  maxLength={11}
                  className="w-full bg-white/20 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60 text-base"
                />
              </div>
              {error && <p className="text-red-300 text-sm text-center">{error}</p>}
              <button
                onClick={handleNext}
                className="w-full bg-accent-400 hover:bg-accent-500 text-white font-semibold py-3.5 rounded-xl transition-all active:scale-95 mt-2"
              >
                পরবর্তী →
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-white font-semibold text-lg mb-4">পিন সেট করুন</h2>
              <div>
                <label className="text-white/70 text-sm block mb-1">৪ সংখ্যার পিন</label>
                <input
                  type="password"
                  value={form.pin}
                  onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/, '').slice(0, 4) })}
                  placeholder="••••"
                  maxLength={4}
                  inputMode="numeric"
                  className="w-full bg-white/20 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60 text-center text-2xl tracking-widest"
                />
              </div>
              <div>
                <label className="text-white/70 text-sm block mb-1">পিন নিশ্চিত করুন</label>
                <input
                  type="password"
                  value={form.confirmPin}
                  onChange={(e) => setForm({ ...form, confirmPin: e.target.value.replace(/\D/, '').slice(0, 4) })}
                  placeholder="••••"
                  maxLength={4}
                  inputMode="numeric"
                  className="w-full bg-white/20 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60 text-center text-2xl tracking-widest"
                />
              </div>
              {error && <p className="text-red-300 text-sm text-center">{error}</p>}
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => { setStep(1); setError('') }}
                  className="flex-1 bg-white/20 text-white font-semibold py-3.5 rounded-xl transition-all active:scale-95"
                >
                  ← আগে
                </button>
                <button
                  onClick={handleRegister}
                  disabled={loading}
                  className="flex-1 bg-accent-400 hover:bg-accent-500 text-white font-semibold py-3.5 rounded-xl transition-all active:scale-95 disabled:opacity-60"
                >
                  {loading ? 'অপেক্ষা করুন...' : 'রেজিস্ট্রেশন করুন'}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-white/60 text-sm mt-6">
          অ্যাকাউন্ট আছে?{' '}
          <Link href="/auth/login" className="text-accent-300 font-semibold underline">
            লগইন করুন
          </Link>
        </p>
      </div>

      <p className="text-center text-white/30 text-xs pb-6">Developed by Sakib Hossain</p>
    </div>
  )
}
