-- ================================================================
-- Ghar Khoroch — Database Schema (Multi-User Secure)
-- Run this in your Supabase SQL editor
--
-- ⚠️  BEFORE RUNNING:
--   Go to Supabase Dashboard → Authentication → Providers → Email
--   Turn OFF "Enable email confirmations"
--   (The app uses phone numbers as fake emails; no real email is sent)
-- ================================================================

create extension if not exists "uuid-ossp";

-- ================================================================
-- USERS TABLE
-- id is linked to Supabase Auth so each app user has an Auth account
-- ================================================================
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone text not null unique,
  pin text not null,        -- SHA-256 hashed, used for in-app PIN prompts
  address text,
  created_at timestamptz default now()
);

-- ================================================================
-- CATEGORIES TABLE
-- ================================================================
create table if not exists public.categories (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  icon text not null default '📦',
  type text not null check (type in ('income', 'expense')),
  is_default boolean default false,
  color text default '#64748B',
  created_at timestamptz default now()
);

-- ================================================================
-- TRANSACTIONS TABLE
-- ================================================================
create table if not exists public.transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  category_id uuid not null references public.categories(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  date date not null,
  created_at timestamptz default now()
);

-- ================================================================
-- BUDGETS TABLE
-- ================================================================
create table if not exists public.budgets (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  monthly_limit numeric(12, 2) not null check (monthly_limit > 0),
  month text not null,
  created_at timestamptz default now(),
  unique(user_id, category_id, month)
);

-- ================================================================
-- NOTICES TABLE
-- ================================================================
create table if not exists public.notices (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  message text not null,
  type text not null default 'info' check (type in ('info', 'warning', 'success', 'alert')),
  is_read boolean default false,
  created_at timestamptz default now()
);

-- ================================================================
-- TODOS TABLE
-- ================================================================
create table if not exists public.todos (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  date date not null,
  time time,
  amount numeric(12, 2),
  completed boolean default false,
  created_at timestamptz default now()
);

-- ================================================================
-- SHARED ACCESS TABLE
-- ================================================================
create table if not exists public.shared_access (
  id uuid default uuid_generate_v4() primary key,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  viewer_user_id uuid not null references public.users(id) on delete cascade,
  permission text not null default 'view' check (permission in ('view')),
  created_at timestamptz default now(),
  unique(owner_user_id, viewer_user_id)
);

-- ================================================================
-- ENABLE ROW LEVEL SECURITY
-- ================================================================
alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.notices enable row level security;
alter table public.todos enable row level security;
alter table public.shared_access enable row level security;

-- ================================================================
-- USERS policies — each user owns only their own row
-- ================================================================
create policy "users_select_own" on public.users
  for select using (id = auth.uid());

create policy "users_insert_own" on public.users
  for insert with check (id = auth.uid());

create policy "users_update_own" on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ================================================================
-- CATEGORIES policies — owner writes, viewers read
-- ================================================================
create policy "categories_select" on public.categories
  for select using (
    user_id = auth.uid() or
    exists (select 1 from public.shared_access sa
            where sa.owner_user_id = categories.user_id
              and sa.viewer_user_id = auth.uid())
  );

create policy "categories_insert" on public.categories
  for insert with check (user_id = auth.uid());

create policy "categories_update" on public.categories
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "categories_delete" on public.categories
  for delete using (user_id = auth.uid());

-- ================================================================
-- TRANSACTIONS policies — owner writes, viewers read
-- ================================================================
create policy "transactions_select" on public.transactions
  for select using (
    user_id = auth.uid() or
    exists (select 1 from public.shared_access sa
            where sa.owner_user_id = transactions.user_id
              and sa.viewer_user_id = auth.uid())
  );

create policy "transactions_insert" on public.transactions
  for insert with check (user_id = auth.uid());

create policy "transactions_update" on public.transactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "transactions_delete" on public.transactions
  for delete using (user_id = auth.uid());

-- ================================================================
-- BUDGETS policies — owner writes, viewers read
-- ================================================================
create policy "budgets_select" on public.budgets
  for select using (
    user_id = auth.uid() or
    exists (select 1 from public.shared_access sa
            where sa.owner_user_id = budgets.user_id
              and sa.viewer_user_id = auth.uid())
  );

create policy "budgets_insert" on public.budgets
  for insert with check (user_id = auth.uid());

create policy "budgets_update" on public.budgets
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "budgets_delete" on public.budgets
  for delete using (user_id = auth.uid());

-- ================================================================
-- NOTICES policies — owner only
-- ================================================================
create policy "notices_own" on public.notices
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ================================================================
-- TODOS policies — owner only
-- ================================================================
create policy "todos_own" on public.todos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ================================================================
-- SHARED_ACCESS policies
-- Owner manages their viewers list; viewer can read their own entry
-- ================================================================
create policy "shared_access_owner" on public.shared_access
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy "shared_access_viewer_read" on public.shared_access
  for select using (viewer_user_id = auth.uid());

-- ================================================================
-- INDEXES
-- ================================================================
create index if not exists idx_transactions_user_date on public.transactions(user_id, date desc);
create index if not exists idx_transactions_category  on public.transactions(category_id);
create index if not exists idx_categories_user        on public.categories(user_id, type);
create index if not exists idx_budgets_user_month     on public.budgets(user_id, month);
create index if not exists idx_notices_user           on public.notices(user_id, is_read);
create index if not exists idx_todos_user             on public.todos(user_id, completed, date);
create index if not exists idx_shared_owner           on public.shared_access(owner_user_id);
create index if not exists idx_shared_viewer          on public.shared_access(viewer_user_id);

-- ================================================================
-- DONE!
-- Next steps:
--   1. Supabase Dashboard → Auth → Email → disable email confirmations
--   2. Run this entire SQL script
--   3. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local
-- ================================================================
