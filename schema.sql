-- ============================================================================
-- দোকানদার (Dokandar) — Multi-tenant Shop Management ERP
-- Schema v1 — built per DOKANDAR-BUILD-SPEC.md, patterns [REUSE]/[ADAPT]
-- from AXIION V57 as noted in each section's comment.
--
-- Run this once against a fresh Supabase Postgres project. Enable the
-- `pgcrypto` extension first (for gen_random_uuid()) — Supabase projects
-- normally have this on already.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ============================================================================
-- 0. PLATFORM LAYER (§2.1) — not tenant-scoped, lives outside RLS entirely
-- ============================================================================

create table if not exists platform_admins (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  username      text not null unique,
  password_hash text not null,       -- bcrypt hash, never plaintext
  created_at    timestamptz not null default now()
);

-- One row per tenant "account". THIS is the shop account, separate from any
-- customer/shop entity the app itself manages (§3) — don't confuse with
-- AXIION's old `shops` table which meant something different there.
create table if not exists tenants (
  id                 uuid primary key default gen_random_uuid(),
  shop_name          text not null,
  owner_name         text not null,
  mobile             text not null unique,
  category           text not null,             -- drives §5 category_fields config
  address            text default '',           -- shown on printed receipts (§7)
  status             text not null default 'pending'
                       check (status in ('pending','active','suspended','rejected')),
  storage_used_bytes bigint not null default 0, -- maintained by thumbStorage adapt
  dead_stock_warn_days int not null default 30,
  dead_stock_dead_days int not null default 60,
  vat_percent        numeric not null default 0, -- §Open Q3 — configurable per shop
  receipt_width_mm   int not null default 80,     -- 58 or 80, §Open Q4
  ui_mode            text not null default 'light' check (ui_mode in ('light','dark')),
  approved_at        timestamptz,
  approved_by        uuid references platform_admins(id),
  created_at         timestamptz not null default now()
);
create index if not exists idx_tenants_status on tenants(status);
create index if not exists idx_tenants_mobile on tenants(mobile);

-- ============================================================================
-- 1. STAFF / IDENTITY (§2.2) — [ADAPT] AXIION's user_passwords, now scoped
--    to (tenant_id, password) instead of a single global password column.
-- ============================================================================

create table if not exists staff (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null,
  role         text not null check (role in
                 ('owner','manager','cashier','salesperson','inventory_manager','accountant')),
  pin          text not null,        -- 4-6 digit PIN, unique within a tenant
  thumb        text default '',
  mobile       text default '',
  active       boolean not null default true,
  ui_mode      text default null check (ui_mode in ('light','dark') or ui_mode is null),
  created_at   timestamptz not null default now(),
  unique (tenant_id, pin)
);
create index if not exists idx_staff_tenant on staff(tenant_id);

-- Long-lived session tokens (§2.2 persistent login) — a server-validated
-- row, not just a client flag, so it can be invalidated remotely (logout,
-- PIN reset by platform admin, staff deactivation).
create table if not exists sessions (
  token       text primary key,       -- random opaque token, stored in localStorage
  tenant_id   uuid not null references tenants(id) on delete cascade,
  staff_id    uuid not null references staff(id) on delete cascade,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create index if not exists idx_sessions_tenant on sessions(tenant_id);

-- ============================================================================
-- 2. PRODUCTS / CATALOG (§5) — [REUSE] AXIION shape + category_fields JSONB
-- ============================================================================

create table if not exists products (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id) on delete cascade,
  name                 text not null,
  sku                  text default '',
  barcode              text default '',          -- §6 scanned manufacturer barcode
  category             text default '',
  purchase_price       numeric not null default 0,
  selling_price        numeric not null default 0,   -- default; POS allows per-sale override
  wholesale_price       numeric default null,
  minimum_selling_price numeric default null,        -- §7 sub-min price needs approval
  unit                 text default 'pcs',
  case_size            numeric default 1,
  bonus_config         jsonb default '{}',
  thumb                text default '',
  current_stock        numeric not null default 0,   -- DB-maintained via trigger, never re-summed
  reserved_stock        numeric not null default 0,
  damaged_stock         numeric not null default 0,
  incoming_stock        numeric not null default 0,   -- open purchase orders not yet received
  storage_location      text default '',
  low_stock_alert       numeric default null,
  category_fields       jsonb default '{}',           -- §5: warranty/IMEI/batch/expiry/size/etc.
  last_sale_date        date,                          -- maintained by POS trigger, used by §8 dead-stock
  created_at            timestamptz not null default now()
);
-- (products.supplier_id FK to suppliers is added after suppliers is created, below)
create index if not exists idx_products_tenant on products(tenant_id);
create index if not exists idx_products_barcode on products(tenant_id, barcode);
create index if not exists idx_products_sku on products(tenant_id, sku);
create index if not exists idx_products_name_trgm on products using gin (name gin_trgm_ops);

-- ============================================================================
-- 3. SUPPLIERS + PURCHASES (§9) — [NEW]
-- ============================================================================

create table if not exists suppliers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null,
  phone         text default '',
  address       text default '',
  created_at    timestamptz not null default now()
);
create index if not exists idx_suppliers_tenant on suppliers(tenant_id);

-- Fix the forward-reference placeholder from the products table above.
alter table products drop column if exists supplier_id;
alter table products add column supplier_id uuid references suppliers(id);

create table if not exists purchases (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  supplier_id   uuid references suppliers(id),
  items         jsonb not null default '[]',  -- [{product_id, qty, unit_cost}]
  total         numeric not null default 0,
  paid_amount   numeric not null default 0,
  due_amount    numeric not null default 0,
  date          date not null default current_date,
  created_by    uuid references staff(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_purchases_tenant on purchases(tenant_id);

create table if not exists purchase_returns (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  purchase_id   uuid references purchases(id),
  product_id    uuid references products(id),
  qty           numeric not null,
  reason        text default '',
  status        text not null default 'pending' check (status in ('pending','cleared')),
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- 4. CUSTOMERS (§10) — [ADAPT] pos_customers + due_calendar
-- ============================================================================

create table if not exists customers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  name           text not null,
  phone          text default '',
  address        text default '',
  loyalty_points numeric default 0,   -- present but unused, §10 future flag
  created_at     timestamptz not null default now()
);
create index if not exists idx_customers_tenant on customers(tenant_id);

-- Shared due-tracking shape (§9 supplier due + §10 customer due both point
-- here, `party_type` distinguishes which). [REUSE] AXIION's due_calendar
-- pending/partial/cleared pattern.
create table if not exists due_calendar (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  party_type    text not null check (party_type in ('customer','supplier')),
  party_id      uuid not null,        -- customers.id or suppliers.id
  ref_type      text default '',      -- 'sale' | 'purchase'
  ref_id        uuid,
  total_amount  numeric not null default 0,
  paid_amount   numeric not null default 0,
  status        text not null default 'pending' check (status in ('pending','partial','cleared')),
  due_date      date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_due_tenant on due_calendar(tenant_id, party_type, party_id);

-- ============================================================================
-- 5. TRANSACTIONS / POS (§7) — [REUSE] AXIION's ledger-table design
-- ============================================================================

create table if not exists transactions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  type            text not null check (type in
                    ('sale','return','damage','purchase','purchase_return')),
  invoice_no      text default '',
  product_id      uuid references products(id),
  qty             numeric not null default 0,
  unit_price      numeric not null default 0,
  purchase_price  numeric default 0,      -- snapshot at sale time, for profit calc
  discount        numeric default 0,
  customer_id     uuid references customers(id),
  payment_method  text default 'cash',    -- cash | digital | due
  cashier_id      uuid references staff(id),
  date            date not null default current_date,
  created_at      timestamptz not null default now()
);
create index if not exists idx_txn_tenant on transactions(tenant_id);
create index if not exists idx_txn_tenant_date on transactions(tenant_id, date);
create index if not exists idx_txn_product on transactions(tenant_id, product_id);
create index if not exists idx_txn_invoice on transactions(tenant_id, invoice_no);

-- Custom-price-below-minimum approval gate (§7) — [ADAPT] AXIION's
-- manager_pending_approvals mechanism, new trigger condition.
create table if not exists pending_approvals (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  kind          text not null default 'custom_price',
  payload       jsonb not null,          -- cart snapshot awaiting approval
  requested_by  uuid references staff(id),
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by    uuid references staff(id),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);
create index if not exists idx_approvals_tenant on pending_approvals(tenant_id, status);

-- ============================================================================
-- 6. STAFF ATTENDANCE + SALARY (§11) — [REUSE] almost directly from AXIION
-- ============================================================================

create table if not exists attendance (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  staff_id     uuid not null references staff(id) on delete cascade,
  date         date not null,
  punch_in     timestamptz,
  punch_out    timestamptz,
  status       text default 'present' check (status in ('present','absent','leave','half_day')),
  created_at   timestamptz not null default now(),
  unique (tenant_id, staff_id, date)
);
create index if not exists idx_attendance_tenant on attendance(tenant_id, date);

create table if not exists salary_settings (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  staff_id       uuid not null references staff(id) on delete cascade,
  monthly_salary numeric not null default 0,
  per_day_rate   numeric default null,      -- derived if null (monthly/30)
  on_time_bonus  numeric default 0,
  created_at     timestamptz not null default now(),
  unique (tenant_id, staff_id)
);

create table if not exists salary_ledger (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  staff_id      uuid not null references staff(id) on delete cascade,
  month         text not null,       -- 'YYYY-MM'
  base_amount   numeric not null default 0,
  bonus_amount  numeric not null default 0,
  advance_deduct numeric not null default 0,
  paid_amount   numeric not null default 0,
  status        text not null default 'unpaid' check (status in ('unpaid','partial','paid')),
  created_at    timestamptz not null default now(),
  unique (tenant_id, staff_id, month)
);

create table if not exists salary_day_override (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  staff_id     uuid not null references staff(id) on delete cascade,
  date         date not null,
  rate_override numeric,
  note         text default '',
  unique (tenant_id, staff_id, date)
);

create table if not exists advance_requests (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  staff_id      uuid not null references staff(id) on delete cascade,
  amount        numeric not null,
  reason        text default '',
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  month         text,               -- which salary_ledger month it deducts from
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- 7. EXPENSES (§12) — [REUSE] directly from expenses.js
-- ============================================================================

create table if not exists exp_cats (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists exp_records (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  cat_id      uuid references exp_cats(id),
  amount      numeric not null default 0,
  note        text default '',
  date        date not null default current_date,
  created_by  uuid references staff(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_exp_tenant on exp_records(tenant_id, date);

-- ============================================================================
-- 8. DAILY SHOP CLOSING (§13) — [NEW]
-- ============================================================================

create table if not exists daily_closing (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  date             date not null,
  opening_cash     numeric not null default 0,
  cash_sales       numeric not null default 0,
  digital_sales    numeric not null default 0,
  total_expenses   numeric not null default 0,
  cash_withdrawals numeric not null default 0,
  counted_cash     numeric,
  expected_cash    numeric generated always as
                     (opening_cash + cash_sales - total_expenses - cash_withdrawals) stored,
  status           text not null default 'open' check (status in ('open','closed','approved')),
  closed_by        uuid references staff(id),
  approved_by      uuid references staff(id),
  closed_at        timestamptz,
  approved_at      timestamptz,
  unique (tenant_id, date)
);
create index if not exists idx_closing_tenant on daily_closing(tenant_id, date);

-- ============================================================================
-- 9. REPORTS (§14) — [REUSE] cron-driven pattern, cached snapshots
-- ============================================================================

create table if not exists report_snapshots (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  period_type  text not null check (period_type in ('daily','weekly','monthly','yearly')),
  period_key   text not null,     -- 'YYYY-MM-DD' | 'YYYY-Www' | 'YYYY-MM' | 'YYYY'
  data         jsonb not null default '{}',
  generated_at timestamptz not null default now(),
  unique (tenant_id, period_type, period_key)
);

-- ============================================================================
-- 10. STORAGE ACCOUNTING (§3) — one shared bucket, folder-per-tenant
-- ============================================================================
-- Actual files live in Supabase Storage at thumbs/<tenant_id>/<file>.jpg —
-- storage_used_bytes on `tenants` is updated by the app on each
-- upload/delete (see api/_lib/thumbStorage.js), summed via prefix listing
-- for the platform-admin dashboard.

-- ============================================================================
-- 11. TRIGGERS — stock delta, dead/last-sale-date, due_calendar sync
-- ============================================================================

-- [REUSE] AXIION's trg_apply_stock_delta pattern: stock is ALWAYS
-- DB-maintained by this trigger, never re-summed from history in app code.
create or replace function trg_apply_stock_delta() returns trigger as $$
begin
  if new.type = 'sale' then
    update products set current_stock = current_stock - new.qty,
                         last_sale_date = new.date
      where id = new.product_id;
  elsif new.type = 'return' then
    update products set current_stock = current_stock + new.qty where id = new.product_id;
  elsif new.type = 'damage' then
    update products set current_stock = current_stock - new.qty,
                         damaged_stock = damaged_stock + new.qty
      where id = new.product_id;
  elsif new.type = 'purchase' then
    update products set current_stock = current_stock + new.qty where id = new.product_id;
  elsif new.type = 'purchase_return' then
    update products set current_stock = current_stock - new.qty where id = new.product_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_txn_stock_delta on transactions;
create trigger trg_txn_stock_delta
  after insert on transactions
  for each row execute function trg_apply_stock_delta();

-- ============================================================================
-- 11b. SELF-HEALING MIGRATION GUARD — makes this script safe to re-run even
--     if some tenant tables were already created earlier (e.g. by a partial
--     prior run, or an older schema version) WITHOUT a tenant_id column.
--     `create table if not exists` above is a no-op against an existing
--     table, so without this guard a pre-existing table missing tenant_id
--     would silently stay broken and later statements (RLS policies, app
--     queries) would fail with: column "tenant_id" does not exist.
-- ============================================================================

do $$
declare
  t text;
  tenant_tables text[] := array[
    'staff','products','suppliers','purchases','purchase_returns','customers',
    'due_calendar','transactions','pending_approvals','attendance',
    'salary_settings','salary_ledger','salary_day_override','advance_requests',
    'exp_cats','exp_records','daily_closing','report_snapshots'
  ];
begin
  foreach t in array tenant_tables loop
    if to_regclass(t) is not null then
      execute format(
        'alter table %I add column if not exists tenant_id uuid references tenants(id) on delete cascade;',
        t
      );
      execute format(
        'do $inner$ begin
           if not exists (select 1 from %I where tenant_id is null) then
             alter table %I alter column tenant_id set not null;
           end if;
         end $inner$;',
        t, t
      );
    end if;
  end loop;
end $$;

-- ============================================================================
-- 12. ROW-LEVEL SECURITY (§3) — enforced by Postgres as a safety net, on
--     top of app-level tenant_id filtering. API uses the Supabase service
--     role key (bypasses RLS by design, same as AXIION) — these policies
--     matter if/when a scoped anon/authenticated key is ever used directly
--     from a client, so they're included as defense-in-depth from day one.
-- ============================================================================

do $$
declare
  t text;
  tenant_tables text[] := array[
    'staff','products','suppliers','purchases','purchase_returns','customers',
    'due_calendar','transactions','pending_approvals','attendance',
    'salary_settings','salary_ledger','salary_day_override','advance_requests',
    'exp_cats','exp_records','daily_closing','report_snapshots'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'drop policy if exists tenant_isolation on %I;', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid);',
      t);
  end loop;
end $$;

