'use client'
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatShortDate, getGreeting, getCurrentMonthRange, hashPin, cn } from '@/lib/utils'
import { Transaction, Notice, Todo } from '@/types'
import Link from 'next/link'
import { Pencil, Trash2, X, TrendingUp, TrendingDown } from 'lucide-react'

type ModalMode = 'pin-delete' | 'pin-edit' | 'edit' | null

export default function HomePage() {
  const { user, isViewer, viewingUserId } = useAuthStore()
  const effectiveUserId = viewingUserId || user?.id
  const [summary, setSummary] = useState({ income: 0, expense: 0 })
  const [lastMonthExpense, setLastMonthExpense] = useState(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [todayExpense, setTodayExpense] = useState(0)

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [targetTx, setTargetTx] = useState<Transaction | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [editCategories, setEditCategories] = useState<any[]>([])
  const [editForm, setEditForm] = useState({ amount: '', category_id: '', date: '', note: '' })
  const [actionLoading, setActionLoading] = useState(false)

  const fetchData = useCallback(async () => {
    if (!user || !effectiveUserId) return
    setLoading(true)
    const { start, end } = getCurrentMonthRange()
    const todayStr = new Date().toISOString().split('T')[0]

    // Last month range
    const now = new Date()
    const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
    const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]

    const [txRes, noticeRes, todoRes, lmRes] = await Promise.all([
      supabase.from('transactions')
        .select('*, category:categories(name, icon, color)')
        .eq('user_id', effectiveUserId).gte('date', start).lte('date', end)
        .order('date', { ascending: false }),
      supabase.from('notices').select('*').eq('user_id', effectiveUserId).eq('is_read', false)
        .order('created_at', { ascending: false }).limit(3),
      supabase.from('todos').select('*').eq('user_id', effectiveUserId).eq('completed', false)
        .order('date', { ascending: true }).limit(3),
      supabase.from('transactions').select('amount').eq('user_id', effectiveUserId)
        .eq('type', 'expense').gte('date', lmStart).lte('date', lmEnd),
    ])

    const txData = txRes.data || []
    const income = txData.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = txData.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const todayExp = txData.filter(t => t.type === 'expense' && t.date === todayStr).reduce((s,t) => s+t.amount, 0)
    const lmExp = (lmRes.data || []).reduce((s: number, t: any) => s + t.amount, 0)

    setSummary({ income, expense })
    setTodayExpense(todayExp)
    setLastMonthExpense(lmExp)
    setTransactions(txData.slice(0, 6))
    setNotices(noticeRes.data || [])
    setTodos(todoRes.data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetchData() }, [fetchData])

  const dismissNotice = async (id: string) => {
    await supabase.from('notices').update({ is_read: true }).eq('id', id)
    setNotices(n => n.filter(no => no.id !== id))
  }

  const completeTodo = async (id: string) => {
    await supabase.from('todos').update({ completed: true }).eq('id', id)
    setTodos(t => t.filter(td => td.id !== id))
  }

  const openDeleteModal = (tx: Transaction) => {
    setTargetTx(tx); setPinInput(''); setPinError(''); setModalMode('pin-delete')
  }
  const openEditModal = (tx: Transaction) => {
    setTargetTx(tx); setPinInput(''); setPinError(''); setModalMode('pin-edit')
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
      setPinError('ভুল পিন'); setPinInput(''); return
    }
    if (modalMode === 'pin-delete') {
      await doDelete()
    } else if (modalMode === 'pin-edit' && targetTx) {
      const { data: cats } = await supabase.from('categories').select('*').eq('user_id', effectiveUserId).eq('type', targetTx.type)
      setEditCategories(cats || [])
      setEditForm({ amount: String(targetTx.amount), category_id: targetTx.category_id, date: targetTx.date, note: targetTx.note || '' })
      setModalMode('edit')
    }
  }

  const doDelete = async () => {
    if (!targetTx) return
    setActionLoading(true)
    await supabase.from('transactions').delete().eq('id', targetTx.id)
    setTransactions(prev => prev.filter(t => t.id !== targetTx.id))
    const deleted = targetTx
    setSummary(s => ({
      income: deleted.type === 'income' ? s.income - deleted.amount : s.income,
      expense: deleted.type === 'expense' ? s.expense - deleted.amount : s.expense,
    }))
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
      ...t, amount: parseFloat(editForm.amount), category_id: editForm.category_id,
      date: editForm.date, note: editForm.note || undefined, category: updatedCat || t.category,
    } : t))
    setActionLoading(false)
    closeModal()
    fetchData()
  }

  const closeModal = () => { setModalMode(null); setTargetTx(null); setPinInput(''); setPinError('') }

  const savings = summary.income - summary.expense
  const bengaliMonths = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর']
  const currentMonth = bengaliMonths[new Date().getMonth()]

  // Spending insights
  const today = new Date()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const daysPassed = today.getDate()
  const daysLeft = daysInMonth - daysPassed
  const dailyAvg = daysPassed > 0 ? summary.expense / daysPassed : 0
  const projectedExpense = dailyAvg * daysInMonth
  const monthProgress = (daysPassed / daysInMonth) * 100
  const expenseProgress = summary.income > 0 ? (summary.expense / summary.income) * 100 : 0
  const vsLastMonth = lastMonthExpense > 0 ? ((summary.expense - lastMonthExpense) / lastMonthExpense) * 100 : 0

  const pinDots = Array(4).fill(0)

  return (
    <div className="min-h-full bg-bg">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary-600 via-primary-500 to-primary-700 px-5 pt-12 pb-24 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-4 w-32 h-32 bg-white rounded-full" />
          <div className="absolute bottom-0 left-8 w-20 h-20 bg-white rounded-full" />
        </div>
        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="text-white/70 text-sm">{getGreeting()},</p>
              <h2 className="text-white text-xl font-bold">{user?.name} 👋</h2>
            </div>
            <Link href="/settings" className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <span className="text-lg">⚙️</span>
            </Link>
          </div>
          <p className="text-white/60 text-xs mt-1">{currentMonth} মাসের হিসাব</p>

          <div className="mt-6 bg-white/15 backdrop-blur-md rounded-2xl p-4">
            <p className="text-white/70 text-xs mb-1">এই মাসের সঞ্চয়</p>
            <p className={`text-3xl font-bold ${savings >= 0 ? 'text-white' : 'text-red-300'}`}>
              {formatCurrency(Math.abs(savings))}
              {savings < 0 && <span className="text-sm ml-1 opacity-80">(ঘাটতি)</span>}
            </p>
            {/* Month progress bar */}
            <div className="mt-3">
              <div className="flex justify-between text-white/50 text-[10px] mb-1">
                <span>মাসের অগ্রগতি {Math.round(monthProgress)}%</span>
                <span>{daysLeft} দিন বাকি</span>
              </div>
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white/60 rounded-full transition-all" style={{width:`${monthProgress}%`}} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-5 -mt-12 relative z-10">
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4 bg-white border-l-4 border-success">
            <p className="text-gray-500 text-xs mb-1">আয়</p>
            <p className="text-success font-bold text-lg">{formatCurrency(summary.income)}</p>
          </div>
          <div className="card p-4 bg-white border-l-4 border-danger">
            <p className="text-gray-500 text-xs mb-1">খরচ</p>
            <p className="text-danger font-bold text-lg">{formatCurrency(summary.expense)}</p>
          </div>
        </div>
      </div>

      <div className="px-5 mt-4 pb-4 space-y-4">
        {/* Smart Insights */}
        <div className="card p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
          <p className="text-xs font-bold text-gray-600 mb-3">📈 খরচের বিশ্লেষণ</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-[10px] text-gray-400 mb-1">আজকের খরচ</p>
              <p className="text-sm font-bold text-danger">{formatCurrency(todayExpense)}</p>
            </div>
            <div className="text-center border-x border-blue-100">
              <p className="text-[10px] text-gray-400 mb-1">দৈনিক গড়</p>
              <p className="text-sm font-bold text-primary-600">{formatCurrency(dailyAvg)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-gray-400 mb-1">গত মাস তুলনায়</p>
              {lastMonthExpense > 0 ? (
                <div className="flex items-center justify-center gap-0.5">
                  {vsLastMonth > 0
                    ? <TrendingUp size={12} className="text-danger" />
                    : <TrendingDown size={12} className="text-success" />}
                  <p className={cn('text-sm font-bold', vsLastMonth > 0 ? 'text-danger' : 'text-success')}>
                    {Math.abs(Math.round(vsLastMonth))}%
                  </p>
                </div>
              ) : <p className="text-sm font-bold text-gray-400">—</p>}
            </div>
          </div>
          {summary.income > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                <span>আয়ের কতটুকু খরচ হয়েছে</span>
                <span>{Math.min(100, Math.round(expenseProgress))}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', expenseProgress > 90 ? 'bg-danger' : expenseProgress > 70 ? 'bg-accent-400' : 'bg-success')}
                  style={{width:`${Math.min(100, expenseProgress)}%`}} />
              </div>
            </div>
          )}
        </div>

        {/* Notices */}
        {notices.length > 0 && (
          <div className="space-y-2">
            {notices.map(notice => (
              <div key={notice.id} className={`card p-4 flex items-start gap-3 border-l-4 ${
                notice.type === 'warning' ? 'border-accent-400' :
                notice.type === 'success' ? 'border-success' :
                notice.type === 'alert' ? 'border-danger' : 'border-primary-400'
              }`}>
                <span className="text-xl">
                  {notice.type === 'warning' ? '⚠️' : notice.type === 'success' ? '✅' : notice.type === 'alert' ? '🔔' : 'ℹ️'}
                </span>
                <p className="text-sm text-gray-700 flex-1">{notice.message}</p>
                <button onClick={() => dismissNotice(notice.id)} className="text-gray-400 text-lg leading-none">×</button>
              </div>
            ))}
          </div>
        )}

        {/* Todos */}
        {todos.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-700">📋 রিমাইন্ডার</h3>
            </div>
            <div className="card p-3 space-y-2">
              {todos.map(todo => (
                <div key={todo.id} className="flex items-center gap-3 py-1">
                  <button onClick={() => completeTodo(todo.id)}
                    className="w-5 h-5 border-2 border-primary-400 rounded-full flex-shrink-0 hover:bg-primary-50" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700">{todo.title}</p>
                    {todo.amount && <p className="text-xs text-gray-500">{formatCurrency(todo.amount)}</p>}
                  </div>
                  <p className="text-xs text-gray-400">{formatShortDate(todo.date)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3">
          <Link href="/add" className="card p-4 text-center active:scale-95 transition-all">
            <span className="text-2xl block mb-1">💸</span>
            <p className="text-xs text-gray-600 font-medium">খরচ যোগ</p>
          </Link>
          <Link href="/reports" className="card p-4 text-center active:scale-95 transition-all">
            <span className="text-2xl block mb-1">📊</span>
            <p className="text-xs text-gray-600 font-medium">রিপোর্ট</p>
          </Link>
          <Link href="/budget" className="card p-4 text-center active:scale-95 transition-all">
            <span className="text-2xl block mb-1">🎯</span>
            <p className="text-xs text-gray-600 font-medium">বাজেট</p>
          </Link>
        </div>

        {/* Recent Transactions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-700">🕐 সাম্প্রতিক লেনদেন</h3>
            <Link href="/reports" className="text-xs text-primary-500">সব দেখুন →</Link>
          </div>

          {loading ? (
            <div className="card p-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="card p-8 text-center">
              <span className="text-4xl block mb-2">📝</span>
              <p className="text-gray-500 text-sm">এখনো কোনো লেনদেন নেই</p>
              <Link href="/add" className="text-primary-500 text-sm font-medium mt-1 block">প্রথম লেনদেন যোগ করুন →</Link>
            </div>
          ) : (
            <div className="card divide-y divide-gray-50">
              {transactions.map(tx => (
                <div key={tx.id} className="flex items-center gap-3 p-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{backgroundColor: (tx.category?.color || '#64748B') + '20'}}>
                    {tx.category?.icon || '📦'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{tx.category?.name || 'অন্যান্য'}</p>
                    {tx.note && <p className="text-xs text-gray-400 truncate">{tx.note}</p>}
                    <p className="text-xs text-gray-400">{formatShortDate(tx.date)}</p>
                  </div>
                  <p className={`font-semibold text-sm mr-2 ${tx.type === 'income' ? 'text-success' : 'text-danger'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </p>
                  <div className="flex gap-1 flex-shrink-0">
                    {!isViewer && <>
                      <button onClick={() => openEditModal(tx)} className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center active:scale-95">
                        <Pencil size={11} className="text-blue-500" />
                      </button>
                      <button onClick={() => openDeleteModal(tx)} className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center active:scale-95">
                        <Trash2 size={11} className="text-red-500" />
                      </button>
                    </>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* PIN Modal */}
      {(modalMode === 'pin-delete' || modalMode === 'pin-edit') && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{backgroundColor:'rgba(0,0,0,0.5)'}}>
          <div className="bg-white rounded-t-3xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 text-base">
                {modalMode === 'pin-delete' ? '🗑️ মুছে ফেলুন' : '✏️ সম্পাদনা করুন'}
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
              <button onClick={() => handlePinDigit('0')} className="h-12 rounded-2xl bg-gray-100 text-gray-800 text-lg font-semibold active:bg-gray-200 active:scale-95 transition-all">0</button>
              <button onClick={() => setPinInput(p => p.slice(0,-1))} className="h-12 rounded-2xl bg-gray-100 text-gray-800 text-lg active:bg-gray-200 active:scale-95 transition-all">⌫</button>
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
                  <input type="number" value={editForm.amount} onChange={e => setEditForm({...editForm, amount: e.target.value})}
                    inputMode="decimal" className="flex-1 text-xl font-bold text-gray-800 bg-transparent focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-gray-500 text-xs block mb-1.5">ক্যাটাগরি</label>
                <div className="grid grid-cols-4 gap-2">
                  {editCategories.map(cat => {
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
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none" />
              </div>
              <div>
                <label className="text-gray-500 text-xs block mb-1.5">নোট (ঐচ্ছিক)</label>
                <input type="text" value={editForm.note} onChange={e => setEditForm({...editForm, note: e.target.value})}
                  placeholder="বিস্তারিত লিখুন..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none placeholder-gray-300" />
              </div>
            </div>
            {/* Sticky save button */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 bg-white">
              <button onClick={doEdit} disabled={actionLoading || !editForm.amount || !editForm.category_id}
                className="w-full bg-primary-500 text-white font-bold py-3.5 rounded-2xl transition-all active:scale-95 disabled:opacity-50">
                {actionLoading ? 'সংরক্ষণ হচ্ছে...' : '✅ পরিবর্তন সংরক্ষণ করুন'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
