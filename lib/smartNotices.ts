/**
 * Client-side Smart Notice Rule Engine
 * Real AI নয় — rule-based logic। দেখতে AI মনে হবে।
 * Dashboard load-এর পরে এই function call হবে এবং
 * নতুন notice থাকলে smart_notices table-এ insert করবে।
 */

import type { SupabaseClient } from '@supabase/supabase-js'

interface CategoryTotal {
  id: string
  name: string
  icon: string
  total: number
}

interface MonthData {
  income: number
  expense: number
  savings: number
  categories: CategoryTotal[]
}

/** নির্দিষ্ট মাসের income/expense/category data আনে */
async function fetchMonthData(
  userId: string,
  supabase: SupabaseClient,
  monthOffset: number = 0
): Promise<MonthData> {
  const now = new Date()
  const targetDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1)
  const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
    .toISOString()
    .split('T')[0]
  const end = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0]

  const { data: txns } = await supabase
    .from('transactions')
    .select('type, amount, category_id, categories(name, icon)')
    .eq('user_id', userId)
    .gte('transaction_date', start)
    .lte('transaction_date', end)

  const income = (txns || [])
    .filter((t: any) => t.type === 'income')
    .reduce((s: number, t: any) => s + Number(t.amount), 0)

  const expense = (txns || [])
    .filter((t: any) => t.type === 'expense')
    .reduce((s: number, t: any) => s + Number(t.amount), 0)

  const catMap: Record<string, CategoryTotal> = {}
  for (const t of (txns || []).filter((t: any) => t.type === 'expense')) {
    const key = (t as any).category_id || 'other'
    const name = (t as any).categories?.name || 'অন্যান্য'
    const icon = (t as any).categories?.icon || '📦'
    if (!catMap[key]) catMap[key] = { id: key, name, icon, total: 0 }
    catMap[key].total += Number((t as any).amount)
  }

  return {
    income,
    expense,
    savings: income - expense,
    categories: Object.values(catMap),
  }
}

/** আজকে কি আগে notice তৈরি হয়েছে? */
async function hasNoticesToday(userId: string, supabase: SupabaseClient): Promise<boolean> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('smart_notices')
    .select('id')
    .eq('user_id', userId)
    .gte('created_at', todayStart.toISOString())
    .limit(1)

  return !!(data && data.length > 0)
}

/**
 * Main function — dashboard page থেকে call করুন
 * প্রতিদিন একবারই generate করবে (duplicate চেক আছে)
 */
export async function generateClientNotices(
  userId: string,
  userName: string,
  supabase: SupabaseClient
): Promise<void> {
  try {
    // আজকে notice আগে তৈরি হলে skip করুন
    if (await hasNoticesToday(userId, supabase)) return

    const firstName = userName.trim().split(' ')[0] || 'আপনি'
    const thisMonth = await fetchMonthData(userId, supabase, 0)
    const lastMonth = await fetchMonthData(userId, supabase, 1)

    const notices: { message: string; type: 'info' | 'warning' | 'success' }[] = []

    // ─── Rule 1: কোনো ক্যাটাগরিতে খরচ ২০%+ বেশি ───
    const sortedCats = [...thisMonth.categories].sort((a, b) => b.total - a.total)
    for (const cat of sortedCats) {
      const lastCat = lastMonth.categories.find((c) => c.name === cat.name)
      if (lastCat && lastCat.total > 500 && cat.total > lastCat.total * 1.2) {
        const pct = Math.round(((cat.total - lastCat.total) / lastCat.total) * 100)
        notices.push({
          message: `${firstName}, এই মাসে ${cat.icon} ${cat.name} খরচ গত মাসের চেয়ে ${pct}% বেশি।`,
          type: 'warning',
        })
        break // একটাই দিন
      }
    }

    // ─── Rule 2: সাশ্রয় বাড়লে অভিনন্দন ───
    if (
      thisMonth.savings > 0 &&
      lastMonth.savings > 0 &&
      thisMonth.savings > lastMonth.savings * 1.05
    ) {
      const diff = Math.round(thisMonth.savings - lastMonth.savings)
      notices.push({
        message: `অভিনন্দন ${firstName}! এই মাসে গত মাসের চেয়ে ৳${diff.toLocaleString('bn-BD')} বেশি সাশ্রয় হচ্ছে।`,
        type: 'success',
      })
    }

    // ─── Rule 3: আয়ের ৯০%+ খরচ হলে সতর্কতা ───
    if (thisMonth.income > 0 && thisMonth.expense > thisMonth.income * 0.9) {
      const spentPct = Math.round((thisMonth.expense / thisMonth.income) * 100)
      notices.push({
        message: `সতর্কতা! ${firstName}, এই মাসের আয়ের ${spentPct}% ইতিমধ্যে খরচ হয়ে গেছে।`,
        type: 'warning',
      })
    }

    // ─── Rule 4: সবচেয়ে বেশি খরচের ক্যাটাগরি ───
    if (sortedCats.length > 0 && sortedCats[0].total > 0) {
      const top = sortedCats[0]
      notices.push({
        message: `এই মাসে ${top.icon} ${top.name} আপনার সবচেয়ে বড় খরচ — মোট ৳${Math.round(top.total).toLocaleString('bn-BD')}।`,
        type: 'info',
      })
    }

    // ─── Rule 5: ৩+ দিন এন্ট্রি নেই ───
    const { data: lastTxn } = await supabase
      .from('transactions')
      .select('transaction_date')
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false })
      .limit(1)

    if (lastTxn && lastTxn.length > 0) {
      const lastDate = new Date(lastTxn[0].transaction_date + 'T00:00:00')
      const daysSince = Math.floor((Date.now() - lastDate.getTime()) / 86400000)
      if (daysSince >= 3) {
        notices.push({
          message: `${firstName}, ${daysSince} দিন ধরে কোনো এন্ট্রি নেই। হিসাব আপডেট রাখুন।`,
          type: 'info',
        })
      }
    }

    // ─── Rule 6: মাস শেষের সারসংক্ষেপ ───
    const today = new Date()
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    if (today.getDate() === lastDayOfMonth && thisMonth.income > 0) {
      const monthName = today.toLocaleString('bn-BD', { month: 'long' })
      notices.push({
        message: `${monthName} মাসের সারসংক্ষেপ: আয় ৳${Math.round(thisMonth.income).toLocaleString('bn-BD')}, খরচ ৳${Math.round(thisMonth.expense).toLocaleString('bn-BD')}, সাশ্রয় ৳${Math.round(thisMonth.savings).toLocaleString('bn-BD')}।`,
        type: 'info',
      })
    }

    // সর্বোচ্চ ৩টা insert করুন (priority: warning > success > info)
    const prioritized = [
      ...notices.filter((n) => n.type === 'warning'),
      ...notices.filter((n) => n.type === 'success'),
      ...notices.filter((n) => n.type === 'info'),
    ].slice(0, 3)

    for (const n of prioritized) {
      await supabase.from('smart_notices').insert({
        user_id: userId,
        message: n.message,
        type: n.type,
      })
    }
  } catch (err) {
    // Silent fail — notice generation should never break the app
    console.error('[smartNotices] error:', err)
  }
}
