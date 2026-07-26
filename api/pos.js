const { supabase, cors, safeErr, num, str, today, requireSession, roleAllowed } = require('./_lib/db');

// Invoice numbers: DOK-<tenant short>-<yyyymmdd>-<seq>. Sequence resets
// daily per tenant — cheap to compute by counting today's sales so far.
async function nextInvoiceNo(tenantId) {
  const d = today().replace(/-/g, '');
  const { count } = await supabase.from('transactions').select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('type', 'sale').eq('date', today());
  const seq = String((count || 0) + 1).padStart(4, '0');
  return `DOK-${d}-${seq}`;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const action = (req.query && req.query.action) || (req.body && req.body.action) || '';

  try {
    // ── PUBLIC INVOICE VERIFICATION (§7 — QR on the receipt links here) ──
    // Deliberately NOT behind requireSession: a customer scanning the QR
    // on their printed receipt has no shop login. Returns only what's
    // needed to confirm the receipt is genuine — no customer contact
    // info, no cost/profit data.
    if (action === 'verify' && req.method === 'GET') {
      const tenantId = str(req.query.tenant);
      const invoiceNo = str(req.query.invoiceNo);
      const { data: tenant } = await supabase.from('tenants').select('shop_name,status').eq('id', tenantId).maybeSingle();
      if (!tenant || tenant.status !== 'active') return res.json({ ok: false, error: 'যাচাই করা যায়নি' });
      const { data: lines } = await supabase.from('transactions').select('qty,unit_price,discount,date,products(name)').eq('tenant_id', tenantId).eq('invoice_no', invoiceNo).eq('type', 'sale');
      if (!lines || !lines.length) return res.json({ ok: false, error: 'এই ইনভয়েসটি খুঁজে পাওয়া যায়নি — এটি সঠিক নাও হতে পারে' });
      const total = lines.reduce((s, l) => s + num(l.qty) * num(l.unit_price) - num(l.discount), 0);
      return res.json({
        ok: true, valid: true, shopName: tenant.shop_name, invoiceNo, date: lines[0].date, total,
        itemCount: lines.length
      });
    }

    const ses = await requireSession(req, res); if (!ses) return;

    // ── CHECKOUT (§7) ────────────────────────────────────────────────────
    // Body: { items: [{productId, qty, unitPrice}], customerId, discount,
    //         paymentMethod, dueAmount }
    if (action === 'checkout' && req.method === 'POST') {
      if (!roleAllowed(ses.role, ['owner', 'manager', 'cashier', 'salesperson']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });

      const d = req.body || {};
      const items = Array.isArray(d.items) ? d.items : [];
      if (!items.length) return res.json({ ok: false, error: 'কার্ট খালি' });

      // Validate each line against current stock + minimum_selling_price.
      // If ANY line is below minimum, the whole sale is blocked pending
      // Manager/Owner approval (§7) — [ADAPT] pending_approvals mechanism.
      const productIds = items.map(i => i.productId);
      const { data: products, error: pErr } = await supabase.from('products').select('*').eq('tenant_id', ses.tenantId).in('id', productIds);
      if (pErr) throw pErr;
      const byId = Object.fromEntries((products || []).map(p => [p.id, p]));

      const belowMin = items.some(i => {
        const p = byId[i.productId];
        return p && p.minimum_selling_price != null && num(i.unitPrice) < num(p.minimum_selling_price);
      });
      const insufficientStock = items.some(i => {
        const p = byId[i.productId];
        return p && num(p.current_stock) < num(i.qty);
      });
      if (insufficientStock) return res.json({ ok: false, error: 'পর্যাপ্ত স্টক নেই' });

      if (belowMin && !roleAllowed(ses.role, ['owner', 'manager'])) {
        const { data: approval, error: aErr } = await supabase.from('pending_approvals').insert({
          tenant_id: ses.tenantId, kind: 'custom_price',
          payload: { items, customerId: d.customerId || null, discount: num(d.discount), paymentMethod: str(d.paymentMethod) || 'cash', dueAmount: num(d.dueAmount) },
          requested_by: ses.staffId
        }).select().single();
        if (aErr) throw aErr;
        return res.json({ ok: false, needsApproval: true, approvalId: approval.id, error: 'ন্যূনতম বিক্রয় মূল্যের নিচে — ম্যানেজার/মালিকের অনুমোদন প্রয়োজন' });
      }

      return await finalizeSale(ses, items, byId, d);
    }

    // Manager/Owner approves a pending below-minimum sale.
    if (action === 'approve-sale' && req.method === 'POST') {
      if (!roleAllowed(ses.role, ['owner', 'manager']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const { approvalId, decision } = req.body || {}; // decision: 'approved' | 'rejected'
      const { data: approval } = await supabase.from('pending_approvals').select('*').eq('id', approvalId).eq('tenant_id', ses.tenantId).maybeSingle();
      if (!approval || approval.status !== 'pending') return res.json({ ok: false, error: 'অনুরোধ পাওয়া যায়নি' });

      await supabase.from('pending_approvals').update({ status: decision, decided_by: ses.staffId, decided_at: new Date().toISOString() }).eq('id', approvalId);
      if (decision !== 'approved') return res.json({ ok: true, rejected: true });

      const items = approval.payload.items;
      const productIds = items.map(i => i.productId);
      const { data: products } = await supabase.from('products').select('*').eq('tenant_id', ses.tenantId).in('id', productIds);
      const byId = Object.fromEntries((products || []).map(p => [p.id, p]));
      const result = await finalizeSale(ses, items, byId, approval.payload);
      return result;
    }

    if (action === 'pending-approvals' && req.method === 'GET') {
      if (!roleAllowed(ses.role, ['owner', 'manager']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const { data } = await supabase.from('pending_approvals').select('*').eq('tenant_id', ses.tenantId).eq('status', 'pending').order('created_at');
      return res.json({ ok: true, approvals: data || [] });
    }

    // ── RETURNS / DAMAGE against an existing sale ───────────────────────
    if (action === 'return' && req.method === 'POST') {
      if (!roleAllowed(ses.role, ['owner', 'manager', 'cashier']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const { productId, qty, invoiceNo } = req.body || {};
      const { error } = await supabase.from('transactions').insert({
        tenant_id: ses.tenantId, type: 'return', product_id: productId, qty: num(qty),
        invoice_no: str(invoiceNo), cashier_id: ses.staffId
      });
      if (error) throw error;
      return res.json({ ok: true });
    }

    // ── INVOICE / RECEIPT LOOKUP (§7 receipt + §15 search deep-link) ────
    if (action === 'invoice' && req.method === 'GET') {
      const invoiceNo = str(req.query.invoiceNo);
      const { data: lines } = await supabase.from('transactions').select('*, products(name,unit)').eq('tenant_id', ses.tenantId).eq('invoice_no', invoiceNo).eq('type', 'sale');
      if (!lines || !lines.length) return res.json({ ok: false, error: 'ইনভয়েস পাওয়া যায়নি' });
      const { data: tenant } = await supabase.from('tenants').select('shop_name,mobile,address,vat_percent,receipt_width_mm').eq('id', ses.tenantId).maybeSingle();
      const { data: cashier } = await supabase.from('staff').select('name').eq('id', lines[0].cashier_id).maybeSingle();
      let customer = null;
      if (lines[0].customer_id) {
        const { data: c } = await supabase.from('customers').select('name,phone').eq('id', lines[0].customer_id).maybeSingle();
        customer = c;
      }
      return res.json({ ok: true, invoiceNo, lines, tenant, cashierName: cashier && cashier.name, customer, date: lines[0].date });
    }

    if (action === 'today-sales' && req.method === 'GET') {
      const { data } = await supabase.from('transactions').select('*').eq('tenant_id', ses.tenantId).eq('type', 'sale').eq('date', today());
      const total = (data || []).reduce((s, t) => s + num(t.qty) * num(t.unit_price) - num(t.discount), 0);
      const profit = (data || []).reduce((s, t) => s + (num(t.unit_price) - num(t.purchase_price)) * num(t.qty) - num(t.discount), 0);
      return res.json({ ok: true, count: (data || []).length, total, profit, transactions: data || [] });
    }

    // ── POS CUSTOMERS quick-add (full registry lives in customers.js) ───
    if (action === 'quick-customer' && req.method === 'POST') {
      const { name, phone } = req.body || {};
      if (!str(name)) return res.json({ ok: false, error: 'নাম দিন' });
      const { data, error } = await supabase.from('customers').insert({ tenant_id: ses.tenantId, name: str(name), phone: str(phone) }).select().single();
      if (error) throw error;
      return res.json({ ok: true, customer: data });
    }

    res.status(400).json({ ok: false, error: 'অজানা action: ' + action });
  } catch (e) {
    res.json({ ok: false, error: safeErr(e) });
  }

  // Shared checkout finisher — inserts one `transactions` row per cart
  // line (stock trigger fires automatically, §11), creates a due_calendar
  // entry if this was a due sale (§10), and returns the invoice number
  // for receipt rendering (§7).
  async function finalizeSale(ses, items, byId, d) {
    const invoiceNo = str(d.invoiceNo) || await nextInvoiceNo(ses.tenantId);
    const rows = items.map(i => {
      const p = byId[i.productId] || {};
      return {
        tenant_id: ses.tenantId, type: 'sale', invoice_no: invoiceNo,
        product_id: i.productId, qty: num(i.qty), unit_price: num(i.unitPrice),
        purchase_price: num(p.purchase_price), discount: num(i.lineDiscount) || 0,
        customer_id: d.customerId || null, payment_method: str(d.paymentMethod) || 'cash',
        cashier_id: ses.staffId, date: today()
      };
    });
    const { error } = await supabase.from('transactions').insert(rows);
    if (error) throw error;

    const grandTotal = rows.reduce((s, r) => s + r.qty * r.unit_price - r.discount, 0) - num(d.discount);
    if (d.customerId && num(d.dueAmount) > 0) {
      await supabase.from('due_calendar').insert({
        tenant_id: ses.tenantId, party_type: 'customer', party_id: d.customerId,
        ref_type: 'sale', total_amount: grandTotal, paid_amount: grandTotal - num(d.dueAmount),
        status: num(d.dueAmount) >= grandTotal ? 'pending' : 'partial'
      });
    }
    return res.json({ ok: true, invoiceNo, total: grandTotal, discount: num(d.discount) });
  }
};
