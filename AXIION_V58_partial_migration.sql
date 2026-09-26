-- ════════════════════════════════════════════════════════════════
--  AXIION V58 — partial migration for an ALREADY-RUNNING app
-- ════════════════════════════════════════════════════════════════
--  Feature: Rebrand — the app itself is now "AXIION DMS" everywhere
--  in the UI/chrome, but printed documents (challans, reports, POS
--  slips, due notices) need to show the OWNER'S OWN business name,
--  not the software's name. That business name used to be hardcoded
--  as "Miron Electronics" directly in public/index.html.
--
--  This migration adds ONE new single-row settings table so that
--  name is a value the owner can set/change from inside the app,
--  instead of a hardcoded string baked into the frontend.
--
--  ✅ RUN THIS — it is a real, additive schema change.
--  Safe on a live database: it only adds a new table, and seeds it
--  with the old hardcoded name so nothing on a printed document
--  changes until the owner deliberately updates it from Settings.
--
--  This update also touches (no other schema changes needed):
--    • api/settings.js    (new — GET current name / POST update, same
--                           Owner-PIN-gated pattern as office-location)
--    • api/dashboard.js   (action=load-all now also returns shopName)
--    • public/index.html  (app chrome renamed to "AXIION DMS"; every
--                           printed document now reads S.shopName
--                           instead of the literal "Miron Electronics";
--                           new "দোকান/প্রতিষ্ঠানের নাম" card next to
--                           the existing Office Location card)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app_settings (
  id         INTEGER     PRIMARY KEY DEFAULT 1,
  shop_name  TEXT        NOT NULL DEFAULT 'Miron Electronics',
  set_by     TEXT        DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT app_settings_single_row CHECK (id = 1)
);

INSERT INTO app_settings (id, shop_name)
VALUES (1, 'Miron Electronics')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_app_settings"       ON app_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_app_settings" ON app_settings FOR ALL TO anon          USING (false);
