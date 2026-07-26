const { supabase, cors, safeErr, fetchAll, num, str, requireSession, roleAllowed } = require('./_lib/db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const action = (req.query && req.query.action) || (req.body && req.body.action) || '';

  try {
    const ses = await requireSession(req, res); if (!ses) return;

    if (action === 'list' && req.method === 'GET') {
      const q = str(req.query.q || '');
      let query = supabase.from('customers').select('*').eq('tenant_id', ses.tenantId).order('name');
      if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
      const { data } = await query.limit(200);

      const dues = await fetchAll(() => supabase.from('due_calendar').select('party_id,total_amount,paid_amount').eq('tenant_id', ses.tenantId).eq('party_type', 'customer'));
      const dueMap = {};
      for (const r of dues) dueMap[r.party_id] = (dueMap[r.party_id] || 0) + (num(r.total_amount) - num(r.paid_amount));
      return res.json({ ok: true, customers: (data || []).map(c => ({ ...c, due: dueMap[c.id] || 0 })) });
    }

    if (action === 'create' && req.method === 'POST') {
      const { name, phone, address } = req.body || {};
      if (!str(name)) return res.json({ ok: false, error: 'নাম দিন' });
      const { data, error } = await supabase.from('customers').insert({ tenant_id: ses.tenantId, name: str(name), phone: str(phone), address: str(address) }).select().single();
      if (error) throw error;
      return res.json({ ok: true, customer: data });
    }

    if (action === 'update' && req.method === 'PUT') {
      const { id, name, phone, address } = req.body || {};
      const { error } = await supabase.from('customers').update({ name: str(name), phone: str(phone), address: str(address) }).eq('id', id).eq('tenant_id', ses.tenantId);
      if (error) throw error;
      return res.json({ ok: true });
    }

    // Purchase history (§10, derived from transactions), total purchases, due.
    if (action === 'detail' && req.method === 'GET') {
      const customerId = req.query.id;
      const history = await fetchAll(() => supabase.from('transactions').select('*, products(name)').eq('tenant_id', ses.tenantId).eq('customer_id', customerId).eq('type', 'sale'));
      const totalPurchases = history.reduce((s, t) => s + num(t.qty) * num(t.unit_price) - num(t.discount), 0);
      const { data: dues } = await supabase.from('due_calendar').select('*').eq('tenant_id', ses.tenantId).eq('party_type', 'customer').eq('party_id', customerId);
      return res.json({ ok: true, history, totalPurchases, dues: dues || [] });
    }

    if (action === 'pay-due' && req.method === 'POST') {
      if (!roleAllowed(ses.role, ['owner', 'manager', 'cashier', 'accountant']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const { dueId, amount } = req.body || {};
      const { data: due } = await supabase.from('due_calendar').select('*').eq('id', dueId).eq('tenant_id', ses.tenantId).maybeSingle();
      if (!due) return res.json({ ok: false, error: 'পাওয়া যায়নি' });
      const newPaid = num(due.paid_amount) + num(amount);
      const status = newPaid >= num(due.total_amount) ? 'cleared' : 'partial';
      const { error } = await supabase.from('due_calendar').update({ paid_amount: newPaid, status, updated_at: new Date().toISOString() }).eq('id', dueId);
      if (error) throw error;
      return res.json({ ok: true, status });
    }

    // §14 — Customer Due report source
    if (action === 'all-dues' && req.method === 'GET') {
      const dues = await fetchAll(() => supabase.from('due_calendar').select('*, customers(name,phone)').eq('tenant_id', ses.tenantId).eq('party_type', 'customer').neq('status', 'cleared'));
      return res.json({ ok: true, dues });
    }

    res.status(400).json({ ok: false, error: 'অজানা action: ' + action });
  } catch (e) {
    res.json({ ok: false, error: safeErr(e) });
  }
};
