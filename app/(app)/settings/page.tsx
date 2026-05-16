'use client'
export const dynamic = 'force-dynamic';

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { hashPin } from '@/lib/utils'

export default function SettingsPage() {
  const router = useRouter()
  const { user, setUser, logout } = useAuthStore()
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '', address: user?.address || '' })
  const [pinForm, setPinForm] = useState({ currentPin: '', newPin: '', confirmPin: '' })
  const [message, setMessage] = useState({ type: '', text: '' })
  const [loading, setLoading] = useState(false)

  // Viewer management
  const [viewerPhone, setViewerPhone] = useState('')
  const [viewerPin, setViewerPin] = useState('')

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage({ type: '', text: '' }), 3000)
  }

  const handleUpdateProfile = async () => {
    if (!user || !form.name.trim()) return
    setLoading(true)
    const { data } = await supabase
      .from('users')
      .update({ name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() })
      .eq('id', user.id)
      .select()
      .single()
    if (data) {
      setUser(data)
      showMsg('success', 'প্রোফাইল আপডেট হয়েছে ✅')
    }
    setLoading(false)
  }

  const handleChangePin = async () => {
    if (!user) return
    if (pinForm.newPin.length !== 4) return showMsg('error', '৪ সংখ্যার পিন দিন')
    if (pinForm.newPin !== pinForm.confirmPin) return showMsg('error', 'পিন মিলছে না')
    const currentHashed = hashPin(pinForm.currentPin)
    if (currentHashed !== user.pin) return showMsg('error', 'বর্তমান পিন ভুল')

    setLoading(true)
    const newHashed = hashPin(pinForm.newPin)

    // Check uniqueness
    const { data: existing } = await supabase.from('users').select('id').eq('pin', newHashed).neq('id', user.id)
    if (existing && existing.length > 0) {
      showMsg('error', 'এই পিন ইতিমধ্যে ব্যবহৃত')
      setLoading(false)
      return
    }

    const { data } = await supabase.from('users').update({ pin: newHashed }).eq('id', user.id).select().single()
    if (data) {
      setUser(data)
      setPinForm({ currentPin: '', newPin: '', confirmPin: '' })
      showMsg('success', 'পিন পরিবর্তন হয়েছে ✅')
    }
    setLoading(false)
  }

  const handleAddViewer = async () => {
    if (!user || !viewerPhone || !viewerPin) return
    const hashedPin = hashPin(viewerPin)
    const { data: existingUser } = await supabase.from('users').select('id').eq('phone', viewerPhone).single()
    if (existingUser) {
      // Add access for existing user
      await supabase.from('shared_access').upsert({
        owner_user_id: user.id,
        viewer_user_id: existingUser.id,
        permission: 'view',
      })
      showMsg('success', 'ভিউয়ার অ্যাক্সেস দেওয়া হয়েছে ✅')
    } else {
      // Create viewer user
      const { data: newViewer } = await supabase.from('users').insert({
        name: 'ভিউয়ার', phone: viewerPhone, pin: hashedPin,
      }).select().single()
      if (newViewer) {
        await supabase.from('shared_access').insert({
          owner_user_id: user.id, viewer_user_id: newViewer.id, permission: 'view',
        })
        showMsg('success', 'নতুন ভিউয়ার তৈরি হয়েছে ✅')
      }
    }
    setViewerPhone('')
    setViewerPin('')
  }

  const handleLogout = () => {
    logout()
    router.replace('/auth/login')
  }

  const sections = [
    { id: 'profile', icon: '👤', title: 'প্রোফাইল', desc: 'নাম, নম্বর, ঠিকানা' },
    { id: 'security', icon: '🔐', title: 'নিরাপত্তা', desc: 'পিন পরিবর্তন' },
    { id: 'viewer', icon: '👁️', title: 'ভিউয়ার', desc: 'অ্যাক্সেস শেয়ার করুন' },
  ]

  return (
    <div className="min-h-full bg-bg">
      <div className="bg-white px-5 pt-12 pb-4 shadow-sm">
        <h1 className="text-xl font-bold text-gray-800">⚙️ সেটিংস</h1>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* User Card */}
        <div className="card p-4 flex items-center gap-4 bg-gradient-to-r from-primary-50 to-primary-100 border border-primary-100">
          <div className="w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center text-2xl text-white font-bold shadow">
            {user?.name?.charAt(0) || '?'}
          </div>
          <div>
            <p className="font-bold text-gray-800 text-lg">{user?.name}</p>
            <p className="text-gray-500 text-sm">{user?.phone}</p>
          </div>
        </div>

        {/* Message */}
        {message.text && (
          <div className={`card p-3 text-sm text-center ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {message.text}
          </div>
        )}

        {/* Sections */}
        {sections.map((section) => (
          <div key={section.id} className="card overflow-hidden">
            <button
              onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
              className="w-full flex items-center gap-3 p-4 active:bg-gray-50 transition-all"
            >
              <span className="text-2xl">{section.icon}</span>
              <div className="flex-1 text-left">
                <p className="font-semibold text-gray-800">{section.title}</p>
                <p className="text-xs text-gray-400">{section.desc}</p>
              </div>
              <span className="text-gray-400 transition-transform duration-200" style={{ transform: activeSection === section.id ? 'rotate(180deg)' : 'none' }}>▼</span>
            </button>

            {activeSection === section.id && (
              <div className="border-t border-gray-100 p-4 animate-slide-up">
                {section.id === 'profile' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">নাম</label>
                      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-400" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">মোবাইল নম্বর</label>
                      <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-400" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">ঠিকানা</label>
                      <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-400" />
                    </div>
                    <button onClick={handleUpdateProfile} disabled={loading} className="w-full bg-primary-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-60">
                      {loading ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
                    </button>
                  </div>
                )}

                {section.id === 'security' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">বর্তমান পিন</label>
                      <input type="password" maxLength={4} inputMode="numeric" value={pinForm.currentPin} onChange={(e) => setPinForm({ ...pinForm, currentPin: e.target.value.replace(/\D/, '') })} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-center text-xl tracking-widest focus:outline-none focus:border-primary-400" placeholder="••••" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">নতুন পিন</label>
                      <input type="password" maxLength={4} inputMode="numeric" value={pinForm.newPin} onChange={(e) => setPinForm({ ...pinForm, newPin: e.target.value.replace(/\D/, '') })} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-center text-xl tracking-widest focus:outline-none focus:border-primary-400" placeholder="••••" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">নতুন পিন নিশ্চিত করুন</label>
                      <input type="password" maxLength={4} inputMode="numeric" value={pinForm.confirmPin} onChange={(e) => setPinForm({ ...pinForm, confirmPin: e.target.value.replace(/\D/, '') })} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-center text-xl tracking-widest focus:outline-none focus:border-primary-400" placeholder="••••" />
                    </div>
                    <button onClick={handleChangePin} disabled={loading} className="w-full bg-primary-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-60">
                      পিন পরিবর্তন করুন
                    </button>
                  </div>
                )}

                {section.id === 'viewer' && (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">অন্য কাউকে শুধু দেখার অনুমতি দিন</p>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">মোবাইল নম্বর</label>
                      <input value={viewerPhone} onChange={(e) => setViewerPhone(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-400" placeholder="017XXXXXXXX" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">তাদের পিন (নতুন হলে)</label>
                      <input type="password" maxLength={4} inputMode="numeric" value={viewerPin} onChange={(e) => setViewerPin(e.target.value.replace(/\D/, ''))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-center text-xl tracking-widest focus:outline-none focus:border-primary-400" placeholder="••••" />
                    </div>
                    <button onClick={handleAddViewer} className="w-full bg-primary-600 text-white py-3 rounded-xl text-sm font-semibold">
                      ভিউয়ার যোগ করুন
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full card p-4 text-danger font-semibold text-center active:scale-95 transition-all border border-red-100"
        >
          🚪 লগ আউট করুন
        </button>

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs text-gray-400">সংস্করণ ১.০.০</p>
          <p className="text-xs text-gray-500 font-semibold mt-1">Developed by Sakib Hossain</p>
          <p className="text-xs text-gray-300 mt-1">ঘর খরচ — পারিবারিক হিসাব</p>
        </div>
      </div>
    </div>
  )
}
