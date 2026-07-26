const { supabase, cors, safeErr, fetchAll, num, str, today, bdtYesterday, requireSession, roleAllowed } = require('./_lib/db');

// §14 — period bounds for daily/weekly/monthly/yearly. Kept simple
// (calendar-based) so every report type shares one date-range helper.
function periodBounds(type, key) {
  if (type === 'daily') return { from: key, to: key };
  if (type === 'monthly') return { from: `${key}-01`, to: `${key}-31` };
  if (type === 'yearly') return { from: `${key}-01-01`, to: `${key}-12-31` };
  if (type === 'weekly') {
    // key = 'YYYY-MM-DD' of the Saturday starting the week (Bangladesh work-week).
    const [y, m, d] = key.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, d));
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  return { from: key, to: key };
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const action = (req.query && req.query.action) || (req.body && req.body.action) || '';

  try {
    // Cron entry point runs with no user session — Vercel calls this on a
    // schedule (vercel.json), authenticated only by knowing the URL/secret,
    // never by a staff PIN. Must be checked BEFORE requireSession().
    if (action === 'cron-daily' && req.method === 'GET') {
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`)
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      const { data: tenants } = await supabase.from('tenants').select('id').eq('status', 'active');
      const date = bdtYesterday();
      for (const t of (tenants || [])) {
        const txns = await fetchAll(() => supabase.from('transactions').select('qty,unit_price,discount,purchase_price').eq('tenant_id', t.id).eq('type', 'sale').eq('date', date));
        const totalSales = txns.reduce((s, x) => s + num(x.qty) * num(x.unit_price) - num(x.discount), 0);
        const profit = txns.reduce((s, x) => s + (num(x.unit_price) - num(x.purchase_price)) * num(x.qty) - num(x.discount), 0);
        await supabase.from('report_snapshots').upsert({
          tenant_id: t.id, period_type: 'daily', period_key: date,
          data: { type: 'sales', totalSales, profit, count: txns.length }
        }, { onConflict: 'tenant_id,period_type,period_key' });
      }
      return res.json({ ok: true, generated: (tenants || []).length, date });
    }

    const ses = await requireSession(req, res); if (!ses) return;
    if (!roleAllowed(ses.role, ['owner', 'manager', 'accountant']))
      return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });

    // action=generate — the single endpoint every report type/period runs
    // through (§14: "more report types over the same underlying tables,
    // not a new mechanism"). type: sales|purchase|expense|profit|employee|
    // inventory|dead_stock|low_stock|customer_due|supplier_due
    if (action === 'generate' && req.method === 'GET') {
      const periodType = str(req.query.periodType) || 'daily'; // daily|weekly|monthly|yearly
      const periodKey = str(req.query.periodKey) || today();
      const reportType = str(req.query.type) || 'sales';
      const { from, to } = periodBounds(periodType, periodKey);

      let data;
      if (reportType === 'sales') {
        const txns = await fetchAll(() => supabase.from('transactions').select('qty,unit_price,discount,date,payment_method').eq('tenant_id', ses.tenantId).eq('type', 'sale').gte('date', from).lte('date', to));
        data = {
          totalSales: txns.reduce((s, t) => s + num(t.qty) * num(t.unit_price) - num(t.discount), 0),
          count: txns.length,
          byPaymentMethod: groupSum(txns, t => t.payment_method, t => num(t.qty) * num(t.unit_price) - num(t.discount))
        };
      } else if (reportType === 'profit') {
        const txns = await fetchAll(() => supabase.from('transactions').select('qty,unit_price,purchase_price,discount').eq('tenant_id', ses.tenantId).eq('type', 'sale').gte('date', from).lte('date', to));
        const revenue = txns.reduce((s, t) => s + num(t.qty) * num(t.unit_price) - num(t.discount), 0);
        const cogs = txns.reduce((s, t) => s + num(t.qty) * num(t.purchase_price), 0);
        data = { revenue, cogs, grossProfit: revenue - cogs };
      } else if (reportType === 'purchase') {
        const rows = await fetchAll(() => supabase.from('purchases').select('total,paid_amount,due_amount').eq('tenant_id', ses.tenantId).gte('date', from).lte('date', to));
        data = { total: rows.reduce((s, r) => s + num(r.total), 0), paid: rows.reduce((s, r) => s + num(r.paid_amount), 0), due: rows.reduce((s, r) => s + num(r.due_amount), 0), count: rows.length };
      } else if (reportType === 'expense') {
        const rows = await fetchAll(() => supabase.from('exp_records').select('amount,cat_id,exp_cats(name)').eq('tenant_id', ses.tenantId).gte('date', from).lte('date', to));
        data = { total: rows.reduce((s, r) => s + num(r.amount), 0), byCategory: groupSum(rows, r => (r.exp_cats && r.exp_cats.name) || 'অন্যান্য', r => num(r.amount)) };
      } else if (reportType === 'employee') {
        const rows = await fetchAll(() => supabase.from('attendance').select('staff_id,status,punch_in,punch_out,staff(name)').eq('tenant_id', ses.tenantId).gte('date', from).lte('date', to));
        data = { byStaff: groupCount(rows, r => (r.staff && r.staff.name) || r.staff_id) };
      } else if (reportType === 'inventory') {
        const products = await fetchAll(() => supabase.from('products').select('current_stock,purchase_price').eq('tenant_id', ses.tenantId));
        data = { stockValue: products.reduce((s, p) => s + num(p.current_stock) * num(p.purchase_price), 0), productCount: products.length };
      } else if (reportType === 'dead_stock' || reportType === 'low_stock') {
        // Delegates to products.js logic conceptually; kept simple here.
        const products = await fetchAll(() => supabase.from('products').select('id,name,current_stock,low_stock_alert,last_sale_date').eq('tenant_id', ses.tenantId));
        if (reportType === 'low_stock') data = { products: products.filter(p => p.low_stock_alert != null && num(p.current_stock) <= num(p.low_stock_alert)) };
        else data = { products: products.filter(p => p.last_sale_date && (Date.now() - new Date(p.last_sale_date).getTime()) / 86400000 >= 60) };
      } else if (reportType === 'customer_due' || reportType === 'supplier_due') {
        const partyType = reportType === 'customer_due' ? 'customer' : 'supplier';
        const rows = await fetchAll(() => supabase.from('due_calendar').select('total_amount,paid_amount,party_id').eq('tenant_id', ses.tenantId).eq('party_type', partyType).neq('status', 'cleared'));
        data = { totalDue: rows.reduce((s, r) => s + (num(r.total_amount) - num(r.paid_amount)), 0), count: rows.length };
      } else {
        return res.json({ ok: false, error: 'অজানা রিপোর্ট টাইপ' });
      }

      // Cache the snapshot (§14 cron-driven pattern) so repeat views of a
      // closed period don't recompute against fetchAll() every time.
      await supabase.from('report_snapshots').upsert({
        tenant_id: ses.tenantId, period_type: periodType, period_key: periodKey,
        data: { type: reportType, ...data }, generated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,period_type,period_key' });

      return res.json({ ok: true, periodType, periodKey, from, to, reportType, data });
    }

    res.status(400).json({ ok: false, error: 'অজানা action: ' + action });
  } catch (e) {
    res.json({ ok: false, error: safeErr(e) });
  }
};

function groupSum(rows, keyFn, valFn) {
  const out = {};
  for (const r of rows) { const k = keyFn(r) || 'other'; out[k] = (out[k] || 0) + valFn(r); }
  return out;
}
function groupCount(rows, keyFn) {
  const out = {};
  for (const r of rows) { const k = keyFn(r) || 'other'; out[k] = (out[k] || 0) + 1; }
  return out;
}
