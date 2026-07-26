const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function safeErr(e) {
  console.error(e);
  return (e && e.message) ? e.message : 'সার্ভার সমস্যা, আবার চেষ্টা করুন';
}

// ── Pagination-safe full-table fetch — [REUSE] AXIION's db.js verbatim ─────
// PostgREST silently caps any query at 1000 rows. Every "all rows of X"
// lifetime aggregate (stock value, dead-stock scan, yearly totals) MUST
// go through this, never a bare `.select()`.
const FETCH_ALL_PAGE_SIZE = 1000;
async function fetchAll(queryFactory) {
  let from = 0;
  let all = [];
  while (true) {
    const { data, error } = await queryFactory().range(from, from + FETCH_ALL_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data || [];
    all = all.concat(rows);
    if (rows.length < FETCH_ALL_PAGE_SIZE) break;
    from += FETCH_ALL_PAGE_SIZE;
  }
  return all;
}

function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function str(v, max = 255) { return String(v == null ? '' : v).trim().slice(0, max); }
function today() { return bdtToday(); }

// ── Asia/Dhaka date helpers — [REUSE] AXIION's db.js verbatim ───────────────
function bdtDateStr(d) {
  d = d || new Date();
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function bdtToday() { return bdtDateStr(new Date()); }
function addDaysStr(dateStr, delta) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
function bdtYesterday() { return addDaysStr(bdtToday(), -1); }
function daysBetween(dateStr, otherStr) {
  const a = new Date(dateStr + 'T00:00:00Z');
  const b = new Date(otherStr + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

// ── PIN validation — 4 to 6 digits (spec allows owner-chosen PIN length) ───
const PIN_RE = /^\d{4,6}$/;
function validPin(p) { return typeof p === 'string' && PIN_RE.test(String(p).trim()); }

// ── Session tokens (§2.2 persistent login) ──────────────────────────────────
// A long-lived, server-validated session row — not just a client flag, so
// it can be invalidated remotely (logout, PIN reset by platform admin,
// staff deactivation). Token itself is a random opaque string.
function genToken() { return crypto.randomBytes(32).toString('hex'); }

async function createSession(tenantId, staffId) {
  const token = genToken();
  const { error } = await supabase.from('sessions').insert({
    token, tenant_id: tenantId, staff_id: staffId
  });
  if (error) throw error;
  return token;
}

// Resolves an Authorization: Bearer <token> header (or ?token= query param
// as a fallback for simple GETs) into { tenantId, staffId, role, staffName }.
// Returns null if the token is missing/invalid/expired — callers must
// treat null as "unauthenticated" and respond 401.
async function resolveSession(req) {
  let token = null;
  const authHeader = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.slice(7).trim();
  if (!token && req.query && req.query.token) token = String(req.query.token);
  if (!token && req.body && req.body.token) token = String(req.body.token);
  if (!token) return null;

  const { data: sess } = await supabase.from('sessions').select('*').eq('token', token).maybeSingle();
  if (!sess) return null;

  const { data: st } = await supabase.from('staff').select('*').eq('id', sess.staff_id).maybeSingle();
  if (!st || !st.active) return null;

  const { data: tenant } = await supabase.from('tenants').select('*').eq('id', sess.tenant_id).maybeSingle();
  if (!tenant || tenant.status !== 'active') return null;

  // touch last_seen (best-effort, don't block the request on it)
  supabase.from('sessions').update({ last_seen: new Date().toISOString() }).eq('token', token).then(() => {});

  return { token, tenantId: tenant.id, tenant, staffId: st.id, staff: st, role: st.role };
}

// Convenience wrapper: resolves the session and immediately 401s if absent.
// Returns the session object on success, or null after already writing the
// 401 response (so callers can `if (!ses) return;`).
async function requireSession(req, res) {
  const ses = await resolveSession(req);
  if (!ses) {
    res.status(401).json({ ok: false, error: 'লগইন প্রয়োজন', code: 'AUTH_REQUIRED' });
    return null;
  }
  return ses;
}

// Simple role-gate helper for write actions restricted per §16 permissions.
function roleAllowed(role, allowedRoles) {
  return allowedRoles.includes(role);
}

module.exports = {
  supabase, cors, safeErr, fetchAll, num, str, today,
  bdtDateStr, bdtToday, addDaysStr, bdtYesterday, daysBetween,
  validPin, genToken, createSession, resolveSession, requireSession, roleAllowed
};
