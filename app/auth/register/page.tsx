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
  const [pinStep, setPinStep] = useState<'set' | 'confirm'>('set')
  const [form, setForm] = useState({ name: '', phone: '', pin: '', confirmPin: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleNext = async () => {
    if (!form.name.trim()) return setError('নাম দিন')
    if (!form.phone.trim() || form.phone.length < 11) return setError('সঠিক মোবাইল নম্বর দিন')
    setLoading(true)
    setError('')
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('phone', form.phone.trim())
    setLoading(false)
    if (existing && existing.length > 0) {
      return setError('এই মোবাইল নম্বর ইতিমধ্যে নিবন্ধিত।')
    }
    setStep(2)
  }

  const handleRegister = async (pin: string) => {
    setLoading(true)
    setError('')
    try {
      const hashed = hashPin(pin)
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          name: form.name.trim(),
          phone: form.phone.trim(),
          pin: hashed,
        })
        .select()
        .single()

      if (userError || !newUser) {
        setError(userError?.message || 'রেজিস্ট্রেশন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।')
        setForm(f => ({ ...f, pin: '', confirmPin: '' }))
        setPinStep('set')
        setLoading(false)
        return
      }

      // Seed default categories
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
      setForm(f => ({ ...f, pin: '', confirmPin: '' }))
      setPinStep('set')
    } finally {
      setLoading(false)
    }
  }

  const handlePinDigit = (d: string) => {
    setError('')
    if (pinStep === 'set') {
      if (form.pin.length >= 4) return
      const newPin = form.pin + d
      setForm(f => ({ ...f, pin: newPin }))
      if (newPin.length === 4) {
        setTimeout(() => setPinStep('confirm'), 200)
      }
    } else {
      if (form.confirmPin.length >= 4) return
      const newConfirm = form.confirmPin + d
      setForm(f => ({ ...f, confirmPin: newConfirm }))
      if (newConfirm.length === 4) {
        if (form.pin !== newConfirm) {
          setTimeout(() => {
            setError('পিন মিলেনি। আবার নতুন পিন দিন।')
            setForm(f => ({ ...f, pin: '', confirmPin: '' }))
            setPinStep('set')
          }, 300)
        } else {
          setTimeout(() => handleRegister(newConfirm), 200)
        }
      }
    }
  }

  const handleDelete = () => {
    setError('')
    if (pinStep === 'confirm') {
      if (form.confirmPin.length > 0) {
        setForm(f => ({ ...f, confirmPin: f.confirmPin.slice(0, -1) }))
      } else {
        setForm(f => ({ ...f, pin: '', confirmPin: '' }))
        setPinStep('set')
      }
    } else {
      setForm(f => ({ ...f, pin: f.pin.slice(0, -1) }))
    }
  }

  const activeDots = pinStep === 'set' ? form.pin.length : form.confirmPin.length
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
                  onChange={e => { setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 11) })); setError('') }}
                  placeholder="01XXXXXXXXX"
                  inputMode="numeric"
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
              <div className="mb-5 text-center">
                <h2 className="text-white font-bold text-lg">
                  {pinStep === 'set' ? 'পিন সেট করুন' : 'পিন নিশ্চিত করুন'}
                </h2>
                <p className="text-white/60 text-xs mt-1">
                  {pinStep === 'set' ? '৪ সংখ্যার গোপন পিন (মনে রাখুন)' : 'আবার একই পিন দিন'}
                </p>
              </div>

              <div className="flex justify-center gap-4 mb-4">
                {dots.map((_, i) => (
                  <div
                    key={i}
                    className={`w-4 h-4 rounded-full transition-all duration-200 ${
                      i < activeDots ? 'bg-white scale-110' : 'bg-white/30'
                    }`}
                  />
                ))}
              </div>

              <div className="flex justify-center gap-2 mb-5">
                <div className={`h-1 w-8 rounded-full transition-all ${pinStep === 'set' ? 'bg-white' : 'bg-white/40'}`} />
                <div className={`h-1 w-8 rounded-full transition-all ${pinStep === 'confirm' ? 'bg-white' : 'bg-white/40'}`} />
              </div>

              {error && <p className="text-red-200 text-sm text-center mb-4">{error}</p>}

              <div className="grid grid-cols-3 gap-2">
                {[1,2,3,4,5,6,7,8,9].map(n => (
                  <button
                    key={n}
                    onClick={() => handlePinDigit(String(n))}
                    disabled={loading}
                    className="h-12 rounded-2xl bg-white/20 text-white text-lg font-semibold active:bg-white/30 active:scale-95 transition-all disabled:opacity-50"
                  >{n}</button>
                ))}
                <div />
                <button
                  onClick={() => handlePinDigit('0')}
                  disabled={loading}
                  className="h-12 rounded-2xl bg-white/20 text-white text-lg font-semibold active:bg-white/30 active:scale-95 transition-all disabled:opacity-50"
                >0</button>
                <button
                  onClick={handleDelete}
                  className="h-12 rounded-2xl bg-white/20 text-white text-lg active:bg-white/30 active:scale-95 transition-all"
                >⌫</button>
              </div>

              {loading && (
                <div className="flex justify-center mt-5">
                  <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
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
