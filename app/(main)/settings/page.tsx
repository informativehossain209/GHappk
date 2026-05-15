'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const supabase = createBrowserClient()
  const router = useRouter()
  const [profile, setProfile] = useState({ full_name: '', phone: '', address: '', month_start: 1, notif_on: true })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [customCatName, setCustomCatName] = useState('')
  const [customCatIcon, setCustomCatIcon] = useState('📦')
  const [customCatType, setCustomCatType] = useState<'expense' | 'income'>('expense')
  const [customCats, setCustomCats] = useState<any[]>([])
  const [showAddCat, setShowAddCat] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) setProfile(data)

    const { data: cats } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
    setCustomCats(cats || [])
  }

  const saveProfile = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').upsert({ id: user.id, ...profile })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
  }

  const addCustomCategory = async () => {
    if (!customCatName.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('categories').insert({
      user_id: user.id,
      name: customCatName,
      icon: customCatIcon,
      type: customCatType,
      is_preset: false,
    })
    setCustomCatName('')
    setShowAddCat(false)
    load()
  }

  const deleteCategory = async (id: string) => {
    await supabase.from('categories').delete().eq('id', id)
    load()
  }

  const exportData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('transactions').select('*, categories(name, icon)').eq('user_id', user.id)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gharkhoroch_export_${new Date().toISOString().split('T')[0]}.json`
    a.click()
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-primary px-4 pt-12 pb-6">
        <h1 className="text-white text-xl font-bold text-center">⚙️ সেটিংস</h1>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Profile */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <span>👤</span> ব্যক্তিগত তথ্য
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">পুরো নাম</label>
              <input
                type="text"
                value={profile.full_name}
                onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
                placeholder="মো. রহিম উদ্দিন"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">মোবাইল নম্বর</label>
              <input
                type="tel"
                value={profile.phone}
                onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                placeholder="+8801712345678"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ঠিকানা</label>
              <input
                type="text"
                value={profile.address}
                onChange={e => setProfile(p => ({ ...p, address: e.target.value }))}
                placeholder="ঢাকা, মিরপুর-১০"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <span>🔧</span> পছন্দসমূহ
          </h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-600 block mb-2">মাসের শুরুর দিন</label>
              <div className="flex gap-3">
                {[1, 26].map(d => (
                  <button
                    key={d}
                    onClick={() => setProfile(p => ({ ...p, month_start: d }))}
                    className={`flex-1 py-2.5 rounded-xl border-2 font-medium transition-all ${
                      profile.month_start === d
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    {d} তারিখ
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">নোটিফিকেশন</p>
                <p className="text-xs text-gray-400">রিমাইন্ডার ও সতর্কতা</p>
              </div>
              <button
                onClick={() => setProfile(p => ({ ...p, notif_on: !p.notif_on }))}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  profile.notif_on ? 'bg-primary' : 'bg-gray-200'
                }`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                  profile.notif_on ? 'left-[26px]' : 'left-0.5'
                }`} />
              </button>
            </div>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={saveProfile}
          disabled={saving}
          className={`w-full py-3.5 rounded-2xl font-bold text-white transition-all ${
            saved ? 'bg-green-500' : 'bg-primary'
          }`}
        >
          {saved ? '✅ সংরক্ষিত হয়েছে' : saving ? 'সংরক্ষণ হচ্ছে...' : '💾 সংরক্ষণ করুন'}
        </button>

        {/* Custom categories */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <span>🏷️</span> কাস্টম ক্যাটাগরি
            </h3>
            <button onClick={() => setShowAddCat(!showAddCat)} className="text-primary text-sm font-medium">
              + যোগ করুন
            </button>
          </div>

          {showAddCat && (
            <div className="border border-gray-100 rounded-xl p-3 mb-3 bg-gray-50 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customCatIcon}
                  onChange={e => setCustomCatIcon(e.target.value)}
                  className="w-12 border border-gray-200 rounded-lg px-2 py-2 text-center"
                  maxLength={2}
                />
                <input
                  type="text"
                  value={customCatName}
                  onChange={e => setCustomCatName(e.target.value)}
                  placeholder="ক্যাটাগরির নাম"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-primary text-sm"
                />
              </div>
              <div className="flex gap-2">
                {(['expense', 'income'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setCustomCatType(t)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      customCatType === t ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-500'
                    }`}
                  >
                    {t === 'expense' ? 'খরচ' : 'আয়'}
                  </button>
                ))}
              </div>
              <button onClick={addCustomCategory} className="w-full py-2 bg-primary text-white rounded-lg text-sm font-medium">
                সংরক্ষণ করুন
              </button>
            </div>
          )}

          {customCats.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-2">কোনো কাস্টম ক্যাটাগরি নেই</p>
          ) : (
            <div className="space-y-2">
              {customCats.map(cat => (
                <div key={cat.id} className="flex items-center justify-between py-1.5">
                  <span className="flex items-center gap-2 text-gray-700">
                    <span>{cat.icon}</span>
                    <span className="text-sm">{cat.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      cat.type === 'expense' ? 'bg-red-100 text-red-500' : 'bg-green-100 text-green-600'
                    }`}>{cat.type === 'expense' ? 'খরচ' : 'আয়'}</span>
                  </span>
                  <button onClick={() => deleteCategory(cat.id)} className="text-red-400 text-sm">মুছুন</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Export */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span>📤</span> ডেটা এক্সপোর্ট
          </h3>
          <button
            onClick={exportData}
            className="w-full py-3 border-2 border-primary text-primary rounded-xl font-medium"
          >
            JSON ফাইল ডাউনলোড করুন
          </button>
        </div>

        {/* About */}
        <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
          <div className="text-3xl mb-2">🏠</div>
          <p className="font-semibold text-gray-800">ঘর খরচ</p>
          <p className="text-gray-400 text-xs mt-1">সংস্করণ ১.০ • সম্পূর্ণ বিনামূল্যে</p>
          <p className="text-gray-400 text-xs">Made with ❤️ for Bangladesh</p>
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className="w-full py-3.5 bg-red-50 text-red-500 border border-red-200 rounded-2xl font-semibold"
        >
          🚪 লগআউট
        </button>
        <div className="h-4" />
      </div>
    </div>
  )
}
