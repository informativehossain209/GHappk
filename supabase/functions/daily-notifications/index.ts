// supabase/functions/daily-notifications/index.ts
// প্রতিদিন রাত ১২টায় (UTC 18:00) auto-run হবে
// Smart notices + Todo reminders generate করবে

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // Auth check
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  // আগামীকালের todos খুঁজুন
  const { data: todos } = await supabase
    .from('todos')
    .select('*, profiles(full_name)')
    .eq('reminder_date', tomorrowStr)
    .eq('is_done', false)

  let processed = 0

  for (const todo of todos || []) {
    const name = todo.profiles?.full_name?.split(' ')[0] || 'আপনি'
    const amountText = todo.amount ? ` (আনুমানিক ৳${todo.amount})` : ''

    await supabase.from('smart_notices').insert({
      user_id: todo.user_id,
      message: `${name}, আগামীকাল "${todo.title}"${amountText} করার কথা মনে রাখবেন।`,
      type: 'warning',
    })
    processed++
  }

  // Smart notices generate করুন
  const { data: users } = await supabase.from('profiles').select('id, full_name, month_start')

  for (const user of users || []) {
    await generateSmartNotices(user, supabase)
  }

  return new Response(
    JSON.stringify({ success: true, todos_processed: processed }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})

async function generateSmartNotices(user: any, supabase: any) {
  const userName = user.full_name?.split(' ')[0] || 'আপনি'
  const notices: { message: string; type: string }[] = []

  const now = new Date()
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const thisMonthEnd   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`

  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthStart = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`
  const lastMonthEnd   = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-${new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getDate()}`

  const { data: thisMonthTxns } = await supabase
    .from('transactions')
    .select('amount, type, categories(name), category_id')
    .eq('user_id', user.id)
    .gte('transaction_date', thisMonthStart)
    .lte('transaction_date', thisMonthEnd)

  const { data: lastMonthTxns } = await supabase
    .from('transactions')
    .select('amount, type, categories(name), category_id')
    .eq('user_id', user.id)
    .gte('transaction_date', lastMonthStart)
    .lte('transaction_date', lastMonthEnd)

  const thisIncome  = (thisMonthTxns || []).filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0)
  const thisExpense = (thisMonthTxns || []).filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0)
  const lastIncome  = (lastMonthTxns || []).filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0)
  const lastExpense = (lastMonthTxns || []).filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0)

  // Rule 1: আয়ের ৯০% খরচ হলে
  if (thisIncome > 0 && thisExpense > thisIncome * 0.9) {
    notices.push({
      message: `সতর্কতা! ${userName}, এই মাসের আয়ের ৯০% ইতিমধ্যে খরচ হয়ে গেছে।`,
      type: 'warning',
    })
  }

  // Rule 2: সাশ্রয় বেশি হলে অভিনন্দন
  const thisSavings = thisIncome - thisExpense
  const lastSavings = lastIncome - lastExpense
  if (thisSavings > lastSavings && lastSavings > 0) {
    const diff = Math.round(thisSavings - lastSavings)
    notices.push({
      message: `অভিনন্দন ${userName}! এই মাসে গত মাসের চেয়ে ৳${diff} বেশি সাশ্রয় করেছেন।`,
      type: 'success',
    })
  }

  // Rule 3: সর্বোচ্চ খরচের ক্যাটাগরি
  const catMap: Record<string, { name: string; total: number }> = {}
  for (const t of (thisMonthTxns || []).filter((t: any) => t.type === 'expense')) {
    const k = t.category_id || 'other'
    const name = t.categories?.name || 'অন্যান্য'
    if (!catMap[k]) catMap[k] = { name, total: 0 }
    catMap[k].total += Number(t.amount)
  }
  const topCat = Object.values(catMap).sort((a, b) => b.total - a.total)[0]
  if (topCat) {
    notices.push({
      message: `এই মাসে ${topCat.name} আপনার সবচেয়ে বড় খরচ — মোট ৳${Math.round(topCat.total)}।`,
      type: 'info',
    })
  }

  // Insert top 3 notices
  for (const notice of notices.slice(0, 3)) {
    await supabase.from('smart_notices').insert({ user_id: user.id, ...notice })
  }
}
