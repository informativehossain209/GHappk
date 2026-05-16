'use client'
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { Transaction } from '@/types'
import { formatCurrency, toBengaliNumber } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Filter = 'daily' | 'monthly' | 'yearly' | 'custom'

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
  if (filter === 'daily') {
    const d = new Date(ref); d.setDate(d.getDate() + dir); return d.toISOString().split('T')[0]
  }
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
  const { user } = useAuthStore()
  const todayStr = new Date().toISOString().split('T')[0]
  const monthStr = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  const yearStr = String(new Date().getFullYear())

  const [filter, setFilter] = useState<Filter>('monthly')
  const [ref, setRef] = useState(monthStr)
  const [customFrom, setCustomFrom] = useState(todayStr)
  const [customTo, setCustomTo] = useState(todayStr)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (filter === 'daily') setRef(todayStr)
    else if (filter === 'monthly') setRef(monthStr)
    else if (filter === 'yearly') setRef(yearStr)
  }, [filter])

  const fetchTransactions = useCallback(async () => {
    if (!user) return
    const { start, end } = getDateRange(filter, ref, customFrom, customTo)
    if (!start || !end || start > end) return
    setLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('*, category:categories(name, icon, color)')
      .eq('user_id', user.id)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })
    setTransactions(data || [])
    setLoading(false)
  }, [user, filter, ref, customFrom, customTo])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0)
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0)
  const profit = totalIncome - totalExpense

  const grouped: Record<string, Transaction[]> = {}
  transactions.forEach(t => { if (!grouped[t.date]) grouped[t.date]=[]; grouped[t.date].push(t) })
  const sortedDates = Object.keys(grouped).sort((a,b) => b.localeCompare(a))

  return (
    <div className="min-h-full bg-bg pb-24">
      <div className="bg-white px-5 pt-12 pb-4 shadow-sm">
        <h1 className="text-xl font-bold text-gray-800 mb-4">📊 রিপোর্ট</h1>
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
            <button onClick={() => setRef(r => shiftRef(filter,r,-1))}
              className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
            <span className="text-sm font-bold text-gray-700">{formatRefLabel(filter, ref)}</span>
            <button onClick={() => setRef(r => shiftRef(filter,r,1))}
              className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
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
            <span className="text-4xl block mb-2">📭</span>
            <p className="text-gray-400 text-sm">এই সময়ে কোনো লেনদেন নেই</p>
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
                  {/* Date header */}
                  <div className="px-4 py-2.5 bg-primary-50 border-b border-primary-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-primary-700">{fmtDay(date)}</span>
                    <div className="flex gap-3 text-xs font-semibold">
                      {dayIncome>0 && <span className="text-success">+{formatCurrency(dayIncome)}</span>}
                      {dayExpense>0 && <span className="text-danger">-{formatCurrency(dayExpense)}</span>}
                    </div>
                  </div>

                  {/* Income */}
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
                          <p className="text-sm font-bold text-success">+{formatCurrency(tx.amount)}</p>
                        </div>
                      ))}
                      <div className="px-4 py-2 bg-green-50 border-b border-green-100 flex justify-between">
                        <span className="text-xs text-gray-400">আয়ের মোট</span>
                        <span className="text-xs font-bold text-success">{formatCurrency(dayIncome)}</span>
                      </div>
                    </>
                  )}

                  {/* Expense */}
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
                          <p className="text-sm font-bold text-danger">-{formatCurrency(tx.amount)}</p>
                        </div>
                      ))}
                      <div className="px-4 py-2 bg-red-50 border-b border-red-100 flex justify-between">
                        <span className="text-xs text-gray-400">খরচের মোট</span>
                        <span className="text-xs font-bold text-danger">{formatCurrency(dayExpense)}</span>
                      </div>
                    </>
                  )}

                  {/* Day net */}
                  <div className="px-4 py-2.5 bg-gray-50 flex justify-between items-center">
                    <span className="text-xs font-semibold text-gray-500">দিনের নিট</span>
                    <span className={cn('text-sm font-bold', dayProfit>=0?'text-primary-600':'text-danger')}>
                      {dayProfit>=0?'+':''}{formatCurrency(dayProfit)}
                    </span>
                  </div>
                </div>
              )
            })}

            {/* Grand total */}
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
    </div>
  )
}
