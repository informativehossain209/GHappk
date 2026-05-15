-- =========================================================
-- ঘর খরচ — pg_cron Setup
-- Supabase Dashboard → Database → Extensions → pg_cron enable করুন
-- তারপর এই SQL run করুন
-- =========================================================

-- Step 1: pg_cron extension চালু করুন (Supabase Dashboard থেকে করুন)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step 2: generate-notices cron job (প্রতিদিন রাত ১২টায় BD time = UTC 18:00)
SELECT cron.schedule(
  'generate-notices-daily',        -- job name
  '0 18 * * *',                   -- UTC 18:00 = Bangladesh midnight
  $$
    SELECT net.http_post(
      url    := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-notices',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer YOUR_ANON_KEY'
      ),
      body   := '{}'::jsonb
    );
  $$
);

-- Step 3: daily-notifications cron job (একই সময়ে)
SELECT cron.schedule(
  'daily-notifications-job',
  '5 18 * * *',                   -- UTC 18:05 (generate-notices এর পরে)
  $$
    SELECT net.http_post(
      url    := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-notifications',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer YOUR_ANON_KEY'
      ),
      body   := '{}'::jsonb
    );
  $$
);

-- Step 4: পুরনো (৩০+ দিন) notices cleanup (সপ্তাহে একবার, রবিবার)
SELECT cron.schedule(
  'cleanup-old-notices',
  '0 19 * * 0',                   -- UTC 19:00 Sunday
  $$
    DELETE FROM smart_notices
    WHERE created_at < NOW() - INTERVAL '30 days'
      AND is_read = true;
  $$
);

-- ─────────────────────────────────────────────────────────
-- Scheduled jobs দেখুন:
-- SELECT * FROM cron.job;
--
-- Job delete করুন:
-- SELECT cron.unschedule('generate-notices-daily');
-- ─────────────────────────────────────────────────────────

-- YOUR_PROJECT_REF এবং YOUR_ANON_KEY পরিবর্তন করুন:
-- Project ref: Supabase Dashboard → Settings → API → Reference ID
-- Anon key:    Supabase Dashboard → Settings → API → anon/public key
