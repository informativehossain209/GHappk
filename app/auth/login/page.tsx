'use client'
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { hashPin } from '@/lib/utils'
import { X } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const { setUser, setIsViewer, user } = useAuthStore()
  const [step, setStep] = useState<'phone' | 'pin'>('phone')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [foundUser, setFoundUser] = useState<{ id: string; name: string; pin: string } | null>(null)
  // For viewer: if logged-in user has multiple owners, let them pick
  const [viewerOwners, setViewerOwners] = useState<{ id: string; name: string; phone: string }[]>([])

  useEffect(() => {
    if (user) router.replace('/home')
  }, [user, router])

  const handlePhoneNext = async () => {
    if (!phone.trim() || phone.length < 11) {
      setError('সঠিক মোবাইল নম্বর দিন')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data, error: dbErr } = await supabase
        .from('users')
        .select('id, name, pin')
        .eq('phone', phone.trim())
        .single()
      if (dbErr || !data) {
        setError('এই নম্বরে কোনো অ্যাকাউন্ট নেই')
        setLoading(false)
        return
      }
      setFoundUser(data)
      setStep('pin')
    } catch {
      setError('কোনো সমস্যা হয়েছে। আবার চেষ্টা করুন।')
    } finally {
      setLoading(false)
    }
  }

  const handlePinInput = (digit: string) => {
    if (pin.length < 4) {
      const newPin = pin + digit
      setPin(newPin)
      setError('')
      if (newPin.length === 4) handleLogin(newPin)
    }
  }

  const handleDelete = () => {
    setPin((p) => p.slice(0, -1))
    setError('')
  }

  const handleLogin = async (pinValue: string) => {
    if (!foundUser) return
    setLoading(true)
    setError('')
    try {
      const hashed = hashPin(pinValue)
      if (hashed !== foundUser.pin) {
        setError('ভুল পিন। আবার চেষ্টা করুন।')
        setPin('')
        setLoading(false)
        return
      }
      const { data } = await supabase.from('users').select('*').eq('id', foundUser.id).single()
      if (data) {
        setUser(data)
        // Check if this user is a viewer for someone else's account
        const { data: sharedRows } = await supabase
          .from('shared_access')
          .select('owner_user_id, owner:users!shared_access_owner_user_id_fkey(id, name, phone)')
          .eq('viewer_user_id', foundUser.id)
          .eq('permission', 'view')

        if (sharedRows && sharedRows.length > 0) {
          const owners = sharedRows.map((r: any) => r.owner).filter(Boolean)
          if (owners.length === 1) {
            // Only one owner — go straight to viewer mode
            setIsViewer(true, owners[0].id)
            router.replace('/home')
          } else {
            // Multiple owners — let user pick
            setViewerOwners(owners)
          }
        } else {
          // Regular owner account
          setIsViewer(false)
          router.replace('/home')
        }
      }
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
      <div className="flex-1 flex flex-col items-center justify-center px-8 pt-16 pb-8">
        <div className="mb-8 text-center animate-fade-in">
          <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm shadow-lg">
            <span className="text-4xl">🏠</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">ঘর খরচ</h1>
          <p className="text-primary-100 text-sm">আপনার পারিবারিক হিসাব</p>
        </div>

        <div className="bg-white/15 backdrop-blur-md rounded-3xl p-8 w-full max-w-sm shadow-xl animate-slide-up">
          {step === 'phone' && (
            <div className="space-y-4">
              <p className="text-center text-white/80 text-sm mb-4 font-medium">আপনার মোবাইল নম্বর দিন</p>
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value.replace(/\D/, '').slice(0, 11)); setError('') }}
                placeholder="017XXXXXXXX"
                maxLength={11}
                inputMode="numeric"
                className="w-full bg-white/20 border border-white/20 rounded-xl px-4 py-3.5 text-white placeholder-white/40 focus:outline-none focus:border-white/60 text-lg text-center tracking-widest"
                autoFocus
              />
              {error && <p className="text-center text-red-300 text-sm bg-red-500/20 py-2 px-4 rounded-xl">{error}</p>}
              <button
                onClick={handlePhoneNext}
                disabled={loading || phone.length < 11}
                className="w-full bg-accent-400 hover:bg-accent-500 text-white font-semibold py-3.5 rounded-xl transition-all active:scale-95 disabled:opacity-60"
              >
                {loading ? 'অপেক্ষা করুন...' : 'পরবর্তী →'}
              </button>
            </div>
          )}

          {step === 'pin' && foundUser && (
            <>
              <div className="flex items-center gap-3 mb-5">
                <button onClick={() => { setStep('phone'); setPin(''); setError('') }} className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white text-sm">←</button>
                <p className="text-white/80 text-sm font-medium">স্বাগতম, <span className="text-white font-bold">{foundUser.name}</span></p>
              </div>
              <p className="text-center text-white/70 text-sm mb-6">আপনার পিন দিন</p>
              <div className="flex justify-center gap-4 mb-8">
                {dots.map((_, i) => (
                  <div key={i} className={`w-4 h-4 rounded-full transition-all duration-200 ${i < pin.length ? 'bg-accent-400 scale-110 shadow-lg shadow-accent-400/50' : 'bg-white/30'}`} />
                ))}
              </div>
              {error && <p className="text-center text-red-300 text-sm mb-4 bg-red-500/20 py-2 px-4 rounded-xl">{error}</p>}
              <div className="grid grid-cols-3 gap-3">
                {[1,2,3,4,5,6,7,8,9].map((n) => (
                  <button key={n} onClick={() => handlePinInput(String(n))} disabled={loading}
                    className="h-14 rounded-2xl bg-white/20 text-white text-xl font-semibold active:bg-white/40 active:scale-95 transition-all duration-100 disabled:opacity-50">{n}</button>
                ))}
                <div />
                <button onClick={() => handlePinInput('0')} disabled={loading}
                  className="h-14 rounded-2xl bg-white/20 text-white text-xl font-semibold active:bg-white/40 active:scale-95 transition-all duration-100 disabled:opacity-50">0</button>
                <button onClick={handleDelete} className="h-14 rounded-2xl bg-white/10 text-white text-xl active:bg-white/30 active:scale-95 transition-all duration-100">⌫</button>
              </div>
              {loading && <div className="flex justify-center mt-6"><div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" /></div>}
            </>
          )}
        </div>
      </div>
      <div className="text-center pb-8 px-4">
        <p className="text-white/60 text-sm">
          নতুন অ্যাকাউন্ট?{' '}
          <Link href="/auth/register" className="text-accent-300 font-semibold underline">রেজিস্ট্রেশন করুন</Link>
        </p>
        <p className="text-white/30 text-xs mt-4">Developed by Sakib Hossain</p>
      </div>

      {/* Owner picker modal for viewers with multiple owners */}
      {viewerOwners.length > 1 && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{backgroundColor:'rgba(0,0,0,0.6)'}}>
          <div className="bg-white rounded-t-3xl w-full max-w-md p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">👁️ কোন অ্যাকাউন্ট দেখবেন?</h3>
              <button onClick={() => setViewerOwners([])} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X size={16} className="text-gray-600" />
              </button>
            </div>
            <p className="text-gray-500 text-sm mb-4">আপনি একাধিক অ্যাকাউন্টের ভিউয়ার। কোনটি দেখতে চান বেছে নিন।</p>
            <div className="space-y-2">
              {viewerOwners.map(owner => (
                <button key={owner.id}
                  onClick={() => { setIsViewer(true, owner.id); router.replace('/home') }}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border border-gray-200 active:bg-primary-50 active:border-primary-300 transition-all text-left">
                  <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                    {owner.name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{owner.name}</p>
                    <p className="text-xs text-gray-400">{owner.phone}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
