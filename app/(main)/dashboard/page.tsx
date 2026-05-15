'use client'

import { useEffect, useState, useCallback } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'
import BalanceHeader from '@/components/BalanceHeader'
import SummaryCards from '@/components/SummaryCards'
import SmartNoticeCard from '@/components/SmartNoticeCard'
import ExpenseBarChart from '@/components/ExpenseBarChart'
import RecentTransactions from '@/components/RecentTransactions'
import TodoReminders from '@/components/TodoReminders'
import { sendNativeNotification } from '@/lib/notify'
import { getMonthRange } from '@/lib/utils'
import { generateClientNotices } from '@/lib/smartNotices'
import { useAppStore } from '@/store/useAppStore'

export default function DashboardPage() {
  const supabase = createBrowserClient()
  const { setProfile } = useAppStore()
  const [localProfile, setLocalProfile] = useState<any>(null)
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 })
  const [transactions, setTransactions] = useState<any[]>([])
  const [notices, setNotices] = useState<any[]>([])
  const [todos, setTodos] = useState<any[]>([])
  const [chartData, setChartData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const loadDashboard = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Profile
    const { data: prof } = await supabase
      .from('profiles').select('*').eq('id', user.id).maybeSingle()
    const activeProfile = prof || { id: user.id, full_name: 'ব্যবহারকারী', month_start: 1 }
    if (!prof) {
      await supabase.from('profiles').upsert({ id: user.id, full_name: 'ব্যবহারকারী', month_start: 1, notif_on: true })
    }
    setLocalProfile(activeProfile)
    setProfile(activeProfile)

    const { start, end } = getMonthRange(activeProfile.month_start || 1)

    // Transactions
    const { data: txns } = await supabase
      .from('transactions').select('*, categories(name, icon)')
      .eq('user_id', user.id)
      .gte('transaction_date', start).lte('transaction_date', end)
      .order('transaction_date', { ascending: false })

    const income  = (txns||[]).filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0)
    const expense = (txns||[]).filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0)
    setSummary({ income, expense, balance: income - expense })
    setTransactions((txns||[]).slice(0,5))

    // Chart
    const catMap: Record<string,{name:string;icon:string;total:number}> = {}
    for (const t of (txns||[]).filter(t=>t.type==='expense')) {
      const key = t.category_id||'other'
      if (!catMap[key]) catMap[key]={name:t.categories?.name||'অন্যান্য',icon:t.categories?.icon||'📦',total:0}
      catMap[key].total += Number(t.amount)
    }
    setChartData(Object.values(catMap).sort((a,b)=>b.total-a.total).slice(0,6))

    // Smart notices — generate client-side, then load
    await generateClientNotices(user.id, activeProfile.full_name||'ব্যবহারকারী', supabase)
    const { data: noticeData } = await supabase
      .from('smart_notices').select('*').eq('user_id',user.id).eq('is_read',false)
      .order('created_at',{ascending:false}).limit(5)
    setNotices(noticeData||[])

    // Native notification
    if (activeProfile.notif_on !== false) {
      for (const n of (noticeData||[]).slice(0,2)) {
        sendNativeNotification('ঘর খরচ', n.message)
      }
    }

    // Todos (today + next 3 days)
    const today = new Date().toISOString().split('T')[0]
    const in3days = new Date(Date.now()+3*86400000).toISOString().split('T')[0]
    const { data: todoData } = await supabase
      .from('todos').select('*').eq('user_id',user.id).eq('is_done',false)
      .gte('reminder_date',today).lte('reminder_date',in3days).order('reminder_date')
    setTodos(todoData||[])

    setLoading(false)
  }, [])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  const dismissNotice = async (id: string) => {
    await supabase.from('smart_notices').update({ is_read: true }).eq('id', id)
    setNotices(prev => prev.filter(n => n.id !== id))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-5xl mb-3 animate-bounce">🏠</div>
          <p className="text-blue-200 text-sm">লোড হচ্ছে...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-24">
      <BalanceHeader profile={localProfile} balance={summary.balance} />
      <div className="px-4 -mt-4 space-y-4">
        <SummaryCards income={summary.income} expense={summary.expense} />
        {notices.length > 0 && <SmartNoticeCard notices={notices} onDismiss={dismissNotice} />}
        {/* TodoReminders is always shown — has its own add button */}
        <TodoReminders todos={todos} onRefresh={loadDashboard} />
        {chartData.length > 0 && <ExpenseBarChart data={chartData} />}
        <RecentTransactions transactions={transactions} />
      </div>
    </div>
  )
}
