import { supabase } from './supabase'
import { getCurrentMonthRange } from './utils'

export async function generateNotices(userId: string) {
  const { start, end } = getCurrentMonthRange()

  // Get this month's transactions
  const { data: thisMonth } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', end)

  // Get last month's transactions
  const now = new Date()
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
  const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]

  const { data: lastMonth } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('date', lastStart)
    .lte('date', lastEnd)

  // Get budgets
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const { data: budgets } = await supabase
    .from('budgets')
    .select('*, category:categories(name)')
    .eq('user_id', userId)
    .eq('month', monthKey)

  const notices: { user_id: string; message: string; type: string }[] = []

  if (!thisMonth) return

  const thisExpense = thisMonth.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const lastExpense = (lastMonth || []).filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const thisIncome = thisMonth.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const lastIncome = (lastMonth || []).filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)

  // Notice: Expense increased by >20%
  if (lastExpense > 0 && thisExpense > lastExpense * 1.2) {
    const pct = Math.round(((thisExpense - lastExpense) / lastExpense) * 100)
    notices.push({
      user_id: userId,
      message: `এই মাসে খরচ গত মাসের তুলনায় ${pct}% বেড়েছে।`,
      type: 'warning',
    })
  }

  // Notice: Savings improved
  const thisSavings = thisIncome - thisExpense
  const lastSavings = lastIncome - lastExpense
  if (thisSavings > 0 && thisSavings > lastSavings) {
    notices.push({
      user_id: userId,
      message: 'গত মাসের চেয়ে এই মাসে বেশি সঞ্চয় হয়েছে। চমৎকার! 🎉',
      type: 'success',
    })
  }

  // Notice: No entry for 3+ days
  const lastDate = thisMonth.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date
  if (lastDate) {
    const daysSince = Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
    if (daysSince >= 3) {
      notices.push({
        user_id: userId,
        message: `${daysSince} দিন ধরে কোনো লেনদেন যোগ করা হয়নি।`,
        type: 'info',
      })
    }
  }

  // Notice: Budget alerts
  if (budgets) {
    for (const budget of budgets) {
      const spent = thisMonth
        .filter((t) => t.type === 'expense' && t.category_id === budget.category_id)
        .reduce((s, t) => s + t.amount, 0)
      const pct = (spent / budget.monthly_limit) * 100
      if (pct >= 100) {
        notices.push({
          user_id: userId,
          message: `${budget.category?.name || 'একটি ক্যাটাগরির'} বাজেট সম্পূর্ণ শেষ হয়ে গেছে!`,
          type: 'alert',
        })
      } else if (pct >= 80) {
        notices.push({
          user_id: userId,
          message: `${budget.category?.name || 'একটি ক্যাটাগরির'} বাজেটের ${Math.round(pct)}% ব্যবহার হয়ে গেছে।`,
          type: 'warning',
        })
      }
    }
  }

  // Insert notices (deduplicate by clearing old ones first)
  if (notices.length > 0) {
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('notices').delete().eq('user_id', userId).gte('created_at', today + 'T00:00:00')
    await supabase.from('notices').insert(notices)
  }
}
