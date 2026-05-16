'use client'
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { Transaction, Category } from '@/types'
import { formatCurrency, toBengaliNumber, hashPin, cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Pencil, Trash2, Search, X } from 'lucide-react'

type Filter = 'daily' | 'monthly' | 'yearly' | 'custom'
type ModalMode = 'pin-delete' | 'pin-edit' | 'edit' | null

function getDateRange(filter: Filter, ref: string, from: string, to: string) {
  if (filter === 'daily') return { start: ref, end: ref }
  if (filter === 'monthly') {
    const [y, m] = ref.split('-').map(Number)
    const last = new Date(y, m, 0).getDate()
    return { start: `${y}-${String(m).padStart(2,'0')}-01`, end: `${y}-${String(m).padStart(2,'0')}-${String(last).padStart(2,'0')}` }
  }
  if (filter === 'yearly') return { start: `${ref}-01-01`, end: `${ref}-12-31` }
  return { start: from, end: to }
}

function shiftRef(filter: Filter, ref: string, dir: 1 | -1): string {
  if (filter === 'daily') { const d = new Date(ref); d.setDate(d.getDate() + dir); return d.toISOString().split('T')[0] }
  if (filter === 'monthly') {
    const [y, m] = ref.split('-').map(Number)
    const d = new Date(y, m - 1 + dir, 1)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  }
  if (filter === 'yearly') return String(Number(ref) + dir)
  return ref
}

function formatRefLabel(filter: Filter, ref: string): string {
  const bm = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর']
  if (filter === 'daily') {
    const d = new Date(ref)
    const todayStr = new Date().toISOString().split('T')[0]
    const yestStr = new Date(Date.now()-86400000).toISOString().split('T')[0]
    if (ref === todayStr) return 'আজকে'
    if (ref === yestStr) return 'গতকাল'
    return `${toBengaliNumber(d.getDate())} ${bm[d.getMonth()]} ${toBengaliNumber(d.getFullYear())}`
  }
  if (filter === 'monthly') { const [y,m] = ref.split('-').map(Number); return `${bm[m-1]} ${toBengaliNumber(y)}` }
  if (filter === 'yearly') return `${toBengaliNumber(ref)} সাল`
  return ''
}

function fmtDay(dateStr: string): string {
  const d = new Date(dateStr)
  const days = ['রবি','সোম','মঙ্গল','বুধ','বৃহঃ','শুক্র','শনি']
  const months = ['জান','ফেব','মার্চ','এপ্র','মে','জুন','জুল','আগ','সেপ','অক্ট','নভে','ডিসে']
  return `${days[d.getDay()]}, ${toBengaliNumber(d.getDate())} ${months[d.getMonth()]}`
}

const TABS: {key: Filter; label: string}[] = [
  {key:'daily',label:'দৈনিক'},
  {key:'monthly',label:'মাসিক'},
  {key:'yearly',label:'বার্ষিক'},
  {key:'custom',label:'কাস্টম'},
]

export default function ReportsPage() {
  const { user, isViewer, viewingUserId } = useAuthStore()
  const effectiveUserId = viewingUserId || user?.id
  const todayStr = new Date().toISOString().split('T')[0]
  const monthStr = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  const yearStr = String(new Date().getFullYear())

  const [filter, setFilter] = useState<Filter>('monthly')
  const [ref, setRef] = useState(monthStr)
  const [customFrom, setCustomFrom] = useState(todayStr)
  const [customTo, setCustomTo] = useState(todayStr)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [targetTx, setTargetTx] = useState<Transaction | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [editForm, setEditForm] = useState({ amount: '', category_id: '', date: '', note: '' })
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    if (filter === 'daily') setRef(todayStr)
    else if (filter === 'monthly') setRef(monthStr)
    else if (filter === 'yearly') setRef(yearStr)
  }, [filter])

  const fetchTransactions = useCallback(async () => {
    if (!user || !effectiveUserId) return
    const { start, end } = getDateRange(filter, ref, customFrom, customTo)
    if (!start || !end || start > end) return
    setLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('*, category:categories(name, icon, color)')
      .eq('user_id', effectiveUserId)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })
    setTransactions(data || [])
    setLoading(false)
  }, [user, filter, ref, customFrom, customTo])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  const openDeleteModal = (tx: Transaction) => {
    setTargetTx(tx)
    setPinInput('')
    setPinError('')
    setModalMode('pin-delete')
  }

  const openEditModal = (tx: Transaction) => {
    setTargetTx(tx)
    setPinInput('')
    setPinError('')
    setModalMode('pin-edit')
  }

  const handlePinDigit = (d: string) => {
    if (pinInput.length < 4) {
      const np = pinInput + d
      setPinInput(np)
      setPinError('')
      if (np.length === 4) verifyPin(np)
    }
  }

  const verifyPin = async (p: string) => {
    if (!user) return
    const hashed = hashPin(p)
    if (hashed !== user.pin) {
      setPinError('ভুল পিন')
      setPinInput('')
      return
    }
    if (modalMode === 'pin-delete') {
      await doDelete()
    } else if (modalMode === 'pin-edit' && targetTx) {
      // Load categories for editing
      const { data: cats } = await supabase.from('categories').select('*').eq('user_id', effectiveUserId).eq('type', targetTx.type)
      setCategories(cats || [])
      setEditForm({
        amount: String(targetTx.amount),
        category_id: targetTx.category_id,
        date: targetTx.date,
        note: targetTx.note || '',
      })
      setModalMode('edit')
    }
  }

  const doDelete = async () => {
    if (!targetTx) return
    setActionLoading(true)
    await supabase.from('transactions').delete().eq('id', targetTx.id)
    setTransactions(prev => prev.filter(t => t.id !== targetTx.id))
    setActionLoading(false)
    closeModal()
  }

  const doEdit = async () => {
    if (!targetTx || !editForm.amount || !editForm.category_id) return
    setActionLoading(true)
    const { data: updatedCat } = await supabase.from('categories').select('id, user_id, name, icon, color, type, is_default').eq('id', editForm.category_id).single()
    await supabase.from('transactions').update({
      amount: parseFloat(editForm.amount),
      category_id: editForm.category_id,
      date: editForm.date,
      note: editForm.note || null,
    }).eq('id', targetTx.id)
    setTransactions(prev => prev.map(t => t.id === targetTx.id ? {
      ...t,
      amount: parseFloat(editForm.amount),
      category_id: editForm.category_id,
      date: editForm.date,
      note: editForm.note || undefined,
      category: updatedCat || t.category,
    } : t))
    setActionLoading(false)
    closeModal()
  }

  const closeModal = () => {
    setModalMode(null)
    setTargetTx(null)
    setPinInput('')
    setPinError('')
  }

  const displayedTxs = searchQuery.trim()
    ? transactions.filter(t =>
        (t.category?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.note || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : transactions

  const totalIncome = displayedTxs.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0)
  const totalExpense = displayedTxs.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0)
  const profit = totalIncome - totalExpense

  const grouped: Record<string, Transaction[]> = {}
  displayedTxs.forEach(t => { if (!grouped[t.date]) grouped[t.date]=[]; grouped[t.date].push(t) })
  const sortedDates = Object.keys(grouped).sort((a,b) => b.localeCompare(a))

  const pinDots = Array(4).fill(0)

  return (
    <div className="min-h-full bg-bg pb-24">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-800">📊 রিপোর্ট</h1>
          <button onClick={() => setShowSearch(s => !s)} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
            {showSearch ? <X size={16} className="text-gray-600" /> : <Search size={16} className="text-gray-600" />}
          </button>
        </div>

        {showSearch && (
          <div className="mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ক্যাটাগরি বা নোট দিয়ে খুঁজুন..."
              className="w-full bg-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-300"
              autoFocus
            />
          </div>
        )}

        <div className="bg-gray-100 rounded-2xl p-1 flex gap-1">
          {TABS.map(({key, label}) => (
            <button key={key} onClick={() => setFilter(key)}
              className={cn('flex-1 py-2 rounded-xl text-xs font-semibold transition-all',
                filter===key ? 'bg-primary-500 text-white shadow-sm' : 'text-gray-500')}>
              {label}
            </button>
          ))}
        </div>

        {filter !== 'custom' && (
          <div className="flex items-center justify-between mt-3">
            <button onClick={() => setRef(r => shiftRef(filter,r,-1))} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
            <span className="text-sm font-bold text-gray-700">{formatRefLabel(filter, ref)}</span>
            <button onClick={() => setRef(r => shiftRef(filter,r,1))} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
              <ChevronRight size={18} className="text-gray-600" />
            </button>
          </div>
        )}

        {filter === 'custom' && (
          <div className="flex gap-2 mt-3 items-end">
            <div className="flex-1">
              <label className="text-[10px] text-gray-400 block mb-1">শুরু</label>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none" />
            </div>
            <span className="text-gray-300 pb-2">—</span>
            <div className="flex-1">
              <label className="text-[10px] text-gray-400 block mb-1">শেষ</label>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none" />
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-3 text-center">
            <p className="text-[10px] text-gray-400 mb-1">মোট আয়</p>
            <p className="text-success font-bold text-xs">{formatCurrency(totalIncome)}</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-[10px] text-gray-400 mb-1">মোট খরচ</p>
            <p className="text-danger font-bold text-xs">{formatCurrency(totalExpense)}</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-[10px] text-gray-400 mb-1">লাভ/ক্ষতি</p>
            <p className={cn('font-bold text-xs', profit>=0 ? 'text-primary-600' : 'text-danger')}>
              {profit>=0?'+':''}{formatCurrency(profit)}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="card p-10 flex justify-center">
            <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
          </div>
        ) : sortedDates.length === 0 ? (
          <div className="card p-10 text-center">
            <span className="text-4xl block mb-2">{searchQuery ? '🔍' : '📭'}</span>
            <p className="text-gray-400 text-sm">{searchQuery ? 'কোনো ফলাফল পাওয়া যায়নি' : 'এই সময়ে কোনো লেনদেন নেই'}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedDates.map(date => {
              const txList = grouped[date]
              const dayIncome = txList.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0)
              const dayExpense = txList.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0)
              const dayProfit = dayIncome - dayExpense
              const incomeList = txList.filter(t=>t.type==='income')
              const expenseList = txList.filter(t=>t.type==='expense')

              return (
                <div key={date} className="card overflow-hidden">
                  <div className="px-4 py-2.5 bg-primary-50 border-b border-primary-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-primary-700">{fmtDay(date)}</span>
                    <div className="flex gap-3 text-xs font-semibold">
                      {dayIncome>0 && <span className="text-success">+{formatCurrency(dayIncome)}</span>}
                      {dayExpense>0 && <span className="text-danger">-{formatCurrency(dayExpense)}</span>}
                    </div>
                  </div>

                  {incomeList.length > 0 && (
                    <>
                      <div className="px-4 py-1.5 bg-green-50 border-b border-green-100">
                        <span className="text-[10px] font-bold text-success tracking-widest">💰 আয়</span>
                      </div>
                      {incomeList.map(tx => (
                        <div key={tx.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                            style={{backgroundColor:(tx.category?.color||'#22C55E')+'20'}}>
                            {tx.category?.icon||'💰'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{tx.category?.name||'অন্যান্য'}</p>
                            {tx.note && <p className="text-xs text-gray-400 truncate">{tx.note}</p>}
                          </div>
                          <p className="text-sm font-bold text-success mr-2">+{formatCurrency(tx.amount)}</p>
                          <div className="flex gap-1.5 flex-shrink-0">
                            {!isViewer && <>
                              <button onClick={() => openEditModal(tx)} className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center active:scale-95">
                                <Pencil size={12} className="text-blue-500" />
                              </button>
                              <button onClick={() => openDeleteModal(tx)} className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center active:scale-95">
                                <Trash2 size={12} className="text-red-500" />
                              </button>
                            </>}
                          </div>
                        </div>
                      ))}
                      <div className="px-4 py-2 bg-green-50 border-b border-green-100 flex justify-between">
                        <span className="text-xs text-gray-400">আয়ের মোট</span>
                        <span className="text-xs font-bold text-success">{formatCurrency(dayIncome)}</span>
                      </div>
                    </>
                  )}

                  {expenseList.length > 0 && (
                    <>
                      <div className="px-4 py-1.5 bg-red-50 border-b border-red-100">
                        <span className="text-[10px] font-bold text-danger tracking-widest">💸 খরচ</span>
                      </div>
                      {expenseList.map(tx => (
                        <div key={tx.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                            style={{backgroundColor:(tx.category?.color||'#EF4444')+'20'}}>
                            {tx.category?.icon||'💸'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{tx.category?.name||'অন্যান্য'}</p>
                            {tx.note && <p className="text-xs text-gray-400 truncate">{tx.note}</p>}
                          </div>
                          <p className="text-sm font-bold text-danger mr-2">-{formatCurrency(tx.amount)}</p>
                          <div className="flex gap-1.5 flex-shrink-0">
                            {!isViewer && <>
                              <button onClick={() => openEditModal(tx)} className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center active:scale-95">
                                <Pencil size={12} className="text-blue-500" />
                              </button>
                              <button onClick={() => openDeleteModal(tx)} className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center active:scale-95">
                                <Trash2 size={12} className="text-red-500" />
                              </button>
                            </>}
                          </div>
                        </div>
                      ))}
                      <div className="px-4 py-2 bg-red-50 border-b border-red-100 flex justify-between">
                        <span className="text-xs text-gray-400">খরচের মোট</span>
                        <span className="text-xs font-bold text-danger">{formatCurrency(dayExpense)}</span>
                      </div>
                    </>
                  )}

                  <div className="px-4 py-2.5 bg-gray-50 flex justify-between items-center">
                    <span className="text-xs font-semibold text-gray-500">দিনের নিট</span>
                    <span className={cn('text-sm font-bold', dayProfit>=0?'text-primary-600':'text-danger')}>
                      {dayProfit>=0?'+':''}{formatCurrency(dayProfit)}
                    </span>
                  </div>
                </div>
              )
            })}

            <div className="card p-4" style={{border:'2px solid #C8E2F4'}}>
              <p className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wide">সর্বমোট সারসংক্ষেপ</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">মোট আয়</span>
                  <span className="font-bold text-success">{formatCurrency(totalIncome)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">মোট খরচ</span>
                  <span className="font-bold text-danger">{formatCurrency(totalExpense)}</span>
                </div>
                <div className="h-px bg-gray-100" />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-700">নিট লাভ/ক্ষতি</span>
                  <span className={cn('font-bold text-base', profit>=0?'text-primary-600':'text-danger')}>
                    {profit>=0?'+':''}{formatCurrency(profit)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PIN Verification Modal */}
      {(modalMode === 'pin-delete' || modalMode === 'pin-edit') && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{backgroundColor:'rgba(0,0,0,0.5)'}}>
          <div className="bg-white rounded-t-3xl w-full max-w-md p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 text-base">
                {modalMode === 'pin-delete' ? '🗑️ এন্ট্রি মুছে ফেলুন' : '✏️ এন্ট্রি সম্পাদনা করুন'}
              </h3>
              <button onClick={closeModal} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X size={16} className="text-gray-600" />
              </button>
            </div>
            {targetTx && (
              <div className="bg-gray-50 rounded-xl p-3 mb-4 flex items-center gap-3">
                <span className="text-xl">{targetTx.category?.icon || '📦'}</span>
                <div>
                  <p className="text-sm font-medium text-gray-700">{targetTx.category?.name}</p>
                  <p className={cn('text-sm font-bold', targetTx.type==='income'?'text-success':'text-danger')}>
                    {targetTx.type==='income'?'+':'-'}{formatCurrency(targetTx.amount)}
                  </p>
                </div>
              </div>
            )}
            <p className="text-center text-gray-500 text-sm mb-4">নিরাপত্তার জন্য আপনার পিন দিন</p>
            <div className="flex justify-center gap-4 mb-4">
              {pinDots.map((_,i) => (
                <div key={i} className={`w-4 h-4 rounded-full transition-all duration-200 ${i < pinInput.length ? 'bg-primary-500 scale-110' : 'bg-gray-200'}`} />
              ))}
            </div>
            {pinError && <p className="text-center text-red-500 text-sm mb-3">{pinError}</p>}
            <div className="grid grid-cols-3 gap-2">
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <button key={n} onClick={() => handlePinDigit(String(n))}
                  className="h-12 rounded-2xl bg-gray-100 text-gray-800 text-lg font-semibold active:bg-gray-200 active:scale-95 transition-all">{n}</button>
              ))}
              <div />
              <button onClick={() => handlePinDigit('0')}
                className="h-12 rounded-2xl bg-gray-100 text-gray-800 text-lg font-semibold active:bg-gray-200 active:scale-95 transition-all">0</button>
              <button onClick={() => setPinInput(p => p.slice(0,-1))}
                className="h-12 rounded-2xl bg-gray-100 text-gray-800 text-lg active:bg-gray-200 active:scale-95 transition-all">⌫</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {modalMode === 'edit' && targetTx && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{backgroundColor:'rgba(0,0,0,0.5)'}}>
          <div className="bg-white rounded-t-3xl w-full max-w-md flex flex-col" style={{maxHeight:'90vh'}}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
              <h3 className="font-bold text-gray-800 text-base">✏️ এন্ট্রি সম্পাদনা</h3>
              <button onClick={closeModal} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X size={16} className="text-gray-600" />
              </button>
            </div>
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-2">
              <div>
                <label className="text-gray-500 text-xs block mb-1.5">পরিমাণ (টাকা)</label>
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                  <span className={cn('text-xl font-bold', targetTx.type==='income'?'text-success':'text-danger')}>৳</span>
                  <input
                    type="number"
                    value={editForm.amount}
                    onChange={e => setEditForm({...editForm, amount: e.target.value})}
                    inputMode="decimal"
                    className="flex-1 text-xl font-bold text-gray-800 bg-transparent focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-gray-500 text-xs block mb-1.5">ক্যাটাগরি</label>
                <div className="grid grid-cols-4 gap-2">
                  {categories.map(cat => {
                    const selected = editForm.category_id === cat.id
                    return (
                      <button key={cat.id} onClick={() => setEditForm({...editForm, category_id: cat.id})}
                        className="bg-gray-50 border rounded-xl p-2 flex flex-col items-center gap-1 transition-all active:scale-95 relative"
                        style={selected ? {border:'2px solid #1B6CA8', backgroundColor:'#EBF4FB'} : {border:'1px solid #E5E7EB'}}>
                        {selected && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary-500 flex items-center justify-center text-white text-[9px]">✓</span>}
                        <span className="text-xl">{cat.icon}</span>
                        <span className="text-[10px] text-center leading-tight text-gray-600">{cat.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="text-gray-500 text-xs block mb-1.5">তারিখ</label>
                <input type="date" value={editForm.date} onChange={e => setEditForm({...editForm, date: e.target.value})}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:border-primary-300" />
              </div>
              <div>
                <label className="text-gray-500 text-xs block mb-1.5">নোট (ঐচ্ছিক)</label>
                <input type="text" value={editForm.note} onChange={e => setEditForm({...editForm, note: e.target.value})}
                  placeholder="বিস্তারিত লিখুন..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:border-primary-300 placeholder-gray-300" />
              </div>
            </div>
            {/* Sticky save button */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 bg-white">
              <button
                onClick={doEdit}
                disabled={actionLoading || !editForm.amount || !editForm.category_id}
                className="w-full bg-primary-500 text-white font-bold py-3.5 rounded-2xl transition-all active:scale-95 disabled:opacity-50"
              >
                {actionLoading ? 'সংরক্ষণ হচ্ছে...' : '✅ পরিবর্তন সংরক্ষণ করুন'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
