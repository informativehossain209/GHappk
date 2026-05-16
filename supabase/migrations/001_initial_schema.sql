-- ================================================================
-- Ghar Khoroch — Database Schema
-- Run this in your Supabase SQL editor
-- ================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ================================================================
-- USERS TABLE
-- ================================================================
create table if not exists public.users (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  phone text not null unique,
  pin text not null,
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
  month text not null, -- format: YYYY-MM
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
-- ROW LEVEL SECURITY (RLS)
-- ================================================================

-- Enable RLS
alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.notices enable row level security;
alter table public.todos enable row level security;
alter table public.shared_access enable row level security;

-- NOTE: We use a custom auth system (PIN-based), not Supabase Auth.
-- RLS policies use anon key with service role bypass for our custom queries.
-- For production, consider using Supabase Auth with custom metadata.

-- For the anon role, allow all operations (the app handles auth logic)
-- This is appropriate for a private family app.

create policy "Allow anon full access to users" on public.users
  for all using (true) with check (true);

create policy "Allow anon full access to categories" on public.categories
  for all using (true) with check (true);

create policy "Allow anon full access to transactions" on public.transactions
  for all using (true) with check (true);

create policy "Allow anon full access to budgets" on public.budgets
  for all using (true) with check (true);

create policy "Allow anon full access to notices" on public.notices
  for all using (true) with check (true);

create policy "Allow anon full access to todos" on public.todos
  for all using (true) with check (true);

create policy "Allow anon full access to shared_access" on public.shared_access
  for all using (true) with check (true);

-- ================================================================
-- INDEXES
-- ================================================================
create index if not exists idx_transactions_user_date on public.transactions(user_id, date desc);
create index if not exists idx_transactions_category on public.transactions(category_id);
create index if not exists idx_categories_user on public.categories(user_id, type);
create index if not exists idx_budgets_user_month on public.budgets(user_id, month);
create index if not exists idx_notices_user on public.notices(user_id, is_read);
create index if not exists idx_todos_user on public.todos(user_id, completed, date);
create index if not exists idx_shared_owner on public.shared_access(owner_user_id);
create index if not exists idx_shared_viewer on public.shared_access(viewer_user_id);

-- ================================================================
-- DONE
-- ================================================================
-- Your database is ready!
-- Next steps:
-- 1. Go to your Supabase project → SQL Editor
-- 2. Paste and run this entire script
-- 3. Copy your Project URL and Anon Key
-- 4. Add them to your .env.local file
