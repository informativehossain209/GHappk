const { supabase, cors, safeErr, fetchAll, num, str, today, requireSession, roleAllowed } = require('./_lib/db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const action = (req.query && req.query.action) || (req.body && req.body.action) || '';

  try {
    const ses = await requireSession(req, res); if (!ses) return;

    // ══════════════════════════════════════════════════════════════════
    // SUPPLIERS (§9)
    // ══════════════════════════════════════════════════════════════════
    if (action === 'suppliers-list' && req.method === 'GET') {
      const { data } = await supabase.from('suppliers').select('*').eq('tenant_id', ses.tenantId).order('name');
      // Outstanding due per supplier, derived from due_calendar (not stored redundantly).
      const dues = await fetchAll(() => supabase.from('due_calendar').select('party_id,total_amount,paid_amount').eq('tenant_id', ses.tenantId).eq('party_type', 'supplier'));
      const dueMap = {};
      for (const r of dues) dueMap[r.party_id] = (dueMap[r.party_id] || 0) + (num(r.total_amount) - num(r.paid_amount));
      return res.json({ ok: true, suppliers: (data || []).map(s => ({ ...s, due: dueMap[s.id] || 0 })) });
    }

    if (action === 'supplier-create' && req.method === 'POST') {
      if (!roleAllowed(ses.role, ['owner', 'manager', 'inventory_manager']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const { name, phone, address } = req.body || {};
      if (!str(name)) return res.json({ ok: false, error: 'নাম দিন' });
      const { data, error } = await supabase.from('suppliers').insert({ tenant_id: ses.tenantId, name: str(name), phone: str(phone), address: str(address) }).select().single();
      if (error) throw error;
      return res.json({ ok: true, supplier: data });
    }

    if (action === 'supplier-update' && req.method === 'PUT') {
      if (!roleAllowed(ses.role, ['owner', 'manager', 'inventory_manager']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const { id, name, phone, address } = req.body || {};
      const { error } = await supabase.from('suppliers').update({ name: str(name), phone: str(phone), address: str(address) }).eq('id', id).eq('tenant_id', ses.tenantId);
      if (error) throw error;
      return res.json({ ok: true });
    }

    // Supplier's products-supplied + payment history (§9: derived, not stored)
    if (action === 'supplier-detail' && req.method === 'GET') {
      const supplierId = req.query.id;
      const { data: products } = await supabase.from('products').select('id,name,current_stock,purchase_price').eq('tenant_id', ses.tenantId).eq('supplier_id', supplierId);
      const { data: purchases } = await supabase.from('purchases').select('*').eq('tenant_id', ses.tenantId).eq('supplier_id', supplierId).order('date', { ascending: false });
      const { data: dues } = await supabase.from('due_calendar').select('*').eq('tenant_id', ses.tenantId).eq('party_type', 'supplier').eq('party_id', supplierId);
      return res.json({ ok: true, products: products || [], purchases: purchases || [], dues: dues || [] });
    }

    // ══════════════════════════════════════════════════════════════════
    // PURCHASES (§9) — stock-in, weighted-average purchase cost
    // ══════════════════════════════════════════════════════════════════
    if (action === 'purchase-create' && req.method === 'POST') {
      if (!roleAllowed(ses.role, ['owner', 'manager', 'inventory_manager']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const d = req.body || {};
      const items = Array.isArray(d.items) ? d.items : []; // [{productId, qty, unitCost}]
      if (!items.length) return res.json({ ok: false, error: 'কমপক্ষে একটি পণ্য দিন' });

      const total = items.reduce((s, i) => s + num(i.qty) * num(i.unitCost), 0);
      const paid = num(d.paidAmount);
      const due = Math.max(0, total - paid);

      const { data: purchase, error: pErr } = await supabase.from('purchases').insert({
        tenant_id: ses.tenantId, supplier_id: d.supplierId || null, items,
        total, paid_amount: paid, due_amount: due, date: str(d.date) || today(), created_by: ses.staffId
      }).select().single();
      if (pErr) throw pErr;

      // Stock-in via the ledger (fires trg_apply_stock_delta, §11) +
      // recompute weighted-average purchase cost per line item.
      for (const i of items) {
        const { data: prod } = await supabase.from('products').select('current_stock,purchase_price').eq('id', i.productId).eq('tenant_id', ses.tenantId).maybeSingle();
        if (!prod) continue;
        const oldQty = num(prod.current_stock), oldCost = num(prod.purchase_price);
        const newQty = num(i.qty), newCost = num(i.unitCost);
        const avgCost = (oldQty + newQty) > 0 ? ((oldQty * oldCost) + (newQty * newCost)) / (oldQty + newQty) : newCost;

        await supabase.from('transactions').insert({
          tenant_id: ses.tenantId, type: 'purchase', product_id: i.productId, qty: newQty,
          unit_price: newCost, purchase_price: newCost, date: str(d.date) || today(), cashier_id: ses.staffId
        });
        await supabase.from('products').update({ purchase_price: avgCost }).eq('id', i.productId).eq('tenant_id', ses.tenantId);
      }

      if (due > 0 && d.supplierId) {
        await supabase.from('due_calendar').insert({
          tenant_id: ses.tenantId, party_type: 'supplier', party_id: d.supplierId,
          ref_type: 'purchase', ref_id: purchase.id, total_amount: total, paid_amount: paid,
          status: paid > 0 ? 'partial' : 'pending'
        });
      }

      return res.json({ ok: true, purchase });
    }

    if (action === 'purchases-list' && req.method === 'GET') {
      const { data } = await supabase.from('purchases').select('*, suppliers(name)').eq('tenant_id', ses.tenantId).order('date', { ascending: false }).limit(200);
      return res.json({ ok: true, purchases: data || [] });
    }

    // Purchase return — [ADAPT] dmg_claims pending/cleared pattern
    if (action === 'purchase-return-create' && req.method === 'POST') {
      if (!roleAllowed(ses.role, ['owner', 'manager', 'inventory_manager']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const { purchaseId, productId, qty, reason } = req.body || {};
      const { data, error } = await supabase.from('purchase_returns').insert({
        tenant_id: ses.tenantId, purchase_id: purchaseId || null, product_id: productId, qty: num(qty), reason: str(reason)
      }).select().single();
      if (error) throw error;
      return res.json({ ok: true, return: data });
    }

    if (action === 'purchase-return-clear' && req.method === 'PUT') {
      if (!roleAllowed(ses.role, ['owner', 'manager']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const { id } = req.body || {};
      const { data: ret } = await supabase.from('purchase_returns').select('*').eq('id', id).eq('tenant_id', ses.tenantId).maybeSingle();
      if (!ret || ret.status === 'cleared') return res.json({ ok: false, error: 'পাওয়া যায়নি' });
      await supabase.from('transactions').insert({
        tenant_id: ses.tenantId, type: 'purchase_return', product_id: ret.product_id, qty: ret.qty, date: today(), cashier_id: ses.staffId
      });
      await supabase.from('purchase_returns').update({ status: 'cleared' }).eq('id', id);
      return res.json({ ok: true });
    }

    // ── SUPPLIER DUE PAYMENT ─────────────────────────────────────────────
    if (action === 'pay-supplier-due' && req.method === 'POST') {
      if (!roleAllowed(ses.role, ['owner', 'manager', 'accountant']))
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

    res.status(400).json({ ok: false, error: 'অজানা action: ' + action });
  } catch (e) {
    res.json({ ok: false, error: safeErr(e) });
  }
};
