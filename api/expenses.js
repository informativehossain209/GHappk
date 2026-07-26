const { supabase, cors, safeErr, fetchAll, num, str, today, requireSession, roleAllowed } = require('./_lib/db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const action = (req.query && req.query.action) || (req.body && req.body.action) || '';

  try {
    const ses = await requireSession(req, res); if (!ses) return;

    // ══════════════════════════════════════════════════════════════════
    // EXPENSES (§12) — [REUSE] directly from expenses.js
    // ══════════════════════════════════════════════════════════════════
    if (action === 'cats-list' && req.method === 'GET') {
      const { data } = await supabase.from('exp_cats').select('*').eq('tenant_id', ses.tenantId).order('name');
      return res.json({ ok: true, cats: data || [] });
    }

    if (action === 'cat-create' && req.method === 'POST') {
      const { name } = req.body || {};
      if (!str(name)) return res.json({ ok: false, error: 'নাম দিন' });
      const { data, error } = await supabase.from('exp_cats').insert({ tenant_id: ses.tenantId, name: str(name) }).select().single();
      if (error) throw error;
      return res.json({ ok: true, cat: data });
    }

    if (action === 'record-create' && req.method === 'POST') {
      if (!roleAllowed(ses.role, ['owner', 'manager', 'accountant']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const { catId, amount, note, date } = req.body || {};
      if (!num(amount)) return res.json({ ok: false, error: 'পরিমাণ দিন' });

      // Respect Daily Closing lock (§13) — no edits once a date is approved.
      const d = str(date) || today();
      const { data: closing } = await supabase.from('daily_closing').select('status').eq('tenant_id', ses.tenantId).eq('date', d).maybeSingle();
      if (closing && closing.status === 'approved') return res.json({ ok: false, error: 'এই তারিখ ক্লোজ করা হয়েছে, সম্পাদনা সম্ভব নয়' });

      const { data, error } = await supabase.from('exp_records').insert({
        tenant_id: ses.tenantId, cat_id: catId, amount: num(amount), note: str(note), date: d, created_by: ses.staffId
      }).select().single();
      if (error) throw error;
      return res.json({ ok: true, record: data });
    }

    if (action === 'records-list' && req.method === 'GET') {
      const from = str(req.query.from) || today();
      const to = str(req.query.to) || today();
      const { data } = await supabase.from('exp_records').select('*, exp_cats(name)').eq('tenant_id', ses.tenantId).gte('date', from).lte('date', to).order('date', { ascending: false });
      return res.json({ ok: true, records: data || [] });
    }

    if (action === 'record-delete' && req.method === 'DELETE') {
      if (!roleAllowed(ses.role, ['owner', 'manager']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const id = req.query.id || (req.body && req.body.id);
      const { error } = await supabase.from('exp_records').delete().eq('id', id).eq('tenant_id', ses.tenantId);
      if (error) throw error;
      return res.json({ ok: true });
    }

    // ══════════════════════════════════════════════════════════════════
    // DAILY SHOP CLOSING (§13) — [NEW]
    // ══════════════════════════════════════════════════════════════════
    if (action === 'closing-get' && req.method === 'GET') {
      const date = str(req.query.date) || today();
      const { data } = await supabase.from('daily_closing').select('*').eq('tenant_id', ses.tenantId).eq('date', date).maybeSingle();

      // Auto-computed figures, always fresh regardless of saved state:
      const { data: sales } = await supabase.from('transactions').select('qty,unit_price,discount,payment_method').eq('tenant_id', ses.tenantId).eq('type', 'sale').eq('date', date);
      const cashSales = (sales || []).filter(s => s.payment_method === 'cash').reduce((s, t) => s + num(t.qty) * num(t.unit_price) - num(t.discount), 0);
      const digitalSales = (sales || []).filter(s => s.payment_method === 'digital').reduce((s, t) => s + num(t.qty) * num(t.unit_price) - num(t.discount), 0);
      const { data: exp } = await supabase.from('exp_records').select('amount').eq('tenant_id', ses.tenantId).eq('date', date);
      const totalExpenses = (exp || []).reduce((s, e) => s + num(e.amount), 0);

      return res.json({ ok: true, closing: data || null, computed: { cashSales, digitalSales, totalExpenses } });
    }

    if (action === 'closing-save' && req.method === 'POST') {
      if (!roleAllowed(ses.role, ['owner', 'manager', 'cashier']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const d = req.body || {};
      const date = str(d.date) || today();
      const { data: existing } = await supabase.from('daily_closing').select('status').eq('tenant_id', ses.tenantId).eq('date', date).maybeSingle();
      if (existing && existing.status === 'approved') return res.json({ ok: false, error: 'এই দিন অনুমোদিত ও লক করা আছে' });

      const { data, error } = await supabase.from('daily_closing').upsert({
        tenant_id: ses.tenantId, date,
        opening_cash: num(d.openingCash), cash_sales: num(d.cashSales), digital_sales: num(d.digitalSales),
        total_expenses: num(d.totalExpenses), cash_withdrawals: num(d.cashWithdrawals),
        counted_cash: d.countedCash != null ? num(d.countedCash) : null,
        status: d.status || 'closed', closed_by: ses.staffId, closed_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,date' }).select().single();
      if (error) throw error;
      return res.json({ ok: true, closing: data });
    }

    if (action === 'closing-approve' && req.method === 'PUT') {
      if (!roleAllowed(ses.role, ['owner', 'manager']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const { date } = req.body || {};
      const { error } = await supabase.from('daily_closing').update({
        status: 'approved', approved_by: ses.staffId, approved_at: new Date().toISOString()
      }).eq('tenant_id', ses.tenantId).eq('date', date);
      if (error) throw error;
      return res.json({ ok: true });
    }

    // Owner-only "reopen day" — explicit action to allow a correction,
    // per spec's note that locking isn't a DB-trigger, it's checked here.
    if (action === 'closing-reopen' && req.method === 'PUT') {
      if (!roleAllowed(ses.role, ['owner']))
        return res.status(403).json({ ok: false, error: 'শুধু মালিক দিন পুনরায় খুলতে পারবেন' });
      const { date } = req.body || {};
      const { error } = await supabase.from('daily_closing').update({ status: 'open' }).eq('tenant_id', ses.tenantId).eq('date', date);
      if (error) throw error;
      return res.json({ ok: true });
    }

    res.status(400).json({ ok: false, error: 'অজানা action: ' + action });
  } catch (e) {
    res.json({ ok: false, error: safeErr(e) });
  }
};
