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

  const handleNext = async () => {
    if (!form.name.trim()) return setError('নাম দিন')
    if (!form.phone.trim() || form.phone.length < 11) return setError('সঠিক মোবাইল নম্বর দিন')
    setLoading(true)
    setError('')
    const { data: existing } = await supabase.from('users').select('id').eq('phone', form.phone.trim())
    setLoading(false)
    if (existing && existing.length > 0) {
      return setError('এই মোবাইল নম্বর ইতিমধ্যে নিবন্ধিত।')
    }
    setStep(2)
  }

  const handleRegister = async () => {
    if (form.pin.length !== 4) return setError('৪ সংখ্যার পিন দিন')
    if (form.pin !== form.confirmPin) return setError('পিন মিলছে না')

    setLoading(true)
    setError('')
    try {
      // Step 1: Create a Supabase Auth account.
      // We use phone@ghar-khoroch.app as a fake email (no real email is sent).
      // Make sure "Enable email confirmations" is OFF in Supabase Auth settings.
      const fakeEmail = `${form.phone.trim()}@ghar-khoroch.app`
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: fakeEmail,
        password: form.pin,   // Supabase hashes this; we also store our own hash below
      })

      if (authError || !authData.user) {
        setError(authError?.message || 'রেজিস্ট্রেশন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।')
        setLoading(false)
        return
      }

      // Step 2: Insert the user profile linked to the auth account.
      // id must equal authData.user.id so the RLS policy (id = auth.uid()) works.
      const hashed = hashPin(form.pin)
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          name: form.name.trim(),
          phone: form.phone.trim(),
          pin: hashed,
        })
        .select()
        .single()

      if (userError || !newUser) {
        // Clean up the auth user we just created so the phone can be re-used
        await supabase.auth.signOut()
        setError('রেজিস্ট্রেশন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।')
        setLoading(false)
        return
      }

      // Step 3: Seed default categories
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
      setError('কোনো সমস্যা হয়েছে। আবার চেষ্টা করুন।')
    } finally {
      setLoading(false)
    }
  }

  const handlePinDigit = (d: string) => {
    if (step === 2) {
      if (form.pin.length < 4) {
        setForm(f => ({ ...f, pin: f.pin + d }))
        setError('')
      }
    } else {
      if (form.confirmPin.length < 4) {
        const newConfirm = form.confirmPin + d
        setForm(f => ({ ...f, confirmPin: newConfirm }))
        setError('')
        if (newConfirm.length === 4) {
          if (form.pin !== newConfirm) {
            setError('পিন মিলছে না')
            setForm(f => ({ ...f, confirmPin: '' }))
          }
        }
      }
    }
  }

  const dots = Array(4).fill(0)

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary-600 via-primary-500 to-primary-700">
      <div className="flex-1 flex flex-col items-center justify-center px-8 pt-16 pb-8">
        <div className="mb-8 text-center animate-fade-in">
          <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm shadow-lg">
            <span className="text-4xl">🏠</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">ঘর খরচ</h1>
          <p className="text-primary-100 text-sm">নতুন অ্যাকাউন্ট তৈরি করুন</p>
        </div>

        <div className="bg-white/15 backdrop-blur-md rounded-3xl p-8 w-full max-w-sm shadow-xl animate-slide-up">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-white font-bold text-xl mb-4">আপনার তথ্য দিন</h2>
              <div>
                <label className="text-white/70 text-xs block mb-1">আপনার নাম</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setError('') }}
                  placeholder="পূর্ণ নাম"
                  className="w-full bg-white/20 text-white placeholder-white/40 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/40"
                />
              </div>
              <div>
                <label className="text-white/70 text-xs block mb-1">মোবাইল নম্বর</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => { setForm(f => ({ ...f, phone: e.target.value })); setError('') }}
                  placeholder="01XXXXXXXXX"
                  className="w-full bg-white/20 text-white placeholder-white/40 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/40"
                />
              </div>
              {error && <p className="text-red-200 text-sm text-center">{error}</p>}
              <button
                onClick={handleNext}
                disabled={loading}
                className="w-full bg-white text-primary-600 font-bold py-3.5 rounded-2xl mt-2 active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? 'যাচাই করা হচ্ছে...' : 'পরবর্তী →'}
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-white font-bold text-lg mb-1">পিন সেট করুন</h2>
              <p className="text-white/60 text-xs mb-5">৪ সংখ্যার গোপন পিন (মনে রাখুন)</p>
              <div className="flex justify-center gap-4 mb-5">
                {dots.map((_, i) => (
                  <div key={i} className={`w-4 h-4 rounded-full transition-all duration-200 ${i < form.pin.length ? 'bg-white scale-110' : 'bg-white/30'}`} />
                ))}
              </div>
              {error && <p className="text-red-200 text-sm text-center mb-3">{error}</p>}
              <div className="grid grid-cols-3 gap-2">
                {[1,2,3,4,5,6,7,8,9].map(n => (
                  <button key={n} onClick={() => handlePinDigit(String(n))}
                    className="h-12 rounded-2xl bg-white/20 text-white text-lg font-semibold active:bg-white/30 active:scale-95 transition-all">{n}</button>
                ))}
                <div />
                <button onClick={() => handlePinDigit('0')} className="h-12 rounded-2xl bg-white/20 text-white text-lg font-semibold active:bg-white/30 active:scale-95 transition-all">0</button>
                <button onClick={() => setForm(f => ({ ...f, pin: f.pin.slice(0, -1) }))} className="h-12 rounded-2xl bg-white/20 text-white text-lg active:bg-white/30 active:scale-95 transition-all">⌫</button>
              </div>
              {form.pin.length === 4 && (
                <div className="mt-5">
                  <p className="text-white/70 text-xs mb-3 text-center">পিন নিশ্চিত করুন</p>
                  <div className="flex justify-center gap-4 mb-4">
                    {dots.map((_, i) => (
                      <div key={i} className={`w-4 h-4 rounded-full transition-all duration-200 ${i < form.confirmPin.length ? 'bg-white scale-110' : 'bg-white/30'}`} />
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[1,2,3,4,5,6,7,8,9].map(n => (
                      <button key={n} onClick={() => handlePinDigit(String(n))}
                        className="h-12 rounded-2xl bg-white/20 text-white text-lg font-semibold active:bg-white/30 active:scale-95 transition-all">{n}</button>
                    ))}
                    <div />
                    <button onClick={() => handlePinDigit('0')} className="h-12 rounded-2xl bg-white/20 text-white text-lg font-semibold active:bg-white/30 active:scale-95 transition-all">0</button>
                    <button onClick={() => setForm(f => ({ ...f, confirmPin: f.confirmPin.slice(0, -1) }))} className="h-12 rounded-2xl bg-white/20 text-white text-lg active:bg-white/30 active:scale-95 transition-all">⌫</button>
                  </div>
                  {form.confirmPin.length === 4 && form.pin === form.confirmPin && (
                    <button
                      onClick={handleRegister}
                      disabled={loading}
                      className="w-full bg-white text-primary-600 font-bold py-3.5 rounded-2xl mt-4 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {loading ? 'অ্যাকাউন্ট তৈরি হচ্ছে...' : '✅ অ্যাকাউন্ট তৈরি করুন'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-white/70 text-sm mt-6">
          ইতিমধ্যে অ্যাকাউন্ট আছে?{' '}
          <Link href="/auth/login" className="text-white font-semibold underline">লগইন করুন</Link>
        </p>
      </div>
    </div>
  )
}
