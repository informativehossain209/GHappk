-- ================================================
-- ঘর খরচ — Supabase Database Migration v1.0
-- Supabase Dashboard > SQL Editor-এ paste করুন
-- ================================================

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS profiles (
  id           uuid REFERENCES auth.users PRIMARY KEY,
  full_name    text,
  phone        text,
  address      text,
  month_start  integer DEFAULT 1,
  notif_on     boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_profile" ON profiles
  FOR ALL USING (auth.uid() = id);

-- 2. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS categories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users,
  name        text NOT NULL,
  type        text CHECK (type IN ('income','expense','both')),
  icon        text,
  color       text DEFAULT '#3b82f6',
  is_preset   boolean DEFAULT false,
  sort_order  integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_read" ON categories
  FOR SELECT USING (is_preset = true OR auth.uid() = user_id);
CREATE POLICY "categories_write" ON categories
  FOR ALL USING (auth.uid() = user_id);

-- 3. TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS transactions (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid REFERENCES auth.users NOT NULL,
  type             text CHECK (type IN ('income','expense')) NOT NULL,
  amount           numeric(12,2) NOT NULL,
  category_id      uuid REFERENCES categories(id),
  note             text,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_transactions" ON transactions
  FOR ALL USING (auth.uid() = user_id);

-- 4. BUDGETS TABLE
CREATE TABLE IF NOT EXISTS budgets (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid REFERENCES auth.users NOT NULL,
  category_id    uuid REFERENCES categories(id),
  monthly_limit  numeric(12,2) NOT NULL,
  month          integer,
  year           integer,
  alert_pct      integer DEFAULT 80,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_budgets" ON budgets
  FOR ALL USING (auth.uid() = user_id);

-- 5. TODOS TABLE
CREATE TABLE IF NOT EXISTS todos (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users NOT NULL,
  title         text NOT NULL,
  reminder_date date NOT NULL,
  reminder_time time DEFAULT '09:00',
  amount        numeric(12,2),
  is_done       boolean DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_todos" ON todos
  FOR ALL USING (auth.uid() = user_id);

-- 6. SMART NOTICES TABLE
CREATE TABLE IF NOT EXISTS smart_notices (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users NOT NULL,
  message    text NOT NULL,
  type       text DEFAULT 'info' CHECK (type IN ('info','warning','success')),
  is_read    boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE smart_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_notices" ON smart_notices
  FOR ALL USING (auth.uid() = user_id);

-- ================================================
-- PRESET CATEGORIES (সব ইউজারের জন্য)
-- ================================================

INSERT INTO categories (name, type, icon, is_preset, sort_order) VALUES
  ('বাজার / খাবার', 'expense', '🍚', true, 1),
  ('বাড়ি ভাড়া',    'expense', '🏠', true, 2),
  ('বিল',           'expense', '⚡', true, 3),
  ('চিকিৎসা',      'expense', '💊', true, 4),
  ('শিক্ষা',        'expense', '📚', true, 5),
  ('যাতায়াত',      'expense', '🚌', true, 6),
  ('পোশাক',         'expense', '👗', true, 7),
  ('মোবাইল',        'expense', '📱', true, 8),
  ('ধর্মীয়',       'expense', '🕌', true, 9),
  ('বিনোদন',        'expense', '🎉', true, 10),
  ('পারিবারিক',    'expense', '🤲', true, 11),
  ('মেরামত',        'expense', '🛠️', true, 12),
  ('বেতন',          'income',  '💼', true, 1),
  ('ব্যবসায়িক আয়', 'income', '🏪', true, 2),
  ('ভাড়া আয়',     'income',  '🏘️', true, 3),
  ('ফ্রিল্যান্স',  'income',  '📦', true, 4),
  ('উপহার',         'income',  '💸', true, 5),
  ('বিনিয়োগ',      'income',  '📈', true, 6)
ON CONFLICT DO NOTHING;

-- ================================================
-- INDEXES (performance)
-- ================================================
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON transactions(user_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_smart_notices_user_unread
  ON smart_notices(user_id, is_read) WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_todos_user_date
  ON todos(user_id, reminder_date) WHERE is_done = false;

-- ================================================
-- Auto-create profile on signup trigger
-- ================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, phone)
  VALUES (new.id, new.phone)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
