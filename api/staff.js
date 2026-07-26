const { supabase, cors, safeErr, fetchAll, num, str, today, validPin, requireSession, roleAllowed, distMeters } = require('./_lib/db');

// Collision-free random N-digit PIN generator, scoped within a tenant.
async function genUniquePin(tenantId, length = 5) {
  for (let i = 0; i < 50; i++) {
    const min = Math.pow(10, length - 1);
    const candidate = String(min + Math.floor(Math.random() * (min * 9)));
    const { data } = await supabase.from('staff').select('id').eq('tenant_id', tenantId).eq('pin', candidate).limit(1);
    if (!data || !data.length) return candidate;
  }
  throw new Error('PIN তৈরি করা সম্ভব হয়নি, আবার চেষ্টা করুন');
}

const VALID_ROLES = ['owner', 'manager', 'cashier', 'salesperson', 'inventory_manager', 'accountant'];

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const action = (req.query && req.query.action) || (req.body && req.body.action) || '';

  try {
    const ses = await requireSession(req, res); if (!ses) return;

    // ══════════════════════════════════════════════════════════════════
    // STAFF ROSTER — "স্টাফ যোগ করুন" (§2.2)
    // ══════════════════════════════════════════════════════════════════
    if (action === 'list' && req.method === 'GET') {
      const { data } = await supabase.from('staff').select('id,name,role,pin,thumb,mobile,active,created_at')
        .eq('tenant_id', ses.tenantId).order('created_at');
      return res.json({ ok: true, staff: data || [] });
    }

    if (action === 'add' && req.method === 'POST') {
      // §16 matrix: Staff management = owner only (manager gets everything
      // else but not this) — a deliberate tightening from the earlier draft.
      if (!roleAllowed(ses.role, ['owner']))
        return res.status(403).json({ ok: false, error: 'শুধুমাত্র মালিক স্টাফ যোগ করতে পারবেন' });
      const { name, role, mobile, pin, autoPin } = req.body || {};
      if (!str(name) || !VALID_ROLES.includes(role)) return res.json({ ok: false, error: 'তথ্য সঠিক নয়' });

      let finalPin = String(pin || '');
      if (autoPin || !validPin(finalPin)) finalPin = await genUniquePin(ses.tenantId);
      else {
        const { data: clash } = await supabase.from('staff').select('id').eq('tenant_id', ses.tenantId).eq('pin', finalPin).limit(1);
        if (clash && clash.length) return res.json({ ok: false, error: 'এই PIN ইতিমধ্যে ব্যবহৃত হচ্ছে' });
      }

      const { data, error } = await supabase.from('staff').insert({
        tenant_id: ses.tenantId, name: str(name), role, mobile: str(mobile), pin: finalPin
      }).select().single();
      if (error) throw error;
      return res.json({ ok: true, staff: data, pin: finalPin });
    }

    if (action === 'update' && req.method === 'PUT') {
      if (!roleAllowed(ses.role, ['owner']))
        return res.status(403).json({ ok: false, error: 'শুধুমাত্র মালিক স্টাফের তথ্য পরিবর্তন করতে পারবেন' });
      const { staffId, name, role, mobile, active } = req.body || {};
      const patch = {};
      if (name !== undefined) patch.name = str(name);
      if (role !== undefined) patch.role = role;
      if (mobile !== undefined) patch.mobile = str(mobile);
      if (active !== undefined) patch.active = !!active;
      const { error } = await supabase.from('staff').update(patch).eq('id', staffId).eq('tenant_id', ses.tenantId);
      if (error) throw error;
      if (active === false) await supabase.from('sessions').delete().eq('staff_id', staffId);
      return res.json({ ok: true });
    }

    if (action === 'reset-pin' && req.method === 'PUT') {
      const { staffId, newPin } = req.body || {};
      const isSelf = staffId === ses.staffId;
      if (!isSelf && !roleAllowed(ses.role, ['owner']))
        return res.status(403).json({ ok: false, error: 'শুধুমাত্র মালিক অন্যের PIN রিসেট করতে পারবেন' });
      if (!validPin(String(newPin || ''))) return res.json({ ok: false, error: 'PIN ৪-৬ সংখ্যার হতে হবে' });
      const { data: clash } = await supabase.from('staff').select('id').eq('tenant_id', ses.tenantId).eq('pin', newPin).neq('id', staffId).limit(1);
      if (clash && clash.length) return res.json({ ok: false, error: 'এই PIN ইতিমধ্যে ব্যবহৃত হচ্ছে' });
      const { error } = await supabase.from('staff').update({ pin: String(newPin) }).eq('id', staffId).eq('tenant_id', ses.tenantId);
      if (error) throw error;
      return res.json({ ok: true });
    }

    // ══════════════════════════════════════════════════════════════════
    // ATTENDANCE (§11) — [REUSE] punch in/out concept, simplified vs
    // AXIION's full 26th–25th pay-cycle math: here "month" = calendar
    // month (YYYY-MM). Upgrade path to a custom pay-cycle is a pure
    // application-logic change later, no schema migration needed.
    // ══════════════════════════════════════════════════════════════════
    if (action === 'punch' && req.method === 'POST') {
      const { staffId, type, lat, lng } = req.body || {}; // type: 'in' | 'out'
      const targetStaff = staffId || ses.staffId;
      const now = new Date().toISOString();
      const punchLat = lat != null ? num(lat) : null;
      const punchLng = lng != null ? num(lng) : null;

      // If the owner has set a shop location, every punch must happen
      // within geo_radius_m of it. If no location is set yet, punching
      // works exactly as before (no geofence to check against).
      if (ses.tenant.lat != null && ses.tenant.lng != null) {
        if (punchLat == null || punchLng == null) {
          return res.json({ ok: false, error: 'লোকেশন পাওয়া যায়নি — GPS অন করে আবার চেষ্টা করুন' });
        }
        const d = distMeters(ses.tenant.lat, ses.tenant.lng, punchLat, punchLng);
        const radius = ses.tenant.geo_radius_m || 150;
        if (d > radius) {
          return res.json({ ok: false, error: `আপনি দোকান থেকে ${Math.round(d)} মিটার দূরে আছেন — দোকানের ${radius} মিটারের মধ্যে থেকে পাঞ্চ করুন` });
        }
      }

      const { data: existing } = await supabase.from('attendance').select('*').eq('tenant_id', ses.tenantId).eq('staff_id', targetStaff).eq('date', today()).maybeSingle();
      if (!existing) {
        const { error } = await supabase.from('attendance').insert({
          tenant_id: ses.tenantId, staff_id: targetStaff, date: today(),
          punch_in: type === 'in' ? now : null, punch_out: type === 'out' ? now : null,
          in_lat: type === 'in' ? punchLat : null, in_lng: type === 'in' ? punchLng : null,
          out_lat: type === 'out' ? punchLat : null, out_lng: type === 'out' ? punchLng : null
        });
        if (error) throw error;
      } else {
        const patch = type === 'in' ? { punch_in: now, in_lat: punchLat, in_lng: punchLng } : { punch_out: now, out_lat: punchLat, out_lng: punchLng };
        const { error } = await supabase.from('attendance').update(patch).eq('id', existing.id);
        if (error) throw error;
      }
      return res.json({ ok: true });
    }

    // Owner sets/updates the shop's GPS location — used as the geofence
    // center for every staff punch-in/out from here on. Reading the
    // browser's current position and calling this from the app is the
    // simplest flow; there is no separate map-picker in this build.
    if (action === 'tenant-set-location' && req.method === 'PUT') {
      if (!roleAllowed(ses.role, ['owner']))
        return res.status(403).json({ ok: false, error: 'শুধুমাত্র মালিক দোকানের লোকেশন সেট করতে পারবেন' });
      const { lat, lng, radiusM } = req.body || {};
      if (lat == null || lng == null) return res.json({ ok: false, error: 'লোকেশন পাওয়া যায়নি' });
      const patch = { lat: num(lat), lng: num(lng) };
      if (radiusM != null) patch.geo_radius_m = Math.max(30, Math.min(2000, num(radiusM) || 150));
      const { error } = await supabase.from('tenants').update(patch).eq('id', ses.tenantId);
      if (error) throw error;
      return res.json({ ok: true, ...patch });
    }

    if (action === 'attendance-mark' && req.method === 'POST') {
      // Owner/manager manually marking absent/leave/half_day for someone.
      if (!roleAllowed(ses.role, ['owner', 'manager']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const { staffId, date, status } = req.body || {};
      const { error } = await supabase.from('attendance').upsert({
        tenant_id: ses.tenantId, staff_id: staffId, date: str(date) || today(), status
      }, { onConflict: 'tenant_id,staff_id,date' });
      if (error) throw error;
      return res.json({ ok: true });
    }

    if (action === 'attendance-month' && req.method === 'GET') {
      const staffId = req.query.staffId || ses.staffId;
      const month = str(req.query.month) || today().slice(0, 7); // 'YYYY-MM'
      const { data } = await supabase.from('attendance').select('*').eq('tenant_id', ses.tenantId).eq('staff_id', staffId)
        .gte('date', `${month}-01`).lte('date', `${month}-31`).order('date');
      return res.json({ ok: true, days: data || [] });
    }

    // ══════════════════════════════════════════════════════════════════
    // SALARY (§11) — per-day rate × valid days + on-time bonus
    // ══════════════════════════════════════════════════════════════════
    if (action === 'salary-settings-get' && req.method === 'GET') {
      const staffId = req.query.staffId;
      const isSelf = staffId === ses.staffId;
      if (!isSelf && !roleAllowed(ses.role, ['owner', 'manager', 'accountant']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const { data } = await supabase.from('salary_settings').select('*').eq('tenant_id', ses.tenantId).eq('staff_id', staffId).maybeSingle();
      return res.json({ ok: true, settings: data || null, canEdit: roleAllowed(ses.role, ['owner']) });
    }

    if (action === 'salary-settings-set' && req.method === 'POST') {
      // §16 matrix: Salary/HR — owner edits, manager/accountant view-only.
      if (!roleAllowed(ses.role, ['owner']))
        return res.status(403).json({ ok: false, error: 'শুধুমাত্র মালিক বেতনের হার নির্ধারণ করতে পারবেন' });
      const { staffId, monthlySalary, perDayRate, onTimeBonus } = req.body || {};
      const { error } = await supabase.from('salary_settings').upsert({
        tenant_id: ses.tenantId, staff_id: staffId, monthly_salary: num(monthlySalary),
        per_day_rate: perDayRate != null ? num(perDayRate) : null, on_time_bonus: num(onTimeBonus)
      }, { onConflict: 'tenant_id,staff_id' });
      if (error) throw error;
      return res.json({ ok: true });
    }

    // Computes (not just fetches) a month's salary for one staff member —
    // valid days = days with both punch_in and punch_out OR a present/half_day
    // manual mark; half_day counts as 0.5.
    if (action === 'salary-compute' && req.method === 'GET') {
      const staffId = req.query.staffId;
      const isSelf = staffId === ses.staffId;
      if (!isSelf && !roleAllowed(ses.role, ['owner', 'manager', 'accountant']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const month = str(req.query.month) || today().slice(0, 7);
      const { data: settings } = await supabase.from('salary_settings').select('*').eq('tenant_id', ses.tenantId).eq('staff_id', staffId).maybeSingle();
      if (!settings) return res.json({ ok: false, error: 'বেতনের সেটিংস পাওয়া যায়নি' });

      const perDayRate = settings.per_day_rate != null ? num(settings.per_day_rate) : num(settings.monthly_salary) / 30;
      const { data: days } = await supabase.from('attendance').select('*').eq('tenant_id', ses.tenantId).eq('staff_id', staffId)
        .gte('date', `${month}-01`).lte('date', `${month}-31`);

      let validDays = 0, onTimeDays = 0;
      for (const d of (days || [])) {
        if (d.status === 'absent') continue;
        if (d.status === 'half_day') { validDays += 0.5; continue; }
        if (d.punch_in && d.punch_out) {
          validDays += 1;
          const hour = new Date(d.punch_in).getUTCHours() + 6; // rough Asia/Dhaka offset for on-time check
          if (hour <= 10) onTimeDays += 1;
        } else if (d.status === 'present') validDays += 1;
      }
      const base = perDayRate * validDays;
      const bonus = onTimeDays * num(settings.on_time_bonus);

      const { data: advances } = await supabase.from('advance_requests').select('amount').eq('tenant_id', ses.tenantId).eq('staff_id', staffId).eq('month', month).eq('status', 'approved');
      const advanceTotal = (advances || []).reduce((s, a) => s + num(a.amount), 0);

      return res.json({ ok: true, validDays, onTimeDays, perDayRate, base, bonus, advanceTotal, payable: base + bonus - advanceTotal });
    }

    if (action === 'salary-pay' && req.method === 'POST') {
      if (!roleAllowed(ses.role, ['owner']))
        return res.status(403).json({ ok: false, error: 'শুধুমাত্র মালিক বেতন প্রদান রেকর্ড করতে পারবেন' });
      const { staffId, month, baseAmount, bonusAmount, advanceDeduct, paidAmount } = req.body || {};
      const total = num(baseAmount) + num(bonusAmount) - num(advanceDeduct);
      const status = num(paidAmount) >= total ? 'paid' : (num(paidAmount) > 0 ? 'partial' : 'unpaid');
      const { error } = await supabase.from('salary_ledger').upsert({
        tenant_id: ses.tenantId, staff_id: staffId, month,
        base_amount: num(baseAmount), bonus_amount: num(bonusAmount),
        advance_deduct: num(advanceDeduct), paid_amount: num(paidAmount), status
      }, { onConflict: 'tenant_id,staff_id,month' });
      if (error) throw error;
      return res.json({ ok: true, status });
    }

    if (action === 'salary-ledger' && req.method === 'GET') {
      if (!roleAllowed(ses.role, ['owner', 'manager', 'accountant']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const { data } = await supabase.from('salary_ledger').select('*, staff(name)').eq('tenant_id', ses.tenantId).order('month', { ascending: false });
      return res.json({ ok: true, ledger: data || [] });
    }

    // ── ADVANCES ─────────────────────────────────────────────────────────
    if (action === 'advance-request' && req.method === 'POST') {
      const { amount, reason, month } = req.body || {};
      const { data, error } = await supabase.from('advance_requests').insert({
        tenant_id: ses.tenantId, staff_id: ses.staffId, amount: num(amount), reason: str(reason), month: str(month) || today().slice(0, 7)
      }).select().single();
      if (error) throw error;
      return res.json({ ok: true, request: data });
    }

    if (action === 'advance-decide' && req.method === 'PUT') {
      if (!roleAllowed(ses.role, ['owner', 'manager']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const { id, decision } = req.body || {};
      const { error } = await supabase.from('advance_requests').update({ status: decision }).eq('id', id).eq('tenant_id', ses.tenantId);
      if (error) throw error;
      return res.json({ ok: true });
    }

    if (action === 'advance-list' && req.method === 'GET') {
      const { data } = await supabase.from('advance_requests').select('*, staff(name)').eq('tenant_id', ses.tenantId).order('created_at', { ascending: false });
      return res.json({ ok: true, requests: data || [] });
    }

    res.status(400).json({ ok: false, error: 'অজানা action: ' + action });
  } catch (e) {
    res.json({ ok: false, error: safeErr(e) });
  }
};
