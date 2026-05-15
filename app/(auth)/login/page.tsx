'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

type Step = 'phone' | 'otp'

export default function LoginPage() {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createBrowserClient()

  const formatPhone = (raw: string) => {
    // Strip non-digits
    const digits = raw.replace(/\D/g, '')
    // Convert to +880 format
    if (digits.startsWith('880')) return `+${digits}`
    if (digits.startsWith('0')) return `+880${digits.slice(1)}`
    return `+880${digits}`
  }

  const sendOtp = async () => {
    setError('')
    setLoading(true)
    const formatted = formatPhone(phone)
    if (!/^\+8801[3-9]\d{8}$/.test(formatted)) {
      setError('সঠিক বাংলাদেশী মোবাইল নম্বর দিন (যেমন: 01712345678)')
      setLoading(false)
      return
    }
    const { error } = await supabase.auth.signInWithOtp({ phone: formatted })
    if (error) {
      setError('OTP পাঠানো সম্ভব হয়নি। আবার চেষ্টা করুন।')
    } else {
      setStep('otp')
    }
    setLoading(false)
  }

  const verifyOtp = async () => {
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      phone: formatPhone(phone),
      token: otp,
      type: 'sms',
    })
    if (error) {
      setError('ভুল OTP। আবার চেষ্টা করুন।')
    } else {
      router.push('/dashboard')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary to-primary-dark flex flex-col items-center justify-center px-6">
      {/* Logo area */}
      <div className="mb-10 text-center">
        <div className="text-6xl mb-3">🏠</div>
        <h1 className="text-3xl font-bold text-white">ঘর খরচ</h1>
        <p className="text-blue-200 mt-1 text-sm">আপনার ঘরের হিসাব, আপনার হাতে</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
        {step === 'phone' ? (
          <>
            <h2 className="text-xl font-semibold text-gray-800 mb-1">লগইন করুন</h2>
            <p className="text-gray-500 text-sm mb-5">আপনার মোবাইল নম্বরে OTP পাঠানো হবে</p>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              মোবাইল নম্বর
            </label>
            <div className="flex items-center border-2 border-gray-200 rounded-xl overflow-hidden focus-within:border-primary transition-colors">
              <span className="px-3 py-3 bg-gray-50 text-gray-600 font-medium border-r border-gray-200">🇧🇩 +880</span>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="01712345678"
                className="flex-1 px-3 py-3 outline-none text-gray-800 font-bangla"
                inputMode="numeric"
                maxLength={11}
                onKeyDown={e => e.key === 'Enter' && sendOtp()}
              />
            </div>

            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

            <button
              onClick={sendOtp}
              disabled={loading || !phone}
              className="w-full mt-5 py-3.5 bg-primary text-white font-semibold rounded-xl disabled:opacity-50 active:scale-98 transition-all"
            >
              {loading ? 'পাঠানো হচ্ছে...' : 'OTP পাঠান →'}
            </button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-gray-800 mb-1">OTP যাচাই করুন</h2>
            <p className="text-gray-500 text-sm mb-5">
              {formatPhone(phone)} নম্বরে ৬ সংখ্যার OTP পাঠানো হয়েছে
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-2">OTP কোড</label>
            <input
              type="text"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="• • • • • •"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-2xl tracking-widest font-mono outline-none focus:border-primary transition-colors"
              inputMode="numeric"
              maxLength={6}
              onKeyDown={e => e.key === 'Enter' && verifyOtp()}
            />

            {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}

            <button
              onClick={verifyOtp}
              disabled={loading || otp.length !== 6}
              className="w-full mt-5 py-3.5 bg-primary text-white font-semibold rounded-xl disabled:opacity-50 transition-all"
            >
              {loading ? 'যাচাই হচ্ছে...' : 'যাচাই করুন ✓'}
            </button>

            <button
              onClick={() => { setStep('phone'); setOtp(''); setError('') }}
              className="w-full mt-3 py-2 text-gray-500 text-sm"
            >
              ← নম্বর পরিবর্তন করুন
            </button>
          </>
        )}
      </div>

      <p className="mt-8 text-blue-200 text-xs text-center">
        সম্পূর্ণ বিনামূল্যে • কোনো বিজ্ঞাপন নেই
      </p>
    </div>
  )
}
