// settings.js — AXIION V58 rebrand support.
//
// Holds app-wide settings that must be editable from inside the app
// without a redeploy. Today that's exactly one value: the owner's own
// business name, printed on every document (challan, report, POS slip,
// due notice) — distinct from "AXIION DMS", which is the software's own
// fixed brand name in the UI chrome and never stored here.
//
// GET  (no auth) — every screen that prints a document needs this name,
//                  including screens a DSR/SO can reach, so this mirrors
//                  the read-only office-location pattern: safe to expose
//                  because it's just a display string, never a secret.
// POST action=update — gated the same way office-set is in
//                  api/attendance.js: the frontend's confirmOwnerPin()
//                  prompt already re-verifies the PIN against /api/auth
//                  before this endpoint is ever called, so this endpoint
//                  itself doesn't re-check a PIN, consistent with every
//                  other owner-only settings write in this codebase.
const { supabase, cors, str, now_, safeErr } = require('./_lib/db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return res.json({ ok: true, shopName: (data && data.shop_name) || '' });
    }

    if (req.method === 'POST') {
      const d = req.body || {};
      const action = req.query.action || d.action;

      if (action === 'update') {
        const shopName = str(d.shopName, 120);
        if (!shopName) return res.json({ ok: false, error: 'দোকান/প্রতিষ্ঠানের নাম দিন' });

        const { error } = await supabase.from('app_settings').upsert({
          id: 1, shop_name: shopName, set_by: str(d.setBy, 60), updated_at: now_()
        });
        if (error) throw error;
        return res.json({ ok: true, shopName });
      }

      return res.json({ ok: false, error: 'অজানা action' });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: safeErr(e) });
  }
};
