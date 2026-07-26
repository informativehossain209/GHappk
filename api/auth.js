const crypto = require('crypto');
const {
  supabase, cors, safeErr, validPin, str, num,
  createSession, resolveSession, requireSession, roleAllowed
} = require('./_lib/db');

// ── Password hashing for platform_admins (§2.1 — the one strong login) ────
// scrypt, no extra dependency needed (built into Node's crypto module).
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(check));
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query && req.query.action) || (req.body && req.body.action) || '';

  try {
    // ══════════════════════════════════════════════════════════════════
    // §2.1 PLATFORM ADMIN — separate login, never linked from shop app
    // ══════════════════════════════════════════════════════════════════

    if (action === 'platform-login' && req.method === 'POST') {
      const { username, password } = req.body || {};
      const uname = str(username);

      // Brute-force lockout — 5 wrong attempts locks that username out for
      // 15 minutes. Tracked server-side in `platform_login_attempts` so it
      // survives across serverless cold starts (an in-memory counter would
      // reset on every new function instance and be useless).
      const LOCK_AFTER = 5, LOCK_MINUTES = 15;
      const { data: attempt } = await supabase.from('platform_login_attempts')
        .select('*').eq('username', uname).maybeSingle();
      if (attempt && attempt.locked_until && new Date(attempt.locked_until) > new Date()) {
        return res.json({ ok: false, error: 'অনেকবার ভুল হয়েছে — কিছুক্ষণ পর আবার চেষ্টা করুন' });
      }

      const { data: admin } = await supabase.from('platform_admins')
        .select('*').eq('username', uname).maybeSingle();
      const valid = admin && verifyPassword(password, admin.password_hash);

      if (!valid) {
        const fails = (attempt && attempt.fail_count || 0) + 1;
        const lockedUntil = fails >= LOCK_AFTER
          ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
        await supabase.from('platform_login_attempts').upsert({
          username: uname, fail_count: fails, locked_until: lockedUntil,
          updated_at: new Date().toISOString()
        }, { onConflict: 'username' });
        return res.json({ ok: false, error: 'ভুল ইউজারনেম বা পাসওয়ার্ড' });
      }

      // Reset the counter on a successful login.
      if (attempt) await supabase.from('platform_login_attempts').delete().eq('username', uname);

      // Platform admin doesn't use the tenant-scoped `sessions` table (that
      // table's FKs assume a real tenant/staff pair). Instead it gets a
      // simple identifier token; every platform-* action below re-verifies
      // it against a live `platform_admins` row before trusting it.
      const adminToken = Buffer.from(`${admin.id}:${admin.username}:${crypto.randomBytes(8).toString('hex')}`).toString('base64');
      return res.json({ ok: true, adminId: admin.id, name: admin.name, adminToken });
    }

    // Every platform-* action below re-validates the adminToken against a
    // live row — a base64 token isn't a secret by itself, so treat it only
    // as an identifier and always re-check the admin still exists.
    async function requirePlatformAdmin(req) {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : (req.body && req.body.adminToken) || (req.query && req.query.adminToken) || '';
      let adminId;
      try { adminId = Buffer.from(String(token), 'base64').toString('utf8').split(':')[0]; } catch (e) { return null; }
      const { data } = await supabase.from('platform_admins').select('id,name,username').eq('id', adminId).maybeSingle();
      return data || null;
    }

    if (action === 'platform-pending-tenants' && req.method === 'GET') {
      const admin = await requirePlatformAdmin(req);
      if (!admin) return res.status(401).json({ ok: false, error: 'Unauthorized' });
      const { data } = await supabase.from('tenants').select('*').eq('status', 'pending').order('created_at');
      return res.json({ ok: true, tenants: data || [] });
    }

    if (action === 'platform-all-tenants' && req.method === 'GET') {
      const admin = await requirePlatformAdmin(req);
      if (!admin) return res.status(401).json({ ok: false, error: 'Unauthorized' });
      const { data: tenants } = await supabase.from('tenants').select('*').order('created_at', { ascending: false });
      const out = [];
      for (const t of (tenants || [])) {
        const { count: staffCount } = await supabase.from('staff').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id);
        const { count: productCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id);
        out.push({ ...t, staff_count: staffCount || 0, product_count: productCount || 0 });
      }
      return res.json({ ok: true, tenants: out });
    }

    if (action === 'platform-approve' && req.method === 'POST') {
      const admin = await requirePlatformAdmin(req);
      if (!admin) return res.status(401).json({ ok: false, error: 'Unauthorized' });
      const { tenantId, decision } = req.body || {}; // decision: 'active' | 'rejected'
      if (!['active', 'rejected'].includes(decision)) return res.json({ ok: false, error: 'অজানা decision' });
      const { error } = await supabase.from('tenants').update({
        status: decision, approved_at: new Date().toISOString(), approved_by: admin.id
      }).eq('id', tenantId);
      if (error) throw error;
      return res.json({ ok: true });
    }

    if (action === 'platform-suspend' && req.method === 'POST') {
      const admin = await requirePlatformAdmin(req);
      if (!admin) return res.status(401).json({ ok: false, error: 'Unauthorized' });
      const { tenantId, suspend } = req.body || {};
      const { error } = await supabase.from('tenants')
        .update({ status: suspend ? 'suspended' : 'active' }).eq('id', tenantId);
      if (error) throw error;
      return res.json({ ok: true });
    }

    if (action === 'platform-reset-pin' && req.method === 'POST') {
      const admin = await requirePlatformAdmin(req);
      if (!admin) return res.status(401).json({ ok: false, error: 'Unauthorized' });
      const { staffId, newPin } = req.body || {};
      if (!validPin(String(newPin || ''))) return res.json({ ok: false, error: 'PIN ৪-৬ সংখ্যার হতে হবে' });
      const { data: st } = await supabase.from('staff').select('tenant_id').eq('id', staffId).maybeSingle();
      if (!st) return res.json({ ok: false, error: 'স্টাফ পাওয়া যায়নি' });
      const { data: clash } = await supabase.from('staff').select('id').eq('tenant_id', st.tenant_id).eq('pin', newPin).limit(1);
      if (clash && clash.length) return res.json({ ok: false, error: 'এই PIN ইতিমধ্যে ব্যবহৃত হচ্ছে' });
      const { error } = await supabase.from('staff').update({ pin: String(newPin) }).eq('id', staffId);
      if (error) throw error;
      return res.json({ ok: true });
    }

    if (action === 'platform-stats' && req.method === 'GET') {
      const admin = await requirePlatformAdmin(req);
      if (!admin) return res.status(401).json({ ok: false, error: 'Unauthorized' });
      const { count: totalShops } = await supabase.from('tenants').select('*', { count: 'exact', head: true });
      const { count: activeShops } = await supabase.from('tenants').select('*', { count: 'exact', head: true }).eq('status', 'active');
      const { count: pendingShops } = await supabase.from('tenants').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      const { data: storageRows } = await supabase.from('tenants').select('storage_used_bytes');
      const totalStorage = (storageRows || []).reduce((s, r) => s + num(r.storage_used_bytes), 0);
      return res.json({
        ok: true,
        totalShops: totalShops || 0,
        activeShops: activeShops || 0,
        pendingShops: pendingShops || 0,
        totalStorageBytes: totalStorage,
        storageCapBytes: 1024 * 1024 * 1024,
        nearLimit: totalStorage > 0.85 * 1024 * 1024 * 1024
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // §2.2 / §2.3 SHOP REGISTRATION — owner registers, goes to `pending`
    // ══════════════════════════════════════════════════════════════════

    if (action === 'register' && req.method === 'POST') {
      const { shopName, ownerName, mobile, category, pin } = req.body || {};
      if (!str(shopName) || !str(ownerName) || !str(mobile) || !str(category))
        return res.json({ ok: false, error: 'সব তথ্য পূরণ করুন' });
      if (!validPin(String(pin || ''))) return res.json({ ok: false, error: 'PIN ৪-৬ সংখ্যার হতে হবে' });

      const { data: existing } = await supabase.from('tenants').select('id').eq('mobile', str(mobile)).maybeSingle();
      if (existing) return res.json({ ok: false, error: 'এই মোবাইল নম্বরে ইতিমধ্যে একটি দোকান নিবন্ধিত আছে' });

      const { data: tenant, error: tErr } = await supabase.from('tenants').insert({
        shop_name: str(shopName), owner_name: str(ownerName), mobile: str(mobile),
        category: str(category), status: 'pending'
      }).select().single();
      if (tErr) throw tErr;

      const { error: sErr } = await supabase.from('staff').insert({
        tenant_id: tenant.id, name: str(ownerName), role: 'owner', pin: String(pin)
      });
      if (sErr) throw sErr;

      return res.json({
        ok: true,
        message: 'নিবন্ধন সম্পন্ন হয়েছে। অনুমোদনের অপেক্ষায় আছে — অনুমোদনের পর আপনি লগইন করতে পারবেন।',
        tenantId: tenant.id
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // §2.2 SHOP LOGIN — Shop ID or Mobile + PIN → which staff row loaded
    // determines role/permissions. [ADAPT] AXIION's single-password
    // lookup, now scoped to (tenant_id, pin).
    // ══════════════════════════════════════════════════════════════════

    if (action === 'login' && req.method === 'POST') {
      const { shopIdOrMobile, pin } = req.body || {};
      if (!str(shopIdOrMobile) || !validPin(String(pin || '')))
        return res.json({ ok: false, error: 'তথ্য সঠিকভাবে দিন' });

      const identifier = str(shopIdOrMobile);
      const { data: tenant } = await supabase.from('tenants')
        .select('*')
        .or(`mobile.eq.${identifier},id.eq.${/^[0-9a-f-]{36}$/i.test(identifier) ? identifier : '00000000-0000-0000-0000-000000000000'}`)
        .maybeSingle();

      if (!tenant) return res.json({ ok: false, error: 'দোকান পাওয়া যায়নি' });
      if (tenant.status === 'pending') return res.json({ ok: false, error: 'আপনার দোকান এখনো অনুমোদনের অপেক্ষায় আছে' });
      if (tenant.status === 'suspended') return res.json({ ok: false, error: 'আপনার দোকান সাসপেন্ড করা হয়েছে। সাপোর্টে যোগাযোগ করুন।' });
      if (tenant.status === 'rejected') return res.json({ ok: false, error: 'এই আবেদন বাতিল হয়েছে' });

      const { data: st } = await supabase.from('staff')
        .select('*').eq('tenant_id', tenant.id).eq('pin', String(pin).trim()).maybeSingle();
      if (!st || !st.active) return res.json({ ok: false, error: 'ভুল PIN' });

      const token = await createSession(tenant.id, st.id);
      return res.json({
        ok: true, token,
        tenant: { id: tenant.id, shopName: tenant.shop_name, category: tenant.category, uiMode: tenant.ui_mode, vatPercent: tenant.vat_percent, receiptWidthMm: tenant.receipt_width_mm },
        staff: { id: st.id, name: st.name, role: st.role, thumb: st.thumb, uiMode: st.ui_mode }
      });
    }

    if (action === 'logout' && req.method === 'POST') {
      const { token } = req.body || {};
      if (token) await supabase.from('sessions').delete().eq('token', token);
      return res.json({ ok: true });
    }

    // GET ?action=me — resolves current session, used on app boot to
    // restore the persistent login (§2.2) without re-asking for the PIN.
    if (action === 'me' && req.method === 'GET') {
      const ses = await require('./_lib/db').resolveSession(req);
      if (!ses) return res.json({ ok: false });
      return res.json({
        ok: true,
        tenant: { id: ses.tenant.id, shopName: ses.tenant.shop_name, category: ses.tenant.category, uiMode: ses.tenant.ui_mode, vatPercent: ses.tenant.vat_percent, receiptWidthMm: ses.tenant.receipt_width_mm },
        staff: { id: ses.staff.id, name: ses.staff.name, role: ses.staff.role, thumb: ses.staff.thumb, uiMode: ses.staff.ui_mode }
      });
    }

    // Note: day-to-day staff roster CRUD (add/list/update/reset-pin) lives
    // in api/staff.js per the 10-file plan (§Open Q2) — this file keeps
    // only login/registration/session/platform-admin concerns.

    if (action === 'set-ui-mode' && req.method === 'PUT') {
      const ses = await requireSession(req, res); if (!ses) return;
      const { mode, scope } = req.body || {}; // scope: 'staff' (default) or 'tenant' (owner default for whole shop)
      if (!['light', 'dark'].includes(mode)) return res.json({ ok: false, error: 'অজানা mode' });
      if (scope === 'tenant' && roleAllowed(ses.role, ['owner'])) {
        await supabase.from('tenants').update({ ui_mode: mode }).eq('id', ses.tenantId);
      } else {
        await supabase.from('staff').update({ ui_mode: mode }).eq('id', ses.staffId);
      }
      return res.json({ ok: true });
    }

    res.status(400).json({ ok: false, error: 'অজানা action: ' + action });
  } catch (e) {
    res.json({ ok: false, error: safeErr(e) });
  }
};
