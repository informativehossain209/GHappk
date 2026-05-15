'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'
import ReportList from '@/components/ReportList'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { formatTaka, formatBengaliDate, getMonthRange } from '@/lib/utils'

type Filter = 'daily' | 'monthly' | 'yearly' | 'custom'

const COLORS = ['#1a6fb5','#16a34a','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316']

export default function ReportsPage() {
  const supabase = createBrowserClient()
  const [filter, setFilter] = useState<Filter>('monthly')
  const [transactions, setTransactions] = useState<any[]>([])
  const [summary, setSummary] = useState({ income: 0, expense: 0, savings: 0 })
  const [pieData, setPieData] = useState<any[]>([])
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => { loadReport() }, [filter, customStart, customEnd])

  const getDateRange = () => {
    const today = new Date()
    if (filter === 'daily') {
      const d = today.toISOString().split('T')[0]
      return { start: d, end: d }
    }
    if (filter === 'monthly') return getMonthRange(1)
    if (filter === 'yearly') {
      return { start: `${today.getFullYear()}-01-01`, end: `${today.getFullYear()}-12-31` }
    }
    return { start: customStart, end: customEnd }
  }

  const loadReport = async () => {
    if (filter === 'custom' && (!customStart || !customEnd)) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { start, end } = getDateRange()
    const { data } = await supabase
      .from('transactions')
      .select('*, categories(name, icon, color)')
      .eq('user_id', user.id)
      .gte('transaction_date', start)
      .lte('transaction_date', end)
      .order('transaction_date', { ascending: false })

    const txns = data || []
    const income  = txns.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0)
    const expense = txns.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0)
    setSummary({ income, expense, savings: income - expense })
    setTransactions(txns)

    const catMap: Record<string,{name:string;icon:string;value:number}> = {}
    for (const t of txns.filter(t=>t.type==='expense')) {
      const k = t.categories?.name||'অন্যান্য'
      if (!catMap[k]) catMap[k]={name:k,icon:t.categories?.icon||'📦',value:0}
      catMap[k].value += Number(t.amount)
    }
    setPieData(Object.values(catMap).sort((a,b)=>b.value-a.value))
    setLoading(false)
  }

  /**
   * PDF Export — browser print-to-PDF (Bengali সম্পূর্ণ সাপোর্ট করে)
   */
  const exportPDF = async () => {
    setExporting(true)
    const { start, end } = getDateRange()

    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = user
      ? await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
      : { data: null }

    const userName = prof?.full_name || 'ব্যবহারকারী'
    const filterLabel = { daily: 'দৈনিক', monthly: 'মাসিক', yearly: 'বার্ষিক', custom: 'কাস্টম' }[filter]

    // Group by date for the list
    const grouped: Record<string, any[]> = {}
    for (const t of transactions) {
      const d = t.transaction_date
      if (!grouped[d]) grouped[d] = []
      grouped[d].push(t)
    }

    const rows = Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, txns]) => {
        const dayExpense = txns.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0)
        const dayIncome  = txns.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0)
        const rows = txns.map(t => `
          <tr>
            <td>${t.categories?.icon||'📦'} ${t.categories?.name||'অন্যান্য'}</td>
            <td>${t.note||'—'}</td>
            <td style="color:${t.type==='income'?'#16a34a':'#ef4444'};text-align:right;font-weight:600">
              ${t.type==='income'?'+':'−'} ৳${Number(t.amount).toLocaleString('bn-BD')}
            </td>
          </tr>`).join('')
        return `
          <tr style="background:#f8fafc">
            <td colspan="2" style="font-weight:700;padding:10px 12px">${formatBengaliDate(date)}</td>
            <td style="text-align:right;padding:10px 12px;color:#64748b;font-size:12px">
              ${dayExpense>0?`খরচ: ৳${Math.round(dayExpense).toLocaleString('bn-BD')}`:''}
              ${dayIncome>0?` আয়: ৳${Math.round(dayIncome).toLocaleString('bn-BD')}`:''}
            </td>
          </tr>
          ${rows}`
      }).join('')

    const html = `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="UTF-8">
<title>ঘর খরচ রিপোর্ট</title>
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Hind Siliguri',sans-serif; color:#1e293b; padding:24px; background:#fff; }
  .header { background:linear-gradient(135deg,#1a6fb5,#0f4c8a); color:#fff; border-radius:12px; padding:24px; margin-bottom:24px; }
  .header h1 { font-size:22px; font-weight:700; margin-bottom:4px; }
  .header p { font-size:13px; opacity:0.85; }
  .summary { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:24px; }
  .card { background:#f8fafc; border-radius:10px; padding:16px; text-align:center; }
  .card .label { font-size:12px; color:#64748b; margin-bottom:6px; }
  .card .value { font-size:18px; font-weight:700; }
  .income  { color:#16a34a; }
  .expense { color:#ef4444; }
  .savings { color:#1a6fb5; }
  table { width:100%; border-collapse:collapse; }
  td { padding:8px 12px; border-bottom:1px solid #f1f5f9; font-size:13px; }
  .footer { margin-top:24px; text-align:center; font-size:11px; color:#94a3b8; }
  @media print {
    body { padding:0; }
    .no-print { display:none; }
  }
</style>
</head>
<body>
<div class="header">
  <h1>🏠 ঘর খরচ — ${filterLabel} রিপোর্ট</h1>
  <p>${userName} | ${start} থেকে ${end}</p>
</div>
<div class="summary">
  <div class="card"><div class="label">মোট আয়</div><div class="value income">৳${Math.round(summary.income).toLocaleString('bn-BD')}</div></div>
  <div class="card"><div class="label">মোট খরচ</div><div class="value expense">৳${Math.round(summary.expense).toLocaleString('bn-BD')}</div></div>
  <div class="card"><div class="label">সাশ্রয়</div><div class="value savings">৳${Math.round(summary.savings).toLocaleString('bn-BD')}</div></div>
</div>
${transactions.length > 0 ? `<table>${rows}</table>` : '<p style="text-align:center;color:#94a3b8;padding:40px">এই সময়ে কোনো লেনদেন নেই</p>'}
<div class="footer">ঘর খরচ — আপনার ঘরের হিসাব, আপনার হাতে | ${new Date().toLocaleDateString('bn-BD')}</div>
<script>window.onload=function(){window.print()}<\/script>
</body>
</html>`

    const printWin = window.open('', '_blank', 'width=800,height=900')
    if (printWin) {
      printWin.document.write(html)
      printWin.document.close()
    }
    setExporting(false)
  }

  const filters: {key:Filter;label:string}[] = [
    {key:'daily',label:'দৈনিক'},
    {key:'monthly',label:'মাসিক'},
    {key:'yearly',label:'বার্ষিক'},
    {key:'custom',label:'কাস্টম'},
  ]

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-primary px-4 pt-12 pb-6 flex items-center justify-between">
        <h1 className="text-white text-xl font-bold">📊 রিপোর্ট</h1>
        <button
          onClick={exportPDF}
          disabled={exporting || transactions.length === 0}
          className="flex items-center gap-1.5 bg-white/20 text-white text-xs font-semibold px-3 py-2 rounded-full active:scale-95 transition-all disabled:opacity-40"
        >
          {exporting ? '⏳' : '📄'} PDF
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 px-4 mt-4 overflow-x-auto pb-1">
        {filters.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              filter === f.key ? 'bg-primary text-white shadow' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >{f.label}</button>
        ))}
      </div>

      {/* Custom date range */}
      {filter === 'custom' && (
        <div className="flex gap-2 px-4 mt-3">
          <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary" />
          <span className="self-center text-gray-400 text-sm">থেকে</span>
          <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
      )}

      <div className="px-4 mt-4 space-y-4">
        {/* Summary */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-gray-500 mb-1">মোট আয়</p>
              <p className="text-green-600 font-bold text-base">{formatTaka(summary.income)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">মোট খরচ</p>
              <p className="text-red-500 font-bold text-base">{formatTaka(summary.expense)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">সাশ্রয়</p>
              <p className={`font-bold text-base ${summary.savings >= 0 ? 'text-primary' : 'text-red-500'}`}>
                {formatTaka(summary.savings)}
              </p>
            </div>
          </div>
          {summary.income > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>খরচের হার</span>
                <span>{Math.min(Math.round((summary.expense/summary.income)*100),100)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-green-400 to-red-400 rounded-full transition-all"
                  style={{width:`${Math.min((summary.expense/summary.income)*100,100)}%`}} />
              </div>
            </div>
          )}
        </div>

        {/* Pie chart */}
        {pieData.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-3 text-sm">ক্যাটাগরি ভাগ</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  paddingAngle={3} dataKey="value">
                  {pieData.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v:any) => formatTaka(Number(v))} />
                <Legend formatter={(value, entry:any) => `${entry.payload.icon} ${value}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Transaction list */}
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">লোড হচ্ছে...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-3">📭</div>
            <p className="text-gray-400 text-sm">এই সময়ে কোনো লেনদেন নেই</p>
          </div>
        ) : (
          <ReportList transactions={transactions} />
        )}
      </div>
    </div>
  )
}
