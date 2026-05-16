'use client'
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { hashPin } from '@/lib/utils'

export default function LoginPage() {
  const router = useRouter()
  const { setUser, user } = useAuthStore()
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPin, setShowPin] = useState(false)

  useEffect(() => {
    if (user) {
      router.replace('/home')
    }
  }, [user, router])

  const handlePinInput = (digit: string) => {
    if (pin.length < 4) {
      const newPin = pin + digit
      setPin(newPin)
      setError('')
      if (newPin.length === 4) {
        handleLogin(newPin)
      }
    }
  }

  const handleDelete = () => {
    setPin((p) => p.slice(0, -1))
    setError('')
  }

  const handleLogin = async (pinValue: string) => {
    setLoading(true)
    setError('')
    try {
      const hashed = hashPin(pinValue)
      const { data, error: dbError } = await supabase
        .from('users')
        .select('*')
        .eq('pin', hashed)
        .single()

      if (dbError || !data) {
        setError('ভুল পিন। আবার চেষ্টা করুন।')
        setPin('')
        setLoading(false)
        return
      }

      setUser(data)
      router.replace('/home')
    } catch {
      setError('কোনো সমস্যা হয়েছে। আবার চেষ্টা করুন।')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  const dots = Array(4).fill(0)

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary-600 via-primary-500 to-primary-700">
      {/* Header */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 pt-16 pb-8">
        <div className="mb-8 text-center animate-fade-in">
          <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm shadow-lg">
            <span className="text-4xl">🏠</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">ঘর খরচ</h1>
          <p className="text-primary-100 text-sm">আপনার পারিবারিক হিসাব</p>
        </div>

        {/* PIN Display */}
        <div className="bg-white/15 backdrop-blur-md rounded-3xl p-8 w-full max-w-sm shadow-xl animate-slide-up">
          <p className="text-center text-white/80 text-sm mb-6 font-medium">
            আপনার ৪ সংখ্যার পিন দিন
          </p>

          {/* Dots */}
          <div className="flex justify-center gap-4 mb-8">
            {dots.map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  i < pin.length
                    ? 'bg-accent-400 scale-110 shadow-lg shadow-accent-400/50'
                    : 'bg-white/30'
                }`}
              />
            ))}
          </div>

          {error && (
            <p className="text-center text-red-300 text-sm mb-4 bg-red-500/20 py-2 px-4 rounded-xl">
              {error}
            </p>
          )}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                onClick={() => handlePinInput(String(n))}
                disabled={loading}
                className="h-14 rounded-2xl bg-white/20 text-white text-xl font-semibold active:bg-white/40 active:scale-95 transition-all duration-100 disabled:opacity-50"
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setShowPin(!showPin)}
              className="h-14 rounded-2xl bg-white/10 text-white/60 text-xs active:bg-white/20 active:scale-95 transition-all duration-100"
            >
              {showPin ? '🙈' : '👁️'}
            </button>
            <button
              onClick={() => handlePinInput('0')}
              disabled={loading}
              className="h-14 rounded-2xl bg-white/20 text-white text-xl font-semibold active:bg-white/40 active:scale-95 transition-all duration-100 disabled:opacity-50"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              className="h-14 rounded-2xl bg-white/10 text-white text-xl active:bg-white/30 active:scale-95 transition-all duration-100"
            >
              ⌫
            </button>
          </div>

          {loading && (
            <div className="flex justify-center mt-6">
              <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-8 px-4">
        <p className="text-white/60 text-sm">
          নতুন অ্যাকাউন্ট?{' '}
          <Link href="/auth/register" className="text-accent-300 font-semibold underline">
            রেজিস্ট্রেশন করুন
          </Link>
        </p>
        <p className="text-white/30 text-xs mt-4">Developed by Sakib Hossain</p>
      </div>
    </div>
  )
}
