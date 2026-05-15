'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

type Mode = 'login' | 'signup' | 'forgot'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const router = useRouter()
  const supabase = createBrowserClient()

  const handleLogin = async () => {
    setError('')
    if (!email || !password) { setError('ইমেইল ও পাসওয়ার্ড দিন।'); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message.includes('Invalid login')) {
        setError('ইমেইল বা পাসওয়ার্ড ভুল হয়েছে।')
      } else if (error.message.includes('Email not confirmed')) {
        setError('আপনার ইমেইল যাচাই করুন। ইনবক্স চেক করুন।')
      } else {
        setError('লগইন হয়নি। আবার চেষ্টা করুন।')
      }
    } else {
      router.push('/dashboard')
      router.refresh()
    }
    setLoading(false)
  }

  const handleSignup = async () => {
    setError('')
    if (!email || !password) { setError('ইমেইল ও পাসওয়ার্ড দিন।'); return }
    if (password.length < 6) { setError('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'); return }
    if (password !== confirmPassword) { setError('পাসওয়ার্ড দুটো মিলছে না।'); return }
    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      if (error.message.includes('already registered')) {
        setError('এই ইমেইলে আগেই অ্যাকাউন্ট আছে। লগইন করুন।')
      } else {
        setError('অ্যাকাউন্ট তৈরি হয়নি। আবার চেষ্টা করুন।')
      }
    } else {
      setMessage('✅ অ্যাকাউন্ট তৈরি হয়েছে! আপনার ইমেইলে একটি যাচাই লিংক পাঠানো হয়েছে। লিংকে ক্লিক করে লগইন করুন।')
      setEmail('')
      setPassword('')
      setConfirmPassword('')
    }
    setLoading(false)
  }

  const handleForgot = async () => {
    setError('')
    if (!email) { setError('আপনার ইমেইল ঠিকানা দিন।'); return }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setError('পাসওয়ার্ড রিসেট ইমেইল পাঠানো যায়নি।')
    } else {
      setMessage('✅ পাসওয়ার্ড রিসেট লিংক আপনার ইমেইলে পাঠানো হয়েছে।')
    }
    setLoading(false)
  }

  const handleSubmit = () => {
    if (mode === 'login') handleLogin()
    else if (mode === 'signup') handleSignup()
    else handleForgot()
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary to-primary-dark flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <div className="mb-10 text-center">
        <div className="text-6xl mb-3">🏠</div>
        <h1 className="text-3xl font-bold text-white">ঘর খরচ</h1>
        <p className="text-blue-200 mt-1 text-sm">আপনার ঘরের হিসাব, আপনার হাতে</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
        {/* Mode tabs */}
        {mode !== 'forgot' && (
          <div className="flex mb-6 bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => { setMode('login'); setError(''); setMessage('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === 'login' ? 'bg-white shadow text-primary' : 'text-gray-500'
              }`}
            >
              লগইন
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); setMessage('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === 'signup' ? 'bg-white shadow text-primary' : 'text-gray-500'
              }`}
            >
              নতুন অ্যাকাউন্ট
            </button>
          </div>
        )}

        {mode === 'forgot' && (
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-1">পাসওয়ার্ড ভুলে গেছেন?</h2>
            <p className="text-gray-400 text-sm">আপনার ইমেইলে রিসেট লিংক পাঠানো হবে</p>
          </div>
        )}

        {/* Success message */}
        {message && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm leading-relaxed">
            {message}
          </div>
        )}

        {/* Email */}
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">ইমেইল ঠিকানা</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="example@gmail.com"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-gray-800"
            autoComplete="email"
            onKeyDown={e => e.key === 'Enter' && document.getElementById('pwd-input')?.focus()}
          />
        </div>

        {/* Password */}
        {mode !== 'forgot' && (
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">পাসওয়ার্ড</label>
            <input
              id="pwd-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'কমপক্ষে ৬ অক্ষর' : '••••••••'}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-gray-800"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (mode === 'login') handleLogin()
                  else document.getElementById('confirm-input')?.focus()
                }
              }}
            />
          </div>
        )}

        {/* Confirm password */}
        {mode === 'signup' && (
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">পাসওয়ার্ড নিশ্চিত করুন</label>
            <input
              id="confirm-input"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="একই পাসওয়ার্ড আবার দিন"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-gray-800"
              autoComplete="new-password"
              onKeyDown={e => e.key === 'Enter' && handleSignup()}
            />
          </div>
        )}

        {/* Error */}
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        {/* Forgot password link */}
        {mode === 'login' && (
          <div className="text-right mb-1">
            <button
              onClick={() => { setMode('forgot'); setError(''); setMessage('') }}
              className="text-primary text-sm"
            >
              পাসওয়ার্ড ভুলে গেছেন?
            </button>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full mt-4 py-3.5 bg-primary text-white font-semibold rounded-xl disabled:opacity-50 active:scale-98 transition-all"
        >
          {loading
            ? 'অপেক্ষা করুন...'
            : mode === 'login'
            ? 'লগইন করুন →'
            : mode === 'signup'
            ? 'অ্যাকাউন্ট তৈরি করুন →'
            : 'রিসেট লিংক পাঠান →'}
        </button>

        {/* Back (forgot mode) */}
        {mode === 'forgot' && (
          <button
            onClick={() => { setMode('login'); setError(''); setMessage('') }}
            className="w-full mt-3 py-2 text-gray-500 text-sm"
          >
            ← লগইনে ফিরুন
          </button>
        )}
      </div>

      <p className="mt-8 text-blue-200 text-xs text-center">
        সম্পূর্ণ বিনামূল্যে • কোনো বিজ্ঞাপন নেই
      </p>
    </div>
  )
}
