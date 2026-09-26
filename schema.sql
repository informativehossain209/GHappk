-- AXIION DMS — Supabase schema
-- Run this once in the Supabase SQL editor on a fresh project.

DROP TABLE IF EXISTS user_passwords  CASCADE;
DROP TABLE IF EXISTS due_calendar    CASCADE;
DROP TABLE IF EXISTS exp_records     CASCADE;
DROP TABLE IF EXISTS exp_cats        CASCADE;
DROP TABLE IF EXISTS sr_payments     CASCADE;
DROP TABLE IF EXISTS bonus           CASCADE;
DROP TABLE IF EXISTS dmg_claims      CASCADE;
DROP TABLE IF EXISTS transactions    CASCADE;
DROP TABLE IF EXISTS srs             CASCADE;
DROP TABLE IF EXISTS products        CASCADE;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE products (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  sku              TEXT        NOT NULL,
  case_size        INTEGER     DEFAULT 1,
  unit_type        TEXT        DEFAULT 'কেস',
  case_price          NUMERIC(14,4) DEFAULT 0,
  case_purchase_price NUMERIC(14,4) DEFAULT 0,
  purchase_price   NUMERIC(14,4) DEFAULT 0,
  selling_price    NUMERIC(14,4) DEFAULT 0,
  bonus_free_units NUMERIC(14,4) DEFAULT 0,
  bonus_cases_req  NUMERIC(10,2) DEFAULT 1,
  bonus_free_money NUMERIC(14,4) DEFAULT 0,
  low_stock_alert  NUMERIC(10,2) DEFAULT 0,
  thumb            TEXT        DEFAULT '',
  category         TEXT        DEFAULT '',
  sort_order       INTEGER     DEFAULT 0,
  current_stock    NUMERIC(14,4) DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_products_category   ON products(category);
CREATE INDEX idx_products_sort_order ON products(sort_order);

CREATE TABLE srs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  phone          TEXT        DEFAULT '',
  area           TEXT        DEFAULT '',
  role           TEXT        DEFAULT 'dsr' CHECK (role IN ('dsr', 'so', 'driver')),
  thumb          TEXT        DEFAULT '',
  so_id          TEXT        DEFAULT '',
  so_name        TEXT        DEFAULT '',
  display_no     INTEGER,
  road_id        TEXT        DEFAULT '',
  road_name      TEXT        DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_srs_so_id      ON srs(so_id);
CREATE INDEX idx_srs_role       ON srs(role);
CREATE INDEX idx_srs_road_id    ON srs(road_id);
CREATE UNIQUE INDEX idx_srs_role_display_no ON srs(role, display_no);

DROP TABLE IF EXISTS sr_display_seq CASCADE;
CREATE TABLE sr_display_seq (
  role    TEXT    PRIMARY KEY,
  next_no INTEGER NOT NULL DEFAULT 1
);
INSERT INTO sr_display_seq (role, next_no) VALUES ('dsr', 1), ('so', 1);

CREATE OR REPLACE FUNCTION next_sr_display_no(p_role TEXT) RETURNS INTEGER AS $$
DECLARE v INTEGER;
BEGIN
  UPDATE sr_display_seq SET next_no = next_no + 1 WHERE role = p_role RETURNING next_no - 1 INTO v;
  IF v IS NULL THEN
    INSERT INTO sr_display_seq(role, next_no) VALUES (p_role, 2) RETURNING next_no - 1 INTO v;
  END IF;
  RETURN v;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION next_sr_display_no(TEXT) TO service_role;

CREATE TABLE transactions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_id          UUID        NOT NULL,
  type           TEXT        NOT NULL CHECK (type IN ('give','return','damage','buy','point_sale','point_damage_return','dsr_sale')),
  sr_id          TEXT        DEFAULT '',
  sr_name        TEXT        DEFAULT '',
  date           DATE        NOT NULL,
  slip_no        TEXT        DEFAULT '',
  product_id     TEXT        NOT NULL,
  product_name   TEXT        DEFAULT '',
  sku            TEXT        DEFAULT '',
  cases          NUMERIC(10,2) DEFAULT 0,
  pcs            NUMERIC(10,2) DEFAULT 0,
  total_units    NUMERIC(14,4) DEFAULT 0,
  purchase_price NUMERIC(14,4) DEFAULT 0,
  selling_price  NUMERIC(14,4) DEFAULT 0,
  total_cost     NUMERIC(14,4) DEFAULT 0,
  total_revenue  NUMERIC(14,4) DEFAULT 0,
  commission_amt NUMERIC(14,4) DEFAULT 0,
  discount_amt   NUMERIC(14,4) DEFAULT 0,
  shop_id        TEXT        DEFAULT '',
  customer_id    TEXT        DEFAULT '',
  note           TEXT        DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tx_type    ON transactions(type);
CREATE INDEX idx_tx_date    ON transactions(date);
CREATE INDEX idx_tx_sr_id   ON transactions(sr_id);
CREATE INDEX idx_tx_shop_id ON transactions(shop_id);
CREATE INDEX idx_tx_customer_id ON transactions(customer_id);

CREATE TABLE dmg_claims (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_id          TEXT        DEFAULT '',
  product_id     TEXT        NOT NULL,
  product_name   TEXT        DEFAULT '',
  sku            TEXT        DEFAULT '',
  total_units    NUMERIC(12,2) DEFAULT 0,
  purchase_price NUMERIC(12,2) DEFAULT 0,
  total_cost     NUMERIC(14,2) DEFAULT 0,
  date           DATE,
  sr_id          TEXT        DEFAULT '',
  sr_name        TEXT        DEFAULT '',
  status         TEXT        DEFAULT 'pending' CHECK (status IN ('pending','cleared')),
  cleared_date   DATE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_dmg_product ON dmg_claims(product_id);
CREATE INDEX idx_dmg_status  ON dmg_claims(status);
CREATE INDEX idx_dmg_sr_id   ON dmg_claims(sr_id);

CREATE TABLE bonus (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    TEXT        NOT NULL,
  product_name  TEXT        DEFAULT '',
  sku           TEXT        DEFAULT '',
  from_date     DATE,
  to_date       DATE,
  given_units   NUMERIC(12,2) DEFAULT 0,
  bonus_amount  NUMERIC(14,2) DEFAULT 0,
  status        TEXT        DEFAULT 'cleared',
  cleared_date  DATE,
  note          TEXT        DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sr_payments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sr_id          TEXT        NOT NULL,
  sr_name        TEXT        DEFAULT '',
  date           DATE        NOT NULL,
  amount         NUMERIC(14,4) DEFAULT 0,
  cash_amount    NUMERIC(14,4) DEFAULT 0,
  commission_amt NUMERIC(14,4) DEFAULT 0,
  discount_amt   NUMERIC(14,4) DEFAULT 0,
  damage_amt     NUMERIC(14,4) DEFAULT 0,
  note           TEXT        DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_pay_sr   ON sr_payments(sr_id);
CREATE INDEX idx_pay_date ON sr_payments(date);

CREATE TABLE exp_cats (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE exp_records (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   TEXT        NOT NULL,
  category_name TEXT        DEFAULT '',
  date          DATE        NOT NULL,
  amount        NUMERIC(14,2) DEFAULT 0,
  note          TEXT        DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_exp_date ON exp_records(date);

CREATE TABLE due_calendar (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dsr_id       TEXT        DEFAULT '',
  dsr_name     TEXT        DEFAULT '',
  client_type  TEXT        DEFAULT 'dsr',   -- 'dsr' | 'shop'
  shop_id      TEXT        DEFAULT '',      -- set when client_type='shop' (§11/§12)
  shop_name    TEXT        DEFAULT '',
  due_date     DATE        NOT NULL,
  amount       NUMERIC(14,4) DEFAULT 0,
  paid_amount  NUMERIC(14,4) DEFAULT 0,
  note         TEXT        DEFAULT '',
  status       TEXT        DEFAULT 'pending' CHECK (status IN ('pending','partial','cleared')),
  cleared_date DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_due_date    ON due_calendar(due_date);
CREATE INDEX idx_due_status  ON due_calendar(status);
CREATE INDEX idx_due_dsr_id  ON due_calendar(dsr_id);
CREATE INDEX idx_due_shop_id ON due_calendar(shop_id);

CREATE TABLE user_passwords (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key       TEXT        NOT NULL UNIQUE,
  user_name      TEXT        DEFAULT '',
  role           TEXT        NOT NULL CHECK (role IN ('owner','manager','so','dsr','driver')),
  password       TEXT        NOT NULL UNIQUE,
  thumb          TEXT        DEFAULT '',   -- V25: Manager's individual profile photo (Owner-set), same base64-thumb pattern as srs.thumb
  must_change_pw BOOLEAN     NOT NULL DEFAULT false,  -- V44 #18: forces a mandatory password-set screen on next login; only ever true for the freshly-seeded Owner row
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_up_password ON user_passwords(password);

ALTER TABLE products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE srs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE dmg_claims     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sr_payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE exp_cats       ENABLE ROW LEVEL SECURITY;
ALTER TABLE exp_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE due_calendar   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_passwords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "srv_products"       ON products       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_srs"            ON srs            FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_transactions"   ON transactions   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_dmg_claims"     ON dmg_claims     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_bonus"          ON bonus          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_sr_payments"    ON sr_payments    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_exp_cats"       ON exp_cats       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_exp_records"    ON exp_records    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_due_calendar"   ON due_calendar   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_user_passwords" ON user_passwords FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_deny_products"       ON products       FOR ALL TO anon USING (false);
CREATE POLICY "anon_deny_srs"            ON srs            FOR ALL TO anon USING (false);
CREATE POLICY "anon_deny_transactions"   ON transactions   FOR ALL TO anon USING (false);
CREATE POLICY "anon_deny_dmg_claims"     ON dmg_claims     FOR ALL TO anon USING (false);
CREATE POLICY "anon_deny_bonus"          ON bonus          FOR ALL TO anon USING (false);
CREATE POLICY "anon_deny_sr_payments"    ON sr_payments    FOR ALL TO anon USING (false);
CREATE POLICY "anon_deny_exp_cats"       ON exp_cats       FOR ALL TO anon USING (false);
CREATE POLICY "anon_deny_exp_records"    ON exp_records    FOR ALL TO anon USING (false);
CREATE POLICY "anon_deny_due_calendar"   ON due_calendar   FOR ALL TO anon USING (false);
CREATE POLICY "anon_deny_user_passwords" ON user_passwords FOR ALL TO anon USING (false);

INSERT INTO user_passwords (user_key, user_name, role, password, must_change_pw)
VALUES ('owner', 'Owner', 'owner', '12345', true);

DROP TABLE IF EXISTS group_chat_messages CASCADE;

CREATE TABLE group_chat_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   TEXT        NOT NULL DEFAULT '',
  sender_name TEXT        NOT NULL DEFAULT '',
  sender_role TEXT        NOT NULL DEFAULT '',
  message     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_gcm_created_at ON group_chat_messages(created_at);

ALTER TABLE group_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "srv_chat"
  ON group_chat_messages FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "anon_chat_read"
  ON group_chat_messages FOR SELECT TO anon
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE group_chat_messages;

DROP TABLE IF EXISTS manager_pending_approvals CASCADE;

CREATE TABLE manager_pending_approvals (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id   TEXT        NOT NULL DEFAULT '',
  manager_name TEXT        NOT NULL DEFAULT '',
  input_type   TEXT        NOT NULL DEFAULT '' CHECK (input_type IN ('transaction','payment','expense')),
  input_data   JSONB       NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  status       TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_at  TIMESTAMPTZ,
  approved_by  TEXT        DEFAULT ''
);

CREATE INDEX idx_mpa_manager_id   ON manager_pending_approvals(manager_id);
CREATE INDEX idx_mpa_status       ON manager_pending_approvals(status);
CREATE INDEX idx_mpa_submitted_at ON manager_pending_approvals(submitted_at);

ALTER TABLE manager_pending_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_mpa" ON manager_pending_approvals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_mpa" ON manager_pending_approvals FOR ALL TO anon USING (false);

DROP TABLE IF EXISTS notices CASCADE;

CREATE TABLE notices (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content    TEXT        NOT NULL DEFAULT '',
  is_active  BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_notices"       ON notices FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_notices" ON notices FOR ALL TO anon USING (false);

DROP TABLE IF EXISTS important_contacts CASCADE;

CREATE TABLE important_contacts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL DEFAULT '',
  role         TEXT        NOT NULL DEFAULT '',
  phone_number TEXT        NOT NULL DEFAULT '',
  special_note TEXT        NOT NULL DEFAULT '',
  created_by   TEXT        NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ic_created_at ON important_contacts(created_at);

ALTER TABLE important_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_important_contacts"       ON important_contacts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_important_contacts" ON important_contacts FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS office_location CASCADE;

CREATE TABLE app_settings (
  id         INTEGER     PRIMARY KEY DEFAULT 1,
  shop_name  TEXT        NOT NULL DEFAULT '',
  set_by     TEXT        DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT app_settings_single_row CHECK (id = 1)
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_app_settings"       ON app_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_app_settings" ON app_settings FOR ALL TO anon          USING (false);

CREATE TABLE office_location (
  id         INTEGER       PRIMARY KEY DEFAULT 1,
  lat        NUMERIC(10,7) NOT NULL,
  lng        NUMERIC(10,7) NOT NULL,
  radius_m   INTEGER       NOT NULL DEFAULT 150,
  set_by     TEXT          DEFAULT '',
  set_at     TIMESTAMPTZ   DEFAULT NOW(),
  CONSTRAINT office_location_single_row CHECK (id = 1)
);

ALTER TABLE office_location ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_office_location"       ON office_location FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_office_location" ON office_location FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS live_locations CASCADE;

CREATE TABLE live_locations (
  user_key   TEXT          PRIMARY KEY,
  user_name  TEXT          DEFAULT '',
  role       TEXT          DEFAULT '',
  lat        NUMERIC(10,7),
  lng        NUMERIC(10,7),
  updated_at TIMESTAMPTZ   DEFAULT NOW()
);

ALTER TABLE live_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_live_locations"       ON live_locations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_live_locations" ON live_locations FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS attendance CASCADE;

CREATE TABLE attendance (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key    TEXT          NOT NULL,
  user_name   TEXT          DEFAULT '',
  role        TEXT          NOT NULL,
  punch_date  DATE          NOT NULL,   -- the WORKDAY this punch belongs to (not necessarily the calendar date it was tapped on, for late-night "out" punches)
  punch_type  TEXT          NOT NULL DEFAULT 'in' CHECK (punch_type IN ('in','out')),
  punch_time  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  status      TEXT          CHECK (status IS NULL OR status IN ('present','late')), -- only meaningful for punch_type='in'
  lat         NUMERIC(10,7),
  lng         NUMERIC(10,7),
  at_office   BOOLEAN,
  distance_m  NUMERIC(10,1),
  created_at  TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE (user_key, punch_date, punch_type)
);
CREATE INDEX idx_att_user ON attendance(user_key);
CREATE INDEX idx_att_date ON attendance(punch_date);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_attendance"       ON attendance FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_attendance" ON attendance FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS salary_settings CASCADE;

CREATE TABLE salary_settings (
  user_key          TEXT          NOT NULL,
  month             TEXT          NOT NULL, -- 'YYYY-MM'
  user_name         TEXT          DEFAULT '',
  salary_per_day    NUMERIC(14,2) NOT NULL DEFAULT 0,
  bonus_enabled     BOOLEAN       NOT NULL DEFAULT false,
  daily_bonus_amt   NUMERIC(10,2) NOT NULL DEFAULT 20,
  perfect_bonus_amt NUMERIC(10,2) NOT NULL DEFAULT 500,
  late_penalty_amt  NUMERIC(10,2) NOT NULL DEFAULT 500,
  no_gap_bonus_amt  NUMERIC(10,2) NOT NULL DEFAULT 0,
  set_by            TEXT          DEFAULT '',
  set_at            TIMESTAMPTZ   DEFAULT NOW(),
  PRIMARY KEY (user_key, month)
);

ALTER TABLE salary_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_salary_settings"       ON salary_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_salary_settings" ON salary_settings FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS salary_ledger CASCADE;

CREATE TABLE salary_ledger (
  user_key    TEXT          NOT NULL,
  month       TEXT          NOT NULL, -- 'YYYY-MM'
  user_name   TEXT          DEFAULT '',
  paid_at     TIMESTAMPTZ,
  paid_amount NUMERIC(14,2) DEFAULT 0,
  paid_by     TEXT          DEFAULT '',
  updated_at  TIMESTAMPTZ   DEFAULT NOW(),
  PRIMARY KEY (user_key, month)
);

ALTER TABLE salary_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_salary_ledger"       ON salary_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_salary_ledger" ON salary_ledger FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS salary_day_override CASCADE;

CREATE TABLE salary_day_override (
  user_key      TEXT        NOT NULL,
  workday_date  DATE        NOT NULL,
  reason        TEXT        DEFAULT '',
  approved_by   TEXT        DEFAULT '',
  approved_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_key, workday_date)
);

ALTER TABLE salary_day_override ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_salary_day_override"       ON salary_day_override FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_salary_day_override" ON salary_day_override FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS advance_requests CASCADE;

CREATE TABLE advance_requests (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key     TEXT          NOT NULL,
  user_name    TEXT          DEFAULT '',
  role         TEXT          DEFAULT '',
  amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  month        TEXT          NOT NULL, -- 'YYYY-MM' — the salary month it will be deducted from
  note         TEXT          DEFAULT '',
  status       TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_at TIMESTAMPTZ   DEFAULT NOW(),
  decided_at   TIMESTAMPTZ,
  decided_by   TEXT          DEFAULT ''
);
CREATE INDEX idx_advance_requests_user_month ON advance_requests(user_key, month);
CREATE INDEX idx_advance_requests_status     ON advance_requests(status);

ALTER TABLE advance_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_advance_requests"       ON advance_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_advance_requests" ON advance_requests FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS shops CASCADE;

CREATE TABLE shops (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_no            TEXT          NOT NULL UNIQUE,   -- e.g. SHOP-0001
  name               TEXT          NOT NULL,
  keeper_name        TEXT          DEFAULT '',        -- shopkeeper's own name, captured at registration
  phone              TEXT          DEFAULT '',
  address            TEXT          DEFAULT '',        -- optional free-form / reverse-geocoded (§14 bonus)
  lat                NUMERIC(10,7),
  lng                NUMERIC(10,7),
  assigned_dsr_id    TEXT          NOT NULL,           -- srs.id of the owning DSR (stable — never a name)
  assigned_dsr_name  TEXT          DEFAULT '',
  road_id            TEXT          DEFAULT '',
  road_name          TEXT          DEFAULT '',
  created_at         TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX idx_shops_dsr   ON shops(assigned_dsr_id);
CREATE INDEX idx_shops_phone ON shops(phone);
CREATE INDEX idx_shops_road  ON shops(road_id);

ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_shops"       ON shops FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_shops" ON shops FOR ALL TO anon          USING (false);

DROP SEQUENCE IF EXISTS shop_no_seq;
CREATE SEQUENCE shop_no_seq START 1;

CREATE OR REPLACE FUNCTION next_shop_no() RETURNS INTEGER AS $$
BEGIN
  RETURN nextval('shop_no_seq');
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION next_shop_no() TO service_role;

DROP TABLE IF EXISTS pos_customers CASCADE;

CREATE TABLE pos_customers (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT          NOT NULL,
  keeper_name  TEXT          DEFAULT '',
  phone        TEXT          DEFAULT '',
  address      TEXT          DEFAULT '',
  created_at   TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX idx_pos_cust_phone ON pos_customers(phone);

ALTER TABLE pos_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_pos_customers"       ON pos_customers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_pos_customers" ON pos_customers FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS orders CASCADE;

CREATE TABLE orders (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  so_id             TEXT          NOT NULL,
  so_name           TEXT          DEFAULT '',
  items             JSONB         NOT NULL DEFAULT '[]',
  requested_amount  NUMERIC(14,4) DEFAULT 0,
  status            TEXT          NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','modified_pending','approved','rejected')),
  modified_by       TEXT          DEFAULT '',
  modified_amount   NUMERIC(14,4),
  proposed_items    JSONB,
  assigned_dsr_id   TEXT          DEFAULT '',
  load_status       TEXT          NOT NULL DEFAULT 'not_started'
                      CHECK (load_status IN ('not_started','loading','load_complete','loaded')),
  load_ticks        JSONB         NOT NULL DEFAULT '{}',
  approved_by       TEXT          DEFAULT '',
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX idx_orders_so_id  ON orders(so_id);
CREATE INDEX idx_orders_dsr_id ON orders(assigned_dsr_id);
CREATE INDEX idx_orders_status ON orders(status);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_orders"       ON orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_orders" ON orders FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS personal_ledger CASCADE;

CREATE TABLE personal_ledger (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key   TEXT          NOT NULL,
  type       TEXT          NOT NULL CHECK (type IN ('received','given')),
  amount     NUMERIC(14,4) DEFAULT 0,
  note       TEXT          DEFAULT '',
  date       DATE          NOT NULL,
  created_at TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX idx_pl_user ON personal_ledger(user_key);

ALTER TABLE personal_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_personal_ledger"       ON personal_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_personal_ledger" ON personal_ledger FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS so_daily_quota CASCADE;
DROP TABLE IF EXISTS online_deposit CASCADE;

CREATE TABLE online_deposit (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  date           DATE          NOT NULL,
  amount         NUMERIC(14,4) DEFAULT 0,
  deposit_method TEXT          NOT NULL CHECK (deposit_method IN ('bank','depot')),
  set_by         TEXT          DEFAULT '',
  set_at         TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX idx_online_deposit_date ON online_deposit(date);

ALTER TABLE online_deposit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_online_deposit"       ON online_deposit FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_online_deposit" ON online_deposit FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS targets CASCADE;

CREATE TABLE targets (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key      TEXT          NOT NULL,               -- = srs.id (DSR or SO), or 'COMPANY_TOTAL'
  user_name     TEXT          DEFAULT '',
  role          TEXT          DEFAULT '' CHECK (role IN ('', 'dsr', 'so', 'company')),
  period        TEXT          NOT NULL,               -- 'YYYY-MM'
  target_amount NUMERIC(14,4) DEFAULT 0,
  set_by        TEXT          DEFAULT '',
  set_at        TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE (user_key, period)
);
CREATE INDEX idx_targets_period   ON targets(period);
CREATE INDEX idx_targets_userkey  ON targets(user_key);

ALTER TABLE targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_targets"       ON targets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_targets" ON targets FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS target_bonuses CASCADE;

CREATE TABLE target_bonuses (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key     TEXT          NOT NULL,           -- = srs.id (SO, typically)
  user_name    TEXT          DEFAULT '',
  period       TEXT          NOT NULL,           -- 'YYYY-MM'
  amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  status       TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled')),
  set_by       TEXT          DEFAULT '',
  set_at       TIMESTAMPTZ   DEFAULT NOW(),
  settled_by   TEXT          DEFAULT '',
  settled_at   TIMESTAMPTZ,
  UNIQUE (user_key, period)
);
CREATE INDEX idx_target_bonuses_period ON target_bonuses(period);

ALTER TABLE target_bonuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_target_bonuses"       ON target_bonuses FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_target_bonuses" ON target_bonuses FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS product_targets CASCADE;

CREATE TABLE product_targets (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  period      TEXT          NOT NULL,               -- 'YYYY-MM'
  product_id  TEXT          NOT NULL,
  target_qty  NUMERIC(14,4) DEFAULT 0,
  set_by      TEXT          DEFAULT '',
  set_at      TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE (period, product_id)
);
CREATE INDEX idx_prod_targets_period ON product_targets(period);
CREATE INDEX idx_prod_targets_pid    ON product_targets(product_id);

ALTER TABLE product_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_product_targets"       ON product_targets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_product_targets" ON product_targets FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS daily_so_reports CASCADE;

CREATE TABLE daily_so_reports (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  so_id         TEXT          NOT NULL,
  so_name       TEXT          DEFAULT '',
  report_date   DATE          NOT NULL,
  generated_at  TIMESTAMPTZ   DEFAULT NOW(),
  generated_by  TEXT          DEFAULT '',   -- 'auto' (cron) or the Owner's user_name
  report_data   JSONB         NOT NULL DEFAULT '{}',
  due_data      JSONB         NOT NULL DEFAULT '{}',
  UNIQUE (so_id, report_date)
);
CREATE INDEX idx_dsr_so_id ON daily_so_reports(so_id);
CREATE INDEX idx_dsr_date  ON daily_so_reports(report_date);

ALTER TABLE daily_so_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_daily_so_reports"       ON daily_so_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_daily_so_reports" ON daily_so_reports FOR ALL TO anon          USING (false);

CREATE OR REPLACE FUNCTION apply_stock_delta() RETURNS TRIGGER AS $$
DECLARE
  delta NUMERIC(14,4);
BEGIN
  delta := CASE NEW.type
    WHEN 'buy'                  THEN  NEW.total_units
    WHEN 'give'                 THEN -NEW.total_units
    WHEN 'return'                THEN  NEW.total_units
    WHEN 'point_sale'            THEN -NEW.total_units
    WHEN 'point_damage_return'   THEN  NEW.total_units
    ELSE 0
  END;
  IF delta <> 0 AND NEW.product_id IS NOT NULL AND NEW.product_id <> '' THEN
    UPDATE products SET current_stock = current_stock + delta
      WHERE id::text = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_apply_stock_delta ON transactions;
CREATE TRIGGER trg_apply_stock_delta
  AFTER INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION apply_stock_delta();

DROP TABLE IF EXISTS roads CASCADE;

CREATE TABLE roads (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  so_id      TEXT        DEFAULT '',
  so_name    TEXT        DEFAULT '',
  dsr_id     TEXT        DEFAULT '',
  dsr_name   TEXT        DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_roads_so_id  ON roads(so_id);
CREATE INDEX idx_roads_dsr_id ON roads(dsr_id);

ALTER TABLE roads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_roads"       ON roads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_roads" ON roads FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS road_visit_plans CASCADE;

CREATE TABLE road_visit_plans (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  road_id        TEXT        NOT NULL,
  road_name      TEXT        DEFAULT '',
  so_id          TEXT        DEFAULT '',
  so_name        TEXT        DEFAULT '',
  dsr_id         TEXT        DEFAULT '',
  dsr_name       TEXT        DEFAULT '',
  so_visit_date  DATE        NOT NULL,   -- day 1 — SO visits shops
  dsr_visit_date DATE        NOT NULL,   -- day 2 (so_visit_date + 1) — DSR delivers
  created_by     TEXT        DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_rvp_road          ON road_visit_plans(road_id);
CREATE INDEX idx_rvp_so_date       ON road_visit_plans(so_id, so_visit_date);
CREATE INDEX idx_rvp_dsr_date      ON road_visit_plans(dsr_id, dsr_visit_date);

ALTER TABLE road_visit_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_road_visit_plans"       ON road_visit_plans FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_road_visit_plans" ON road_visit_plans FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS road_weekly_plans CASCADE;

CREATE TABLE road_weekly_plans (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  road_id      TEXT        NOT NULL,
  road_name    TEXT        DEFAULT '',
  so_id        TEXT        DEFAULT '',
  so_name      TEXT        DEFAULT '',
  dsr_id       TEXT        DEFAULT '',
  dsr_name     TEXT        DEFAULT '',
  weekday      SMALLINT    NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Sunday..6=Saturday
  active_from  DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_by   TEXT        DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (road_id, weekday)
);
CREATE INDEX idx_rwp_so      ON road_weekly_plans(so_id, weekday);
CREATE INDEX idx_rwp_dsr     ON road_weekly_plans(dsr_id, weekday);
CREATE INDEX idx_rwp_road    ON road_weekly_plans(road_id);

ALTER TABLE road_weekly_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_road_weekly_plans"       ON road_weekly_plans FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_road_weekly_plans" ON road_weekly_plans FOR ALL TO anon          USING (false);

DROP TABLE IF EXISTS shop_visits CASCADE;

CREATE TABLE shop_visits (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      TEXT        NOT NULL,
  visit_role   TEXT        NOT NULL CHECK (visit_role IN ('so', 'dsr')),
  visitor_id   TEXT        DEFAULT '',
  visitor_name TEXT        DEFAULT '',
  visit_date   DATE        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_shop_visits_date      ON shop_visits(visit_date);
CREATE INDEX idx_shop_visits_shop_date ON shop_visits(shop_id, visit_date);

ALTER TABLE shop_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_shop_visits"       ON shop_visits FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_deny_shop_visits" ON shop_visits FOR ALL TO anon          USING (false);
