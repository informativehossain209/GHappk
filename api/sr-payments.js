const { supabase, cors, num, now_, mapPayment, mapOrder, safeErr, fetchAll, bdtToday, computeVanStock, applyDuePayment } = require('./_lib/db');
const { randomUUID } = require('crypto');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const action = (req.query && req.query.action) || (req.body && req.body.action) || '';

  try {
    // ══════════════════════════════════════════════════
    //  MANAGER APPROVAL FLOW
    // ══════════════════════════════════════════════════

    // GET pending approvals — owner sees all, manager sees own
    if (req.method === 'GET' && action === 'approvals') {
      const managerId = req.query && req.query.managerId;
      let q = supabase.from('manager_pending_approvals')
        .select('*').order('submitted_at', { ascending: false });
      if (managerId) q = q.eq('manager_id', managerId);
      const { data, error } = await q;
      if (error) throw error;
      return res.json({ ok: true, approvals: (data || []).map(mapApproval) });
    }

    // POST — Manager submits entry for approval
    if (req.method === 'POST' && action === 'approval_submit') {
      const d = req.body;
      const { error } = await supabase.from('manager_pending_approvals').insert({
        id:           randomUUID(),
        manager_id:   d.managerId   || '',
        manager_name: d.managerName || '',
        input_type:   d.inputType   || '',
        input_data:   d.inputData   || {},
        submitted_at: now_(),
        status:       'pending',
        approved_at:  null,
        approved_by:  null
      });
      if (error) throw error;
      return res.json({ ok: true });
    }

    // POST — Owner approves a single entry
    if (req.method === 'POST' && action === 'approval_approve') {
      const { id } = req.body;
      const { data: row, error: fetchErr } = await supabase
        .from('manager_pending_approvals').select('*').eq('id', id).single();
      if (fetchErr) throw fetchErr;
      if (!row || row.status !== 'pending')
        return res.json({ ok: false, error: 'এন্ট্রি পাওয়া যায়নি বা ইতিমধ্যে প্রক্রিয়া হয়েছে' });
      const _ar = await _doApprove(row);
      if (_ar && _ar.ok === false) {
        // A duplicate settlement means it was already applied — close the request; any other failure stays pending.
        if (_ar.duplicate) {
          await supabase.from('manager_pending_approvals').update({ status: 'approved', approved_at: now_(), approved_by: 'owner' }).eq('id', id);
        }
        return res.json({ ok: false, error: _ar.error || 'অনুমোদন ব্যর্থ' });
      }
      const { error: updErr } = await supabase.from('manager_pending_approvals')
        .update({ status: 'approved', approved_at: now_(), approved_by: 'owner' })
        .eq('id', id);
      if (updErr) throw updErr;
      return res.json({ ok: true });
    }

    // POST — Owner approves ALL pending entries at once
    if (req.method === 'POST' && action === 'approval_approve_all') {
      const { data: rows, error: fetchErr } = await supabase
        .from('manager_pending_approvals').select('*').eq('status', 'pending');
      if (fetchErr) throw fetchErr;
      if (!rows || !rows.length) return res.json({ ok: true, count: 0 });
      const okIds = []; let failed = 0;
      for (const row of rows) {
        const _ar = await _doApprove(row);
        if (_ar && _ar.ok === false && !_ar.duplicate) { failed++; continue; }
        okIds.push(row.id);
      }
      if (okIds.length) {
        const { error: updErr } = await supabase.from('manager_pending_approvals')
          .update({ status: 'approved', approved_at: now_(), approved_by: 'owner' })
          .in('id', okIds);
        if (updErr) throw updErr;
      }
      return res.json({ ok: true, count: okIds.length, failed });
    }

    // POST — Owner rejects a single entry
    if (req.method === 'POST' && action === 'approval_reject') {
      const { id } = req.body;
      const { error } = await supabase.from('manager_pending_approvals')
        .update({ status: 'rejected', approved_at: now_(), approved_by: 'owner' })
        .eq('id', id);
      if (error) throw error;
      return res.json({ ok: true });
    }

    // POST — Owner edits a pending entry's data before approving.
    // Requires Owner PIN re-entry every time (AXIION §9 "no miss edit").
    if (req.method === 'POST' && action === 'approval_edit') {
      const { id, ownerPin, updatedInputData } = req.body || {};
      if (!id || !ownerPin || !updatedInputData)
        return res.json({ ok: false, error: 'id, ownerPin ও updatedInputData প্রয়োজন' });

      const { data: ownerRow, error: pinErr } = await supabase
        .from('user_passwords').select('id').eq('role', 'owner').eq('password', String(ownerPin).trim()).limit(1);
      if (pinErr) throw pinErr;
      if (!ownerRow || !ownerRow.length) return res.json({ ok: false, error: 'ভুল Owner PIN' });

      const { data: row, error: fetchErr } = await supabase
        .from('manager_pending_approvals').select('status').eq('id', id).single();
      if (fetchErr) throw fetchErr;
      if (!row || row.status !== 'pending')
        return res.json({ ok: false, error: 'এন্ট্রি পাওয়া যায়নি বা ইতিমধ্যে প্রক্রিয়া হয়েছে' });

      const { error } = await supabase.from('manager_pending_approvals')
        .update({ input_data: updatedInputData }).eq('id', id);
      if (error) throw error;
      return res.json({ ok: true });
    }

    // ══════════════════════════════════════════════════
    //  SO ORDERING → APPROVAL → VAN-LOAD WORKFLOW (AXIION §13)
    // ══════════════════════════════════════════════════

    // POST — SO places a new order
    if (req.method === 'POST' && action === 'order_submit') {
      const d = req.body || {};
      const items = Array.isArray(d.items) ? d.items : [];
      if (!d.soId || !items.length) return res.json({ ok: false, error: 'soId ও items প্রয়োজন' });
      const requestedAmount = items.reduce((s, it) => s + num(it.totalUnits) * num(it.sellingPrice), 0);

      // AXIION §17-follow-up / Update #20: auto-carry the SO's
      // same-numbered auto-paired DSR (so_id, set automatically by
      // api/srs.js at registration time — no manual handshake anymore)
      // onto the order at the moment it's placed, so Manager/Owner no
      // longer have to hand-pick a DSR at approval time — they just
      // approve and it's already routed to the paired DSR. If this SO
      // has no same-numbered DSR registered yet, this stays blank and
      // the approver falls back to picking one manually (see order_approve).
      let autoDsrId = '';
      const { data: pairedDsr } = await supabase.from('srs')
        .select('id').eq('so_id', String(d.soId)).eq('role', 'dsr').limit(1);
      if (pairedDsr && pairedDsr.length) autoDsrId = String(pairedDsr[0].id);

      // v60 — SIMPLIFIED FLOW: an SO's order goes STRAIGHT to the paired
      // DSR's van-load list (status 'approved' = ready to load). No
      // manager/owner approval step. Stock only moves when the DSR
      // presses OK after loading (van_load_complete). Owner/manager can
      // still watch everything in the Orders monitor. Only if the SO has
      // no paired DSR yet does the order wait ('pending') for someone to
      // assign one.
      const ts0 = now_();
      const { data, error } = await supabase.from('orders').insert({
        id: randomUUID(), so_id: String(d.soId), so_name: d.soName || '',
        items, original_items: items, requested_amount: requestedAmount,
        status: autoDsrId ? 'approved' : 'pending',
        assigned_dsr_id: autoDsrId, load_status: 'not_started', load_ticks: {},
        approved_by: autoDsrId ? 'auto' : '', approved_at: autoDsrId ? ts0 : null,
        created_at: ts0
      }).select().single();
      if (error) throw error;
      return res.json({ ok: true, order: mapOrder(data), autoAssigned: !!autoDsrId });
    }

    // POST — Modify an order's quantities (v60: no approval loop).
    //  Applies immediately for everyone (manager / owner / the DSR who is
    //  about to load it). The first time an order is edited, the original
    //  quantities are kept in original_items so the owner can always see
    //  "ordered X → loaded Y" in the Orders monitor.
    if (req.method === 'POST' && action === 'order_modify') {
      const d = req.body || {};
      if (!d.id || !Array.isArray(d.items)) return res.json({ ok: false, error: 'id ও items প্রয়োজন' });
      const { data: cur, error: curErr } = await supabase.from('orders').select('status,load_status,items,original_items').eq('id', d.id).single();
      if (curErr) throw curErr;
      if (!cur) return res.json({ ok: false, error: 'অর্ডার পাওয়া যায়নি' });
      if (cur.load_status === 'loaded' || cur.status === 'rejected')
        return res.json({ ok: false, error: 'এই অর্ডার আর পরিবর্তন করা যাবে না' });
      const modifiedAmount = d.items.reduce((s, it) => s + num(it.totalUnits) * num(it.sellingPrice), 0);
      const who = ['manager', 'owner', 'dsr'].includes(d.requestedBy) ? d.requestedBy : 'manager';
      const { error } = await supabase.from('orders').update({
        items: d.items, modified_by: who, modified_amount: modifiedAmount, proposed_items: null,
        original_items: cur.original_items || cur.items,
        status: cur.status === 'modified_pending' ? 'pending' : cur.status
      }).eq('id', d.id);
      if (error) throw error;
      return res.json({ ok: true, appliedDirectly: true });
    }

    // POST — Manager/Owner finalises an order (accepts any DSR proposal
    // too) and assigns it as a Load Task to a DSR.
    // dsrId is now OPTIONAL — if the SO was connected to a DSR when the
    // order was placed (order_submit auto-fills assigned_dsr_id from that
    // pairing), Manager/Owner just approve as-is. dsrId is only needed
    // as a manual override/fallback when no pairing existed at submit time.
    if (req.method === 'POST' && action === 'order_approve') {
      const { id, dsrId, approvedBy } = req.body || {};
      if (!id) return res.json({ ok: false, error: 'id প্রয়োজন' });
      const { data: row, error: fetchErr } = await supabase.from('orders').select('*').eq('id', id).single();
      if (fetchErr) throw fetchErr;
      if (!row || !['pending', 'modified_pending'].includes(row.status))
        return res.json({ ok: false, error: 'অর্ডার পাওয়া যায়নি বা ইতিমধ্যে প্রক্রিয়া হয়েছে' });

      const finalDsrId = String(dsrId || row.assigned_dsr_id || '');
      if (!finalDsrId)
        return res.json({ ok: false, error: 'এই SO কোনো DSR এর সাথে সংযুক্ত নয় — অনুমোদনের আগে ম্যানুয়ালি একজন DSR নির্বাচন করুন' });

      const finalItems = row.status === 'modified_pending' && row.proposed_items ? row.proposed_items : row.items;
      const { error } = await supabase.from('orders').update({
        items: finalItems, proposed_items: null, original_items: row.original_items || row.items,
        status: 'approved', assigned_dsr_id: finalDsrId, load_status: 'not_started', load_ticks: {},
        approved_by: approvedBy || '', approved_at: now_()
      }).eq('id', id);
      if (error) throw error;
      return res.json({ ok: true, dsrId: finalDsrId });
    }

    // POST — Manager/Owner rejects a pending SO order outright
    if (req.method === 'POST' && action === 'order_reject') {
      const { id } = req.body || {};
      if (!id) return res.json({ ok: false, error: 'id প্রয়োজন' });
      const { data: row, error: fetchErr } = await supabase.from('orders').select('status').eq('id', id).single();
      if (fetchErr) throw fetchErr;
      if (!row || !['pending', 'modified_pending'].includes(row.status))
        return res.json({ ok: false, error: 'অর্ডার পাওয়া যায়নি বা ইতিমধ্যে প্রক্রিয়া হয়েছে' });
      const { error } = await supabase.from('orders').update({ status: 'rejected' }).eq('id', id);
      if (error) throw error;
      return res.json({ ok: true });
    }

    // POST — Owner/Manager gives stock directly to a DSR. Instead of an
    // instant stock write, this creates an already-approved Load Task
    // exactly like an approved SO order — the DSR must physically tick
    // each item and press "Finish Loading" before stock actually leaves
    // the warehouse. (Owner's give needs no further approval; a
    // Manager's give still goes through the existing approval_submit →
    // Owner-approval queue first — see _doApprove below, which now
    // routes an approved Manager "give" through this same path instead
    // of writing straight to transactions.)
    if (req.method === 'POST' && action === 'give_direct') {
      const d = req.body || {};
      const items = Array.isArray(d.items) ? d.items : [];
      if (!d.dsrId || !items.length) return res.json({ ok: false, error: 'dsrId ও items প্রয়োজন' });
      const requestedAmount = items.reduce((s, it) => s + num(it.totalUnits) * num(it.sellingPrice), 0);
      const who = d.requestedBy === 'manager' ? 'ম্যানেজার' : 'মালিক';
      const label = 'দেওয়া (' + who + (d.requestedByName ? ' — ' + d.requestedByName : '') + ')';
      const { data, error } = await supabase.from('orders').insert({
        id: randomUUID(), so_id: '', so_name: label,
        items, original_items: items, requested_amount: requestedAmount,
        status: 'approved', assigned_dsr_id: String(d.dsrId), load_status: 'not_started', load_ticks: {},
        approved_by: d.requestedBy || 'owner', approved_at: now_(), created_at: now_()
      }).select().single();
      if (error) throw error;
      return res.json({ ok: true, order: mapOrder(data) });
    }

    // GET — order queue for Manager/Owner (all) or a specific SO (own only)
    if (req.method === 'GET' && action === 'orders_list') {
      const { soId, status } = req.query;
      let q = supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (soId) q = q.eq('so_id', soId);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return res.json({ ok: true, orders: (data || []).map(mapOrder) });
    }

    // GET — DSR's pending load checklist
    if (req.method === 'GET' && action === 'van_load_list') {
      const { dsrId } = req.query;
      if (!dsrId) return res.json({ ok: false, error: 'dsrId প্রয়োজন' });
      const { data, error } = await supabase.from('orders')
        .select('*').eq('assigned_dsr_id', dsrId).eq('status', 'approved')
        .in('load_status', ['not_started', 'loading']).order('approved_at');
      if (error) throw error;
      return res.json({ ok: true, orders: (data || []).map(mapOrder) });
    }

    // POST — DSR ticks one product line as physically loaded.
    // Kept for backward compatibility only — Update #28 replaced the
    // per-item ticking UI with a single "সম্পন্ন" button (see
    // van_load_complete below), so the front-end no longer calls this.
    if (req.method === 'POST' && action === 'van_load_tick') {
      const { id, itemId, ticked } = req.body || {};
      if (!id || !itemId) return res.json({ ok: false, error: 'id ও itemId প্রয়োজন' });
      const { data: row, error: fetchErr } = await supabase.from('orders').select('load_ticks').eq('id', id).single();
      if (fetchErr) throw fetchErr;
      const ticks = { ...(row.load_ticks || {}), [itemId]: ticked !== false };
      const { error } = await supabase.from('orders')
        .update({ load_ticks: ticks, load_status: 'loading' }).eq('id', id);
      if (error) throw error;
      return res.json({ ok: true, loadTicks: ticks });
    }

    // ══════════════════════════════════════════════════
    //  Update #28 — Simplify DSR Van-Load Completion
    //  Old flow: DSR ticks every product line individually, then presses
    //  "Finish Loading" once every tick is checked, which immediately
    //  wrote the `give` transactions and deducted stock right there.
    //  New flow: DSR sees the whole approved list at once (color-coded
    //  rows, no per-item clicking) and presses one single "সম্পন্ন"
    //  (Complete) button. That only tells the Manager/Owner "this load
    //  is physically complete" (load_status → 'load_complete') — it does
    //  NOT touch stock or write any transaction yet. The real `give`
    //  transactions (and the stock deduction) only happen once
    //  Manager/Owner reviews and confirms the completed load via
    //  van_load_confirm below — same underlying write as the old
    //  van_load_finish, just moved to sit behind an explicit
    //  Manager/Owner approval step instead of the DSR's own tap, so
    //  stock only ever leaves the warehouse with a second set of eyes
    //  on it (consistent with every other stock-affecting action in the
    //  app, which all go through an approval gate before touching stock).
    // ══════════════════════════════════════════════════

    // POST — DSR presses OK after loading the van (v60).
    // THIS is the moment stock leaves the warehouse: the `give`
    // transactions are written right here (DB trigger deducts stock).
    // No manager/owner confirmation any more.
    if (req.method === 'POST' && action === 'van_load_complete') {
      const { id } = req.body || {};
      if (!id) return res.json({ ok: false, error: 'id প্রয়োজন' });
      const r = await _loadAndDeduct(id, ['not_started', 'loading', 'load_complete']);
      return res.json(r);
    }

    // GET — Manager/Owner: queue of DSR-completed loads awaiting confirmation
    if (req.method === 'GET' && action === 'van_load_confirm_list') {
      const { dsrId } = req.query;
      let q = supabase.from('orders').select('*').eq('status', 'approved').eq('load_status', 'load_complete').order('created_at');
      if (dsrId) q = q.eq('assigned_dsr_id', dsrId);
      const { data, error } = await q;
      if (error) throw error;
      return res.json({ ok: true, orders: (data || []).map(mapOrder) });
    }

    // POST — legacy: loads the old flow had left waiting for confirmation.
    // Kept so any order already in 'load_complete' can still be finished.
    if (req.method === 'POST' && (action === 'van_load_confirm' || action === 'van_load_finish')) {
      const { id } = req.body || {};
      if (!id) return res.json({ ok: false, error: 'id প্রয়োজন' });
      const r = await _loadAndDeduct(id, ['load_complete']);
      return res.json(r);
    }

    // ══════════════════════════════════════════════════
    //  DSR RECONCILE (V31) — "how much can we actually collect from him
    //  today, and how much stays as due" — used by the SR পেমেন্ট (Payment)
    //  entry screen. lifetimeDue mirrors the exact give/return/payments
    //  formula used everywhere else in the app (dashboard.js ownDue) so
    //  it always agrees with the DSR's own dashboard figure. The `today`
    //  block additionally breaks out how much of today's given stock he
    //  has actually sold to shops (dsr_sale — doesn't touch stock/due by
    //  itself), how much cash he already collected from those shop sales
    //  (should be handed over now), how much became a fresh shop-credit
    //  due today (visible, but still under his name until collected), and
    //  how much given stock is still unaccounted for (still on the van /
    //  not yet sold, returned, or damaged).
    // ══════════════════════════════════════════════════
    if (req.method === 'GET' && action === 'dsr-reconcile') {
      const { dsrId, date } = req.query;
      if (!dsrId) return res.json({ ok: false, error: 'dsrId প্রয়োজন' });
      const d = (date && DATE_RE.test(date)) ? date : new Date().toISOString().slice(0, 10);

      // Lifetime due — identical formula to the DSR's own dashboard due.
      // Paginated: a long-running DSR's lifetime give/return history can
      // pass the 1000-row PostgREST cap after a couple of years.
      const allDueTx = await fetchAll(() => supabase.from('transactions')
        .select('type,total_revenue').eq('sr_id', dsrId).in('type', ['give', 'return']));
      const givenRevAll  = (allDueTx || []).filter(r => r.type === 'give').reduce((s, r) => s + num(r.total_revenue), 0);
      const returnRevAll = (allDueTx || []).filter(r => r.type === 'return').reduce((s, r) => s + num(r.total_revenue), 0);
      const allPay = await fetchAll(() => supabase.from('sr_payments').select('amount').eq('sr_id', dsrId));
      const paidAll = (allPay || []).reduce((s, r) => s + num(r.amount), 0);
      const lifetimeDue = (givenRevAll - returnRevAll) - paidAll;

      // Today's movement — given / returned / damage / sold-to-shops.
      // V35 — damage here uses total_revenue (SELLING price), not
      // total_cost (buying price): this is the DSR Payment page, where
      // damage represents value the DSR is no longer expected to collect
      // from customers (a selling-price figure), NOT the separate
      // buying-price reimbursement claim shown on the Damage Report
      // (dmg_claims / api/claims.js) — those two stay intentionally
      // different. commission_amt/discount_amt (V35 columns, populated
      // on 'dsr_sale' rows) give the DSR Payment page real "today's
      // commission" / "today's discount" totals instead of leaving them
      // for the manager to guess and type manually.
      const { data: dayTx, error: dayTxErr } = await supabase.from('transactions')
        .select('type,total_revenue,total_cost,commission_amt,discount_amt').eq('sr_id', dsrId).eq('date', d)
        .in('type', ['give', 'return', 'damage', 'dsr_sale']);
      if (dayTxErr) throw dayTxErr;
      const sum = (t, f) => (dayTx || []).filter(r => r.type === t).reduce((s, r) => s + num(r[f]), 0);
      const givenToday       = sum('give', 'total_revenue');
      const returnedToday    = sum('return', 'total_revenue');
      const damageToday      = sum('damage', 'total_revenue');
      const soldToShopsToday = sum('dsr_sale', 'total_revenue');
      const commissionToday  = sum('dsr_sale', 'commission_amt');
      const discountToday    = sum('dsr_sale', 'discount_amt');

      // Cash actually collected today vs. fresh shop-credit created today.
      const { data: dueToday, error: dueTodayErr } = await supabase.from('due_calendar')
        .select('amount,paid_amount').eq('dsr_id', dsrId).eq('client_type', 'shop').eq('due_date', d);
      if (dueTodayErr) throw dueTodayErr;
      const cashCollectedToday  = (dueToday || []).reduce((s, r) => s + num(r.paid_amount), 0);
      const shopDueCreatedToday = (dueToday || []).reduce((s, r) => s + (num(r.amount) - num(r.paid_amount)), 0);
      const stillWithDsrToday   = givenToday - returnedToday - damageToday - soldToShopsToday;

      return res.json({
        ok: true, dsrId: String(dsrId), date: d,
        lifetimeDue,
        today: {
          givenToday, returnedToday, damageToday, soldToShopsToday,
          commissionToday, discountToday,
          cashCollectedToday, shopDueCreatedToday, stillWithDsrToday
        }
      });
    }

    // ══════════════════════════════════════════════════
    //  Updates #32 & #33 — per-product VAN STOCK, day-scoped only
    //
    //  Bug fixed (#32, "Empty Van"): the DSR's sell-to-shop screen used
    //  to filter/display against S.stockMap — the MAIN WAREHOUSE stock
    //  (api/dashboard.js's products.current_stock), not what this DSR
    //  actually has loaded on his van. Since warehouse stock is almost
    //  always > 0, the DSR effectively saw the entire product catalog as
    //  "available to sell", including products he never physically
    //  received that day.
    //
    //  Fix (#33, day-scoped, no carry-over): this endpoint computes,
    //  per product, exactly what's left in THIS dsrId's van for THIS
    //  one date (defaults to today) — nothing from any other day is
    //  ever read, so nothing can carry over:
    //    vanStock[productId] = given(date) − returned(date)
    //                                       − sold-to-shops(date)
    //                                       − damage ALREADY reconciled
    //                                         by the Owner (date)
    //  Damage reported today but still 'pending' (not yet reconciled by
    //  the Owner in the Damage Report) is deliberately NOT subtracted —
    //  those units haven't physically left the DSR's hand yet, so they
    //  still count as "in hand" per Update #33, giving an accurate
    //  running picture of what the DSR currently carries. Once the
    //  Owner clears that claim, it's removed here too.
    // ══════════════════════════════════════════════════
    if (req.method === 'GET' && action === 'van-stock') {
      const { dsrId, date } = req.query;
      if (!dsrId) return res.json({ ok: false, error: 'dsrId প্রয়োজন' });
      const d = (date && DATE_RE.test(date)) ? date : bdtToday();
      // v4.8.0 — shared helper (api/_lib/db.js computeVanStock): the very
      // same numbers the server uses to REJECT an over-sale in
      // shops.js visit-sale, so the screen and the check can never disagree.
      const stock = await computeVanStock(dsrId, d, { damage: 'cleared' });
      return res.json({ ok: true, dsrId: String(dsrId), date: d, vanStock: stock });
    }

    // ══════════════════════════════════════════════════
    //  v4.8.0 — DSR DUE COLLECTION (বাকি আদায়)
    //  due-shops    GET  dsrId            → every shop with an unpaid due
    //  due-collect  POST shopId, amount   → oldest due first, logged
    // ══════════════════════════════════════════════════
    if (req.method === 'GET' && action === 'due-shops') {
      const { dsrId } = req.query;
      if (!dsrId) return res.json({ ok: false, error: 'dsrId প্রয়োজন' });
      const { data: mine, error: mErr } = await supabase.from('shops').select('id').eq('assigned_dsr_id', String(dsrId));
      if (mErr) throw mErr;
      const myShopIds = (mine || []).map(x => String(x.id));
      const [a, b] = await Promise.all([
        supabase.from('due_calendar').select('*').eq('client_type', 'shop').eq('dsr_id', String(dsrId)).in('status', ['pending', 'partial']),
        myShopIds.length
          ? supabase.from('due_calendar').select('*').eq('client_type', 'shop').in('shop_id', myShopIds).in('status', ['pending', 'partial'])
          : Promise.resolve({ data: [] })
      ]);
      if (a.error) throw a.error; if (b.error) throw b.error;
      const seen = {}; const rows = [];
      [...(a.data || []), ...(b.data || [])].forEach(r => { if (!seen[r.id]) { seen[r.id] = 1; rows.push(r); } });
      const shopIds = [...new Set(rows.map(r => String(r.shop_id || '')).filter(Boolean))];
      const shopMap = {};
      if (shopIds.length) {
        const { data: sh, error: sErr } = await supabase.from('shops').select('id,shop_no,name,keeper_name,phone,address,road_name').in('id', shopIds);
        if (sErr) throw sErr;
        (sh || []).forEach(x => { shopMap[String(x.id)] = x; });
      }
      const grouped = {};
      rows.forEach(r => {
        const sid = String(r.shop_id || '');
        const rem = num(r.amount) - num(r.paid_amount);
        if (rem <= 0.0001) return;
        if (!grouped[sid]) {
          const sh = shopMap[sid] || {};
          grouped[sid] = {
            shopId: sid, shopNo: sh.shop_no || '', shopName: sh.name || r.shop_name || 'অজানা দোকান',
            keeperName: sh.keeper_name || '', phone: sh.phone || '', address: sh.address || '', roadName: sh.road_name || '',
            totalDue: 0, dues: []
          };
        }
        grouped[sid].totalDue += rem;
        grouped[sid].dues.push({ id: String(r.id), dueDate: String(r.due_date || '').slice(0, 10), amount: num(r.amount), paid: num(r.paid_amount), remaining: rem, note: r.note || '' });
      });
      const shops = Object.values(grouped).sort((x, y) => y.totalDue - x.totalDue);
      shops.forEach(x => x.dues.sort((p, q) => p.dueDate.localeCompare(q.dueDate)));
      return res.json({ ok: true, shops, totalDue: shops.reduce((t, x) => t + x.totalDue, 0) });
    }

    if (req.method === 'POST' && action === 'due-collect') {
      const d = req.body || {};
      const amount = num(d.amount);
      if (!d.dsrId || !d.shopId) return res.json({ ok: false, error: 'dsrId ও shopId প্রয়োজন' });
      if (amount <= 0) return res.json({ ok: false, error: 'পরিমাণ ০-এর বেশি হতে হবে' });
      const { data: dues, error: dErr } = await supabase.from('due_calendar').select('*')
        .eq('client_type', 'shop').eq('shop_id', String(d.shopId)).in('status', ['pending', 'partial'])
        .order('due_date').order('created_at');
      if (dErr) throw dErr;
      const owed = (dues || []).reduce((t, r) => t + Math.max(0, num(r.amount) - num(r.paid_amount)), 0);
      if (owed <= 0) return res.json({ ok: false, error: 'এই দোকানের কোনো বাকি নেই' });
      if (amount > owed + 0.0001) return res.json({ ok: false, error: 'বাকি আছে মাত্র ৳' + owed.toFixed(2) + ' — এর বেশি নেওয়া যাবে না' });
      let left = amount, collected = 0;
      const meta = { dsrId: String(d.dsrId), dsrName: d.dsrName || '', date: bdtToday() };
      for (const r of dues) {
        if (left <= 0.0001) break;
        const rem = Math.max(0, num(r.amount) - num(r.paid_amount));
        const r1 = await applyDuePayment(r.id, Math.min(left, rem), meta);
        if (r1.conflict) return res.json({ ok: false, error: 'অন্য একটি আপডেট চলছিল — আবার চেষ্টা করুন' });
        collected += r1.applied; left -= r1.applied;
      }
      return res.json({ ok: true, collected, remaining: Math.max(0, owed - collected) });
    }

    // ══════════════════════════════════════════════════
    //  v4.8.0 — DSR DAMAGE COLLECTION (ড্যামেজ কালেকশন)
    //  A shop hands back damaged goods; the DSR either pays the shop
    //  cash ('money') or swaps it for any product on his van ('exchange').
    //  Damaged goods never re-enter warehouse stock. Every line also
    //  opens a pending dmg_claims row (tx_id 'dc:<id>') so the Owner's
    //  Damage Report keeps counting the company's purchase-price loss.
    // ══════════════════════════════════════════════════
    if (req.method === 'POST' && action === 'damage-collect') {
      const d = req.body || {};
      const lines = Array.isArray(d.lines) ? d.lines : [];
      if (!d.dsrId || !d.shopId) return res.json({ ok: false, error: 'dsrId ও shopId প্রয়োজন' });
      if (!lines.length) return res.json({ ok: false, error: 'কমপক্ষে একটি ড্যামেজ পণ্য দিন' });
      if (lines.length > 60) return res.json({ ok: false, error: 'একসাথে সর্বোচ্চ ৬০টি লাইন' });
      const date = (d.date && DATE_RE.test(d.date)) ? d.date : bdtToday();

      const { data: shop, error: shErr } = await supabase.from('shops').select('id,name').eq('id', String(d.shopId)).maybeSingle();
      if (shErr) throw shErr;
      if (!shop) return res.json({ ok: false, error: 'দোকান পাওয়া যায়নি' });

      const pids = new Set();
      lines.forEach(l => { if (l.productId) pids.add(String(l.productId)); if (l.exchProductId) pids.add(String(l.exchProductId)); });
      const { data: prods, error: pErr } = await supabase.from('products').select('id,name,sku,selling_price,purchase_price').in('id', [...pids]);
      if (pErr) throw pErr;
      const pm = {}; (prods || []).forEach(x => { pm[String(x.id)] = x; });

      const van = await computeVanStock(d.dsrId, date, { damage: 'cleared' });
      const needVan = {};
      const colId = randomUUID();
      const ts = now_();
      const colRows = [], claimRows = [];
      for (const l of lines) {
        const p = pm[String(l.productId || '')];
        const units = num(l.units);
        if (!p) return res.json({ ok: false, error: 'পণ্য পাওয়া যায়নি' });
        if (units <= 0) return res.json({ ok: false, error: (p.name || 'পণ্য') + ' — ড্যামেজের পরিমাণ দিন' });
        if (l.resolution !== 'money' && l.resolution !== 'exchange') return res.json({ ok: false, error: (p.name || 'পণ্য') + ' — টাকা ফেরত নাকি বদল, বেছে নিন' });
        const sp = num(p.selling_price), pp = num(p.purchase_price);
        const damagedValue = +(units * sp).toFixed(4);
        const row = {
          col_id: colId, dsr_id: String(d.dsrId), dsr_name: d.dsrName || '',
          shop_id: String(shop.id), shop_name: shop.name || '', date,
          product_id: String(p.id), product_name: p.name || '', sku: p.sku || '',
          units, selling_price: sp, purchase_price: pp, damaged_value: damagedValue,
          resolution: l.resolution, refund_amt: 0, exch_product_id: '', exch_product_name: '', exch_units: 0, exch_value: 0,
          note: String(d.note || '').slice(0, 200), created_at: ts
        };
        if (l.resolution === 'money') {
          const refund = l.refundAmt === undefined || l.refundAmt === '' ? damagedValue : num(l.refundAmt);
          if (refund < 0) return res.json({ ok: false, error: 'টাকার পরিমাণ ঋণাত্মক হতে পারে না' });
          if (refund > damagedValue + 0.0001) return res.json({ ok: false, error: (p.name || 'পণ্য') + ' — ফেরত টাকা (৳' + refund.toFixed(2) + ') ড্যামেজ মূল্যের (৳' + damagedValue.toFixed(2) + ') বেশি হতে পারে না' });
          row.refund_amt = +refund.toFixed(4);
        } else {
          const ep = pm[String(l.exchProductId || '')];
          const eu = num(l.exchUnits);
          if (!ep) return res.json({ ok: false, error: (p.name || 'পণ্য') + ' — বদলে কোন পণ্য দিচ্ছেন তা বাছুন' });
          if (eu <= 0) return res.json({ ok: false, error: (ep.name || 'পণ্য') + ' — বদলের পরিমাণ দিন' });
          needVan[String(ep.id)] = (needVan[String(ep.id)] || 0) + eu;
          row.exch_product_id = String(ep.id); row.exch_product_name = ep.name || '';
          row.exch_units = eu; row.exch_value = +(eu * num(ep.selling_price)).toFixed(4);
        }
        colRows.push(row);
        claimRows.push({
          tx_id: 'dc:' + colId, product_id: String(p.id), product_name: p.name || '', sku: p.sku || '',
          total_units: units, purchase_price: pp, total_cost: +(units * pp).toFixed(4),
          date, sr_id: String(d.dsrId), sr_name: d.dsrName || '', status: 'pending', cleared_date: null, created_at: ts
        });
      }
      for (const pid of Object.keys(needVan)) {
        const have = num(van[pid]);
        if (needVan[pid] > have + 0.0001) {
          const nm = (pm[pid] && pm[pid].name) || 'পণ্য';
          return res.json({ ok: false, error: nm + ' — গাড়িতে আছে মাত্র ' + have + ' পিস, বদলে দিতে চাইছেন ' + needVan[pid] + ' পিস' });
        }
      }
      const { error: iErr } = await supabase.from('damage_collections').insert(colRows);
      if (iErr) throw iErr;
      const { error: cErr } = await supabase.from('dmg_claims').insert(claimRows);
      if (cErr) {
        await supabase.from('damage_collections').delete().eq('col_id', colId);
        throw cErr;
      }
      const refundTotal = colRows.reduce((t, r) => t + num(r.refund_amt), 0);
      const exchTotal = colRows.reduce((t, r) => t + num(r.exch_value), 0);
      return res.json({ ok: true, colId, refundTotal, exchTotal, lines: colRows.length });
    }

    // Owner / Manager view (and the DSR's own list): what DSRs collected.
    if (req.method === 'GET' && action === 'collections-list') {
      const { dsrId, from, to } = req.query;
      const f = DATE_RE.test(from || '') ? from : bdtToday();
      const t = DATE_RE.test(to || '') ? to : f;
      const [dc, gc] = await Promise.all([
        fetchAll(() => { let q = supabase.from('due_collections').select('*').gte('date', f).lte('date', t).order('created_at', { ascending: false }); if (dsrId) q = q.eq('dsr_id', String(dsrId)); return q; }),
        fetchAll(() => { let q = supabase.from('damage_collections').select('*').gte('date', f).lte('date', t).order('created_at', { ascending: false }); if (dsrId) q = q.eq('dsr_id', String(dsrId)); return q; })
      ]);
      const shopIds = [...new Set([...(dc || []), ...(gc || [])].map(r => String(r.shop_id || '')).filter(Boolean))];
      const shopMap = {};
      if (shopIds.length) {
        const { data: sh } = await supabase.from('shops').select('id,shop_no,keeper_name,phone,address,road_name').in('id', shopIds);
        (sh || []).forEach(x => { shopMap[String(x.id)] = x; });
      }
      const shopInfo = id => { const x = shopMap[String(id || '')] || {}; return { shopNo: x.shop_no || '', keeperName: x.keeper_name || '', phone: x.phone || '', address: x.address || '', roadName: x.road_name || '' }; };
      const dues = (dc || []).map(r => ({ id: String(r.id), date: String(r.date).slice(0, 10), dsrId: r.dsr_id, dsrName: r.dsr_name || '', shopId: r.shop_id || '', shopName: r.shop_name || '', amount: num(r.amount), createdAt: r.created_at, ...shopInfo(r.shop_id) }));
      const damages = (gc || []).map(r => ({
        id: String(r.id), colId: r.col_id, date: String(r.date).slice(0, 10), dsrId: r.dsr_id, dsrName: r.dsr_name || '',
        shopId: r.shop_id || '', shopName: r.shop_name || '', productName: r.product_name || '', units: num(r.units),
        damagedValue: num(r.damaged_value), resolution: r.resolution, refundAmt: num(r.refund_amt),
        exchProductName: r.exch_product_name || '', exchUnits: num(r.exch_units), exchValue: num(r.exch_value),
        createdAt: r.created_at, ...shopInfo(r.shop_id)
      }));
      const byDsr = {};
      const slot = (id, name) => (byDsr[id] = byDsr[id] || { dsrId: id, dsrName: name || '', dueCollected: 0, damageValue: 0, refundPaid: 0, exchangeValue: 0 });
      dues.forEach(r => { slot(r.dsrId, r.dsrName).dueCollected += r.amount; });
      damages.forEach(r => { const x = slot(r.dsrId, r.dsrName); x.damageValue += r.damagedValue; x.refundPaid += r.refundAmt; x.exchangeValue += r.exchValue; });
      return res.json({
        ok: true, from: f, to: t, dues, damages, byDsr: Object.values(byDsr),
        totals: {
          dueCollected: dues.reduce((a, r) => a + r.amount, 0), damageValue: damages.reduce((a, r) => a + r.damagedValue, 0),
          refundPaid: damages.reduce((a, r) => a + r.refundAmt, 0), exchangeValue: damages.reduce((a, r) => a + r.exchValue, 0)
        }
      });
    }

    // ══════════════════════════════════════════════════
    //  v4.8.0 — END-OF-DAY SETTLEMENT (হিসাব / পেমেন্ট)
    //  settle-preview GET  dsrId, date  → everything still to be settled
    //  settle-confirm POST              → applies it ONCE (see below)
    // ══════════════════════════════════════════════════
    if (req.method === 'GET' && action === 'settle-preview') {
      const { dsrId, date } = req.query;
      if (!dsrId) return res.json({ ok: false, error: 'dsrId প্রয়োজন' });
      const d = (date && DATE_RE.test(date)) ? date : bdtToday();
      const c = await _computeSettlement(String(dsrId), d);
      return res.json({ ok: true, ...c });
    }

    if (req.method === 'POST' && action === 'settle-confirm') {
      const r = await _performSettlement(req.body || {}, (req.body && req.body.byName) || '');
      return res.json(r);
    }

    // ══════════════════════════════════════════════════
    //  EXISTING PAYMENT LOGIC (unchanged)
    // ══════════════════════════════════════════════════

    if (req.method === 'GET') {
      const { srId, from, to } = req.query;
      const data = await fetchAll(() => {
        let q = supabase.from('sr_payments').select('*').order('created_at');
        if (srId) q = q.eq('sr_id', srId);
        if (from) q = q.gte('date', from);
        if (to)   q = q.lte('date', to);
        return q;
      });
      return res.json((data || []).map(mapPayment));
    }

    if (req.method === 'POST') {
      const d = req.body;
      const cashAmt   = num(d.cashAmount)    || 0;
      const commAmt   = num(d.commissionAmt) || 0;
      const discAmt   = num(d.discountAmt)   || 0;
      const dmgAmt    = num(d.damageAmt)     || 0;
      const total = cashAmt + commAmt + discAmt + dmgAmt || num(d.amount);
      const { error } = await supabase.from('sr_payments').insert({
        sr_id:          d.srId    || '',
        sr_name:        d.srName  || '',
        date:           d.date,
        amount:         total,
        cash_amount:    cashAmt,
        commission_amt: commAmt,
        discount_amt:   discAmt,
        damage_amt:     dmgAmt,
        note:           d.note    || '',
        created_at:     now_()
      });
      if (error) throw error;
      return res.json({ ok: true });
    }

    res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (e) {
    res.json({ ok: false, error: safeErr(e) });
  }
};

// ── Map approval row to frontend shape ──────────────────────────────
function mapApproval(r) {
  return {
    id:          String(r.id || ''),
    managerId:   String(r.manager_id   || ''),
    managerName: r.manager_name || '',
    inputType:   r.input_type   || '',
    inputData:   r.input_data   || {},
    submittedAt: r.submitted_at || '',
    status:      r.status       || 'pending',
    approvedAt:  r.approved_at  || '',
    approvedBy:  r.approved_by  || ''
  };
}

// ── Move one approved row into its real table(s) ───────────────────
async function _doApprove(row) {
  const d  = row.input_data || {};
  const ts = new Date().toISOString();

  if (row.input_type === 'transaction') {
    // "give" now flows through the van-load safety net (same as SO
    // orders and Owner's give_direct) instead of writing stock out the
    // moment Owner approves it — the DSR still has to tick every item
    // and press "Finish Loading" before the real transaction rows (and
    // the stock deduction) actually get written.
    if (d.type === 'give') {
      const items = d.items || [];
      const requestedAmount = items.reduce((s, item) => s + num(item.totalUnits) * num(item.sellingPrice), 0);
      const label = 'দেওয়া (ম্যানেজার' + (d.srName ? ' → ' + d.srName : '') + ')';
      const { error: ordErr } = await supabase.from('orders').insert({
        id: randomUUID(), so_id: '', so_name: label,
        items, requested_amount: requestedAmount,
        status: 'approved', assigned_dsr_id: String(d.srId || ''), load_status: 'not_started', load_ticks: {},
        approved_by: 'owner', approved_at: ts, created_at: ts
      });
      if (ordErr) throw ordErr;
      return;
    }

    const txId = randomUUID();
    const rows = (d.items || []).map(item => {
      const u  = num(item.totalUnits);
      const pp = num(item.purchasePrice);
      const sp = num(item.sellingPrice);
      return {
        tx_id:          txId,
        type:           d.type,
        sr_id:          d.srId   || '',
        sr_name:        d.srName || '',
        date:           d.date,
        slip_no:        d.slipNo || '',
        product_id:     String(item.productId   || ''),
        product_name:   String(item.productName || ''),
        sku:            String(item.sku         || ''),
        cases:          num(item.cases),
        pcs:            num(item.pcs),
        total_units:    u,
        purchase_price: pp,
        selling_price:  sp,
        total_cost:     u * pp,
        total_revenue:  u * sp,
        note:           d.note || '',
        created_at:     ts
      };
    });
    const { error: txErr } = await supabase.from('transactions').insert(rows);
    if (txErr) throw txErr;

    if (d.type === 'damage') {
      const dmgRows = (d.items || []).map(item => {
        const u  = num(item.totalUnits);
        const pp = num(item.purchasePrice);
        return {
          tx_id:          txId,
          product_id:     String(item.productId   || ''),
          product_name:   String(item.productName || ''),
          sku:            String(item.sku         || ''),
          total_units:    u,
          purchase_price: pp,
          total_cost:     u * pp,
          date:           d.date,
          sr_id:          d.srId   || '',
          sr_name:        d.srName || '',
          status:         'pending',
          cleared_date:   null,
          created_at:     ts
        };
      });
      const { error: dmgErr } = await supabase.from('dmg_claims').insert(dmgRows);
      if (dmgErr) throw dmgErr;
    }
  }

  if (row.input_type === 'payment') {
    const cashAmt = num(d.cashAmount)    || 0;
    const commAmt = num(d.commissionAmt) || 0;
    const discAmt = num(d.discountAmt)   || 0;
    const dmgAmt  = num(d.damageAmt)     || 0;
    const total   = cashAmt + commAmt + discAmt + dmgAmt || num(d.amount);
    const { error } = await supabase.from('sr_payments').insert({
      sr_id:          d.srId   || '',
      sr_name:        d.srName || '',
      date:           d.date,
      amount:         total,
      cash_amount:    cashAmt,
      commission_amt: commAmt,
      discount_amt:   discAmt,
      damage_amt:     dmgAmt,
      note:           d.note  || '',
      created_at:     ts
    });
    if (error) throw error;
  }

  if (row.input_type === 'settlement') {
    // Manager's end-of-day settlement — recalculated from the database at
    // the moment the Owner approves (never trusts stale numbers).
    return await _performSettlement(d, 'owner-approval');
  }

  if (row.input_type === 'expense') {
    const entries = d.entries || [];
    if (entries.length) {
      const expRows = entries.map(e => ({
        category_id:   String(e.categoryId   || ''),
        category_name: String(e.categoryName || ''),
        date:          d.date,
        amount:        num(e.amount),
        note:          d.note || '',
        created_at:    ts
      }));
      const { error } = await supabase.from('exp_records').insert(expRows);
      if (error) throw error;
    }
  }
}

// ── v60 — write the `give` rows for an order and mark it loaded ─────
// Claims the order first with a conditional UPDATE so a double-tap or two
// devices can never deduct stock twice; releases the claim if the insert fails.
async function _loadAndDeduct(id, allowedLoadStatuses) {
  const { data: row, error: fetchErr } = await supabase.from('orders').select('*').eq('id', id).single();
  if (fetchErr) throw fetchErr;
  if (!row || row.status !== 'approved') return { ok: false, error: 'অর্ডার পাওয়া যায়নি' };
  if (row.load_status === 'loaded') return { ok: false, error: 'এই লোড ইতিমধ্যে সম্পন্ন হয়ে গেছে' };
  if (!allowedLoadStatuses.includes(row.load_status)) return { ok: false, error: 'এই লোড এখন সম্পন্ন করা যাবে না' };
  const items = (row.items || []).filter(it => num(it.totalUnits) > 0);
  if (!items.length) return { ok: false, error: 'অর্ডারে কোনো পণ্য নেই' };

  const prevStatus = row.load_status;
  const loadedAt = now_();
  const { data: claimed, error: claimErr } = await supabase.from('orders')
    .update({ load_status: 'loaded', loaded_at: loadedAt })
    .eq('id', id).eq('status', 'approved').eq('load_status', prevStatus).select('id');
  if (claimErr) throw claimErr;
  if (!claimed || !claimed.length) return { ok: false, error: 'এই লোড ইতিমধ্যে সম্পন্ন হয়েছে' };

  let dsrName = '';
  try {
    const { data: sr } = await supabase.from('srs').select('name').eq('id', row.assigned_dsr_id).maybeSingle();
    dsrName = (sr && sr.name) || '';
  } catch (_) {}

  const txId = randomUUID();
  const date = bdtToday(); // Asia/Dhaka calendar day
  const rows = items.map(item => {
    const u = num(item.totalUnits), sp = num(item.sellingPrice), pp = num(item.purchasePrice);
    return {
      tx_id: txId, type: 'give', sr_id: row.assigned_dsr_id, sr_name: dsrName,
      date, slip_no: '', product_id: String(item.productId || ''), product_name: String(item.productName || ''),
      sku: String(item.sku || ''), cases: num(item.cases), pcs: num(item.pcs),
      total_units: u, purchase_price: pp, selling_price: sp,
      total_cost: u * pp, total_revenue: u * sp,
      note: 'ভ্যান-লোড অর্ডার #' + String(row.id).slice(0, 8), created_at: loadedAt
    };
  });
  const { error: txErr } = await supabase.from('transactions').insert(rows);
  if (txErr) {
    await supabase.from('orders').update({ load_status: prevStatus, loaded_at: null }).eq('id', id);
    throw txErr;
  }
  return { ok: true, txId };
}

// ══════════════════════════════════════════════════════════════════════
//  v4.8.0 — END-OF-DAY SETTLEMENT ENGINE
//
//  Everything the DSR's day produced is calculated FROM THE DATABASE, so
//  nobody has to type damage / return / commission numbers any more:
//
//    cash expected = cash shops paid at the counter (P)
//                  + old dues he collected today (Q)
//                  − cash he paid shops for damaged goods (M)
//    due reduction = cash received + commission + discount + damage
//                    + value of unsold stock returned to the warehouse
//
//  DELTA-BASED, so pressing twice can never double-count: each confirmed
//  settlement stores what it consumed (dsr_settlements); the next preview
//  only shows what is NOT yet settled for that date. Unsold van stock is
//  read live from the van, so once returned it is simply gone.
//  Whatever cash is short simply stays in the DSR's due (due = given −
//  returned − payments) and can be collected later.
// ══════════════════════════════════════════════════════════════════════
const _r2 = n => Math.round((num(n) + Number.EPSILON) * 100) / 100;

async function _computeSettlement(dsrId, date) {
  const [dayTx, dueRows, dueColsToday, dmgCols, settled, van, dsrRow, allTxForDue, allPay] = await Promise.all([
    fetchAll(() => supabase.from('transactions').select('type,product_id,total_units,total_revenue,commission_amt,discount_amt')
      .eq('sr_id', dsrId).eq('date', date).in('type', ['give', 'return', 'damage', 'dsr_sale'])),
    fetchAll(() => supabase.from('due_calendar').select('id,amount,paid_amount').eq('client_type', 'shop').eq('dsr_id', dsrId).eq('due_date', date)),
    fetchAll(() => supabase.from('due_collections').select('shop_name,amount').eq('dsr_id', dsrId).eq('date', date)),
    fetchAll(() => supabase.from('damage_collections').select('*').eq('dsr_id', dsrId).eq('date', date).order('created_at')),
    fetchAll(() => supabase.from('dsr_settlements').select('*').eq('dsr_id', dsrId).eq('date', date).order('created_at')),
    computeVanStock(dsrId, date, { damage: 'all' }),
    supabase.from('srs').select('name').eq('id', dsrId).maybeSingle(),
    fetchAll(() => supabase.from('transactions').select('type,total_revenue').eq('sr_id', dsrId).in('type', ['give', 'return'])),
    fetchAll(() => supabase.from('sr_payments').select('amount').eq('sr_id', dsrId))
  ]);

  const sum = (t, f) => (dayTx || []).filter(r => r.type === t).reduce((a, r) => a + num(r[f]), 0);
  const givenToday = sum('give', 'total_revenue'), returnedToday = sum('return', 'total_revenue');
  const soldValue = sum('dsr_sale', 'total_revenue');
  const commission = sum('dsr_sale', 'commission_amt'), discount = sum('dsr_sale', 'discount_amt');
  const vanDamageTx = sum('damage', 'total_revenue');

  // P — cash shops handed over AT the sale. paid_amount on a due row also
  // grows when the shop pays later, so subtract every logged later collection.
  let cashAtSale = 0, creditToday = 0;
  if ((dueRows || []).length) {
    const ids = dueRows.map(r => String(r.id));
    const logged = await fetchAll(() => supabase.from('due_collections').select('due_id,amount').in('due_id', ids));
    const lm = {}; (logged || []).forEach(r => { lm[String(r.due_id)] = (lm[String(r.due_id)] || 0) + num(r.amount); });
    dueRows.forEach(r => {
      const initial = Math.max(0, num(r.paid_amount) - (lm[String(r.id)] || 0));
      cashAtSale += initial;
      creditToday += Math.max(0, num(r.amount) - initial);
    });
  }
  const dueCollected = (dueColsToday || []).reduce((a, r) => a + num(r.amount), 0);

  const damageMoney = (dmgCols || []).filter(r => r.resolution === 'money').reduce((a, r) => a + num(r.refund_amt), 0);
  const damageExchange = (dmgCols || []).filter(r => r.resolution === 'exchange').reduce((a, r) => a + Math.min(num(r.exch_value), num(r.damaged_value)), 0);
  const damageTotal = vanDamageTx + damageMoney + damageExchange;

  const done = { comm: 0, disc: 0, dmg: 0, cash: 0 };
  (settled || []).forEach(r => { done.comm += num(r.comm_amt); done.disc += num(r.disc_amt); done.dmg += num(r.dmg_amt); done.cash += num(r.cash_expected); });

  const cashExpectedRaw = _r2(cashAtSale + dueCollected - damageMoney - done.cash);
  const pend = {
    commission: Math.max(0, _r2(commission - done.comm)),
    discount:   Math.max(0, _r2(discount - done.disc)),
    damage:     Math.max(0, _r2(damageTotal - done.dmg))
  };

  // Unsold stock still on the van → goes back to the warehouse.
  const pids = Object.keys(van).filter(k => num(van[k]) > 0);
  const returnItems = [];
  if (pids.length) {
    const { data: prods, error: pErr } = await supabase.from('products').select('id,name,sku,case_size,selling_price,purchase_price').in('id', pids);
    if (pErr) throw pErr;
    const gives = {}; // price the DSR was actually charged today
    (await fetchAll(() => supabase.from('transactions').select('product_id,total_units,total_revenue,selling_price').eq('sr_id', dsrId).eq('date', date).eq('type', 'give')))
      .forEach(r => { const k = String(r.product_id); gives[k] = gives[k] || { u: 0, v: 0 }; gives[k].u += num(r.total_units); gives[k].v += num(r.total_revenue); });
    (prods || []).forEach(p => {
      const units = num(van[String(p.id)]);
      const g = gives[String(p.id)];
      const sp = g && g.u > 0 ? g.v / g.u : num(p.selling_price);
      const cs = num(p.case_size) || 1;
      returnItems.push({
        productId: String(p.id), productName: p.name || '', sku: p.sku || '', totalUnits: units,
        cases: Math.floor(units / cs), pcs: +(units - Math.floor(units / cs) * cs).toFixed(4),
        sellingPrice: sp, purchasePrice: num(p.purchase_price), value: _r2(units * sp)
      });
    });
  }
  const returnValue = _r2(returnItems.reduce((a, i) => a + i.value, 0));

  const lifetimeDue = _r2(
    (allTxForDue || []).filter(r => r.type === 'give').reduce((a, r) => a + num(r.total_revenue), 0)
    - (allTxForDue || []).filter(r => r.type === 'return').reduce((a, r) => a + num(r.total_revenue), 0)
    - (allPay || []).reduce((a, r) => a + num(r.amount), 0)
  );

  const pendingCash = Math.max(0, cashExpectedRaw);
  const hasPending = returnItems.length > 0 || pend.commission > 0 || pend.discount > 0 || pend.damage > 0 || Math.abs(cashExpectedRaw) > 0.005;
  return {
    dsrId, dsrName: (dsrRow && dsrRow.data && dsrRow.data.name) || '', date,
    summary: { givenToday: _r2(givenToday), returnedToday: _r2(returnedToday), soldValue: _r2(soldValue), cashAtSale: _r2(cashAtSale), creditToday: _r2(creditToday) },
    dueCollected: _r2(dueCollected),
    dueCollections: (dueColsToday || []).map(r => ({ shopName: r.shop_name || '', amount: num(r.amount) })),
    damage: {
      total: _r2(damageTotal), vanDamage: _r2(vanDamageTx), moneyRefunded: _r2(damageMoney), exchanged: _r2(damageExchange),
      lines: (dmgCols || []).map(r => ({
        shopName: r.shop_name || '', productName: r.product_name || '', units: num(r.units), damagedValue: num(r.damaged_value),
        resolution: r.resolution, refundAmt: num(r.refund_amt), exchProductName: r.exch_product_name || '', exchUnits: num(r.exch_units), exchValue: num(r.exch_value)
      }))
    },
    returnItems, returnValue,
    pending: { commission: pend.commission, discount: pend.discount, damage: pend.damage, cashExpected: pendingCash, cashExpectedRaw },
    ownPocketShortfall: cashExpectedRaw < -0.005 ? _r2(-cashExpectedRaw) : 0,
    alreadySettledTimes: (settled || []).length,
    alreadySettledCash: _r2(done.cash),
    hasPending, lifetimeDue
  };
}

async function _performSettlement(d, byName) {
  const dsrId = String(d.dsrId || '');
  const token = String(d.token || '').trim();
  const date = (d.date && DATE_RE.test(d.date)) ? d.date : bdtToday();
  if (!dsrId) return { ok: false, error: 'DSR বাছাই করুন' };
  if (token.length < 8) return { ok: false, error: 'অনুরোধ যাচাই করা যায়নি — পেজ রিফ্রেশ করে আবার হিসাব দেখুন' };

  // Fast duplicate guard (double tap / retry) before any calculation.
  const dupe = await supabase.from('dsr_settlements').select('id').eq('token', token).maybeSingle();
  if (dupe.data) return { ok: false, duplicate: true, error: 'এই হিসাব আগেই সংরক্ষিত হয়েছে — দ্বিতীয়বার চাপলে হিসাব দ্বিগুণ হয় না।' };

  const c = await _computeSettlement(dsrId, date);
  const ap = d.apply || {};
  const doReturn = ap.return !== false && c.returnItems.length > 0;
  const comm = ap.commission !== false ? c.pending.commission : 0;
  const disc = ap.discount   !== false ? c.pending.discount   : 0;
  const dmg  = ap.damage     !== false ? c.pending.damage     : 0;
  const cashRecv = Math.max(0, _r2(d.cashReceived === undefined || d.cashReceived === '' ? c.pending.cashExpected : d.cashReceived));

  if (!c.hasPending) return { ok: false, duplicate: true, error: 'নতুন কোনো হিসাব বাকি নেই — আগের হিসাব ইতিমধ্যে সংরক্ষিত আছে।' };
  if (!doReturn && comm + disc + dmg + cashRecv <= 0 && Math.abs(c.pending.cashExpectedRaw) <= 0.005)
    return { ok: false, error: 'কিছুই বাছাই করা হয়নি' };

  const returnAmt = doReturn ? c.returnValue : 0;
  const payTotal = _r2(cashRecv + comm + disc + dmg);
  const ts = now_();

  // 1) Claim — UNIQUE(token) makes a concurrent second press fail right here.
  const { error: claimErr } = await supabase.from('dsr_settlements').insert({
    token, dsr_id: dsrId, dsr_name: c.dsrName || d.dsrName || '', date,
    comm_amt: comm, disc_amt: disc, dmg_amt: dmg, return_amt: returnAmt,
    cash_expected: c.pending.cashExpectedRaw, cash_received: cashRecv,
    note: String(d.note || '').slice(0, 200), created_by: byName || '', created_at: ts
  });
  if (claimErr) {
    if (String(claimErr.code) === '23505' || /duplicate|unique/i.test(String(claimErr.message)))
      return { ok: false, duplicate: true, error: 'এই হিসাব আগেই সংরক্ষিত হয়েছে — দ্বিতীয়বার চাপলে হিসাব দ্বিগুণ হয় না।' };
    throw claimErr;
  }
  const release = async () => { try { await supabase.from('dsr_settlements').delete().eq('token', token); } catch (_) {} };

  // 2) Payment (cash + commission + discount + damage).
  let payId = null;
  try {
    if (payTotal > 0) {
      payId = randomUUID();
      const { error: payErr } = await supabase.from('sr_payments').insert({
        id: payId, sr_id: dsrId, sr_name: c.dsrName || '', date, amount: payTotal,
        cash_amount: cashRecv, commission_amt: comm, discount_amt: disc, damage_amt: dmg,
        note: ('দিনশেষ হিসাব' + (d.note ? ' — ' + String(d.note).slice(0, 100) : '')), created_at: ts
      });
      if (payErr) throw payErr;
    }
    // 3) Unsold van stock → 'return' rows (same as the ফেরত entry; DB
    //    trigger puts the stock back in the warehouse, due drops by value).
    if (doReturn) {
      const txId = randomUUID();
      const rows = c.returnItems.map(i => ({
        tx_id: txId, type: 'return', sr_id: dsrId, sr_name: c.dsrName || '', date, slip_no: '',
        product_id: i.productId, product_name: i.productName, sku: i.sku,
        cases: i.cases, pcs: i.pcs, total_units: i.totalUnits,
        purchase_price: i.purchasePrice, selling_price: i.sellingPrice,
        total_cost: i.totalUnits * i.purchasePrice, total_revenue: i.totalUnits * i.sellingPrice,
        note: 'দিনশেষ হিসাব — অবিক্রিত মাল ফেরত', created_at: ts
      }));
      const { error: retErr } = await supabase.from('transactions').insert(rows);
      if (retErr) throw retErr;
    }
  } catch (e) {
    if (payId) { try { await supabase.from('sr_payments').delete().eq('id', payId); } catch (_) {} }
    await release();
    throw e;
  }

  const c2 = await _computeSettlement(dsrId, date);
  return {
    ok: true,
    applied: { cash: cashRecv, commission: comm, discount: disc, damage: dmg, returnValue: returnAmt, returnLines: doReturn ? c.returnItems.length : 0, paymentTotal: payTotal },
    cashShort: Math.max(0, _r2(c.pending.cashExpected - cashRecv)),
    lifetimeDue: c2.lifetimeDue
  };
}
