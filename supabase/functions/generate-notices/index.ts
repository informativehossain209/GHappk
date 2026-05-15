/**
 * Supabase Edge Function: generate-notices
 * প্রতিদিন রাত ১২টায় (UTC 18:00) run হবে pg_cron এর মাধ্যমে।
 * সব active user-এর জন্য smart notice generate করবে।
 *
 * Deploy: supabase functions deploy generate-notices
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

interface CategoryTotal {
  id: string
  name: string
  icon: string
  total: number
}

async function fetchMonthData(userId: string, monthOffset: number) {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1)
  const start = new Date(target.getFullYear(), target.getMonth(), 1).toISOString().split('T')[0]
  const end   = new Date(target.getFullYear(), target.getMonth() + 1, 0).toISOString().split('T')[0]

  const { data: txns } = await supabase
    .from('transactions')
    .select('type, amount, category_id, categories(name, icon)')
    .eq('user_id', userId)
    .gte('transaction_date', start)
    .lte('transaction_date', end)

  const income  = (txns||[]).filter((t:any)=>t.type==='income').reduce((s:number,t:any)=>s+Number(t.amount),0)
  const expense = (txns||[]).filter((t:any)=>t.type==='expense').reduce((s:number,t:any)=>s+Number(t.amount),0)
  const catMap: Record<string,CategoryTotal> = {}
  for (const t of (txns||[]).filter((t:any)=>t.type==='expense')) {
    const key = (t as any).category_id||'other'
    if (!catMap[key]) catMap[key]={id:key,name:(t as any).categories?.name||'অন্যান্য',icon:(t as any).categories?.icon||'📦',total:0}
    catMap[key].total += Number((t as any).amount)
  }

  return { income, expense, savings: income-expense, categories: Object.values(catMap) }
}

async function generateForUser(userId: string, firstName: string) {
  // আজকে notice তৈরি হলে skip
  const todayStart = new Date(); todayStart.setHours(0,0,0,0)
  const { data: existing } = await supabase
    .from('smart_notices').select('id').eq('user_id',userId)
    .gte('created_at', todayStart.toISOString()).limit(1)
  if (existing && existing.length > 0) return

  const thisMonth = await fetchMonthData(userId, 0)
  const lastMonth = await fetchMonthData(userId, 1)
  const notices: {message:string;type:string}[] = []

  // Rule 1: ক্যাটাগরি খরচ ২০%+ বৃদ্ধি
  const sorted = [...thisMonth.categories].sort((a,b)=>b.total-a.total)
  for (const cat of sorted) {
    const lc = lastMonth.categories.find(c=>c.name===cat.name)
    if (lc && lc.total > 500 && cat.total > lc.total*1.2) {
      const pct = Math.round(((cat.total-lc.total)/lc.total)*100)
      notices.push({ message:`${firstName}, এই মাসে ${cat.icon} ${cat.name} খরচ গত মাসের চেয়ে ${pct}% বেশি।`, type:'warning' })
      break
    }
  }

  // Rule 2: সাশ্রয় বৃদ্ধি
  if (thisMonth.savings>0 && lastMonth.savings>0 && thisMonth.savings>lastMonth.savings*1.05) {
    const diff = Math.round(thisMonth.savings - lastMonth.savings)
    notices.push({ message:`অভিনন্দন ${firstName}! এই মাসে গত মাসের চেয়ে ৳${diff.toLocaleString()} বেশি সাশ্রয় হচ্ছে।`, type:'success' })
  }

  // Rule 3: আয়ের ৯০%+ খরচ
  if (thisMonth.income>0 && thisMonth.expense>thisMonth.income*0.9) {
    const pct = Math.round((thisMonth.expense/thisMonth.income)*100)
    notices.push({ message:`সতর্কতা ${firstName}! এই মাসের আয়ের ${pct}% ইতিমধ্যে খরচ হয়ে গেছে।`, type:'warning' })
  }

  // Rule 4: Top category
  if (sorted.length>0 && sorted[0].total>0) {
    const top = sorted[0]
    notices.push({ message:`এই মাসে ${top.icon} ${top.name} সবচেয়ে বড় খরচ — মোট ৳${Math.round(top.total).toLocaleString()}।`, type:'info' })
  }

  // Rule 5: ৩ দিন এন্ট্রি নেই
  const { data: lastTxn } = await supabase
    .from('transactions').select('transaction_date').eq('user_id',userId)
    .order('transaction_date',{ascending:false}).limit(1)
  if (lastTxn && lastTxn.length>0) {
    const daysSince = Math.floor((Date.now()-new Date(lastTxn[0].transaction_date+'T00:00:00').getTime())/86400000)
    if (daysSince>=3) notices.push({ message:`${firstName}, ${daysSince} দিন ধরে কোনো এন্ট্রি নেই। হিসাব আপডেট রাখুন।`, type:'info' })
  }

  // Insert top 3 (warning first)
  const prioritized = [
    ...notices.filter(n=>n.type==='warning'),
    ...notices.filter(n=>n.type==='success'),
    ...notices.filter(n=>n.type==='info'),
  ].slice(0,3)

  for (const n of prioritized) {
    await supabase.from('smart_notices').insert({ user_id:userId, message:n.message, type:n.type })
  }

  // Also check todos for tomorrow and create notices
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]
  const { data: todos } = await supabase
    .from('todos').select('title').eq('user_id',userId).eq('reminder_date',tomorrowStr).eq('is_done',false)
  for (const todo of (todos||[])) {
    await supabase.from('smart_notices').insert({
      user_id: userId,
      message: `${firstName}, আগামীকাল "${todo.title}" করার কথা মনে রাখবেন।`,
      type: 'warning'
    })
  }
}

Deno.serve(async () => {
  try {
    // সব active user খুঁজুন (শেষ ৩০ দিনে transaction করেছে)
    const since = new Date(Date.now()-30*86400000).toISOString().split('T')[0]
    const { data: activeUsers } = await supabase
      .from('transactions').select('user_id').gte('transaction_date',since)

    const uniqueUserIds = [...new Set((activeUsers||[]).map((u:any)=>u.user_id))]

    for (const userId of uniqueUserIds) {
      const { data: prof } = await supabase
        .from('profiles').select('full_name').eq('id',userId).maybeSingle()
      const firstName = (prof?.full_name||'ব্যবহারকারী').split(' ')[0]
      await generateForUser(userId, firstName)
    }

    return new Response(JSON.stringify({ ok:true, processed:uniqueUserIds.length }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('generate-notices error:', err)
    return new Response(JSON.stringify({ ok:false, error:String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
