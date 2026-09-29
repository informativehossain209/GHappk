const { supabase, cors, num, str, now_, mapDue, safeErr, applyDuePayment, fetchAll } = require('./_lib/db');
const { randomUUID } = require('crypto');

// Merged with the former api/settings.js (app-wide shop-name setting) to
// stay within the Vercel Hobby plan's 12-Serverless-Function limit — both
// live in one file, distinguished by ?action=.
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const action = req.query.action || (req.body && req.body.action);

    // GET — app-wide shop/business identity (used on every printed
    // challan, memo, report and slip letterhead).
    if (req.method === 'GET' && action === 'settings-get') {
      const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return res.json({
        ok: true,
        shopName:        (data && data.shop_name)        || '',
        shopAddress:     (data && data.shop_address)      || '',
        shopPhone:       (data && data.shop_phone)        || '',
        distributorName: (data && data.distributor_name)  || '',
        logoText:        (data && data.logo_text)         || ''
      });
    }

    // POST — update the app-wide shop/business identity. Only shopName is
    // required; the rest are optional and simply won't be printed on
    // documents until the owner fills them in.
    if (req.method === 'POST' && action === 'settings-update') {
      const d = req.body || {};
      const shopName = str(d.shopName, 120);
      if (!shopName) return res.json({ ok: false, error: 'দোকান/প্রতিষ্ঠানের নাম দিন' });
      const shopAddress     = str(d.shopAddress, 200);
      const shopPhone       = str(d.shopPhone, 30);
      const distributorName = str(d.distributorName, 120);
      const logoText        = str(d.logoText, 4);

      const { error } = await supabase.from('app_settings').upsert({
        id: 1, shop_name: shopName, shop_address: shopAddress, shop_phone: shopPhone,
        distributor_name: distributorName, logo_text: logoText,
        set_by: str(d.setBy, 60), updated_at: now_()
      });
      if (error) throw error;
      return res.json({ ok: true, shopName, shopAddress, shopPhone, distributorName, logoText });
    }

    // GET — fetch dues filtered by month and/or dsrId
    if (req.method === 'GET') {
      const { month, dsrId, shopId } = req.query;
      // fetchAll: a busy month (or an all-time per-DSR/shop history) can
      // pass PostgREST's silent 1000-row cap.
      const data = await fetchAll(() => {
        let q = supabase.from('due_calendar').select('*').order('due_date');
        if (month) {
          const [calY, calM] = month.split('-').map(Number);
          const lastDay  = new Date(calY, calM, 0).getDate();
          const lastDate = month + '-' + String(lastDay).padStart(2, '0');
          q = q.gte('due_date', month + '-01').lte('due_date', lastDate);
        }
        // dsrId filter: DSR or SO can only see their own calendar dues
        if (dsrId) q = q.eq('dsr_id', dsrId);
        // shopId filter: pull a single shop's due history (used by shops.js detail view)
        if (shopId) q = q.eq('shop_id', shopId);
        return q;
      });
      return res.json({ ok: true, dues: (data || []).map(mapDue) });
    }

    // POST — add a new due entry
    if (req.method === 'POST') {
      const d = req.body;
      if (!d.dueDate || !d.amount) return res.json({ ok: false, error: 'dueDate ও amount প্রয়োজন' });
      const { data, error } = await supabase.from('due_calendar').insert({
        id:          randomUUID(),
        dsr_id:      d.dsrId   || '',
        dsr_name:    d.dsrName || '',
        client_type: d.clientType || 'dsr',
        shop_id:     d.shopId   || '',
        shop_name:   d.shopName || '',
        due_date:    d.dueDate,
        amount:      num(d.amount),
        paid_amount: 0,
        note:        d.note || '',
        status:      'pending',
        cleared_date: null,
        created_at:  now_()
      }).select().single();
      if (error) throw error;
      return res.json({ ok: true, due: mapDue(data) });
    }

    // PUT — partial/full payment, undo, or edit fields
    if (req.method === 'PUT') {
      const d = req.body;
      if (!d.id) return res.json({ ok: false, error: 'id প্রয়োজন' });

      if (typeof d.payAmount !== 'undefined') {
        const pay = num(d.payAmount);
        if (pay <= 0) return res.json({ ok: false, error: 'পরিমাণ ০-এর বেশি হতে হবে' });

        // v4.8.0 — goes through the shared helper so a shop-due payment is
        // also logged in due_collections (the end-of-day settlement reads
        // that log to know how much cash the DSR collected today).
        const r1 = await applyDuePayment(d.id, pay, { dsrId: d.collectorId || '', dsrName: d.collectorName || '' });
        if (r1.conflict) return res.json({ ok: false, error: 'অন্য একটি আপডেট চলছিল — আবার চেষ্টা করুন' });
        if (r1.applied <= 0) return res.json({ ok: false, error: 'এই বাকি আগেই পরিশোধিত' });
        return res.json({ ok: true, paidAmount: r1.paidAmount, remaining: r1.remaining, status: r1.status });
      }

      // V44 update #11: the "take back to previous" control (reverting a
      // cleared entry back to pending, wiping its payment info) has been
      // removed entirely — 'cleared' is the only status transition this
      // endpoint still performs.
      const updates = {};
      if (d.status === 'cleared') {
        updates.status       = 'cleared';
        updates.cleared_date = new Date().toISOString().slice(0, 10);
        const { data: cur } = await supabase
          .from('due_calendar').select('amount').eq('id', d.id).single();
        if (cur) updates.paid_amount = num(cur.amount);
      }
      if (d.dueDate)            updates.due_date    = d.dueDate;
      if (d.amount)             updates.amount      = num(d.amount);
      if (d.dsrName)            updates.dsr_name    = d.dsrName;
      if (d.dsrId)              updates.dsr_id      = d.dsrId;
      if (d.clientType)         updates.client_type = d.clientType;
      if (d.shopId !== undefined)   updates.shop_id   = d.shopId;
      if (d.shopName !== undefined) updates.shop_name = d.shopName;
      if (d.note !== undefined) updates.note        = d.note;

      const { error } = await supabase.from('due_calendar').update(updates).eq('id', d.id);
      if (error) throw error;
      return res.json({ ok: true });
    }

    // DELETE — remove a due entry
    if (req.method === 'DELETE') {
      const d = req.body;
      if (!d.id) return res.json({ ok: false, error: 'id প্রয়োজন' });
      const { error } = await supabase.from('due_calendar').delete().eq('id', d.id);
      if (error) throw error;
      return res.json({ ok: true });
    }

    res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (e) {
    res.json({ ok: false, error: safeErr(e) });
  }
};
