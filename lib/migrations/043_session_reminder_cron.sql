-- Trigger for the "15 minutes left" reminder text.
--
-- The reminder logic lives at /api/cron/session-reminder. This schedules a
-- Supabase pg_cron job to ping that endpoint every 5 minutes so the text goes
-- out near the end of each booking. Free, in-house, reliable.
--
-- ── SETUP (run once, in the Supabase SQL editor) ──────────────────────────────
-- STEP 1 — enable the two extensions (safe to re-run):
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- STEP 2 — schedule the job. Replace YOUR_CRON_SECRET with the CRON_SECRET
-- value from Vercel (Settings → Environment Variables) / Bitwarden, and confirm
-- the domain matches your production URL. Deploy the code FIRST so the endpoint
-- exists before the cron starts calling it.
select cron.schedule(
  'session-reminder',
  '*/5 * * * *',
  $$
    select net.http_get(
      url     := 'https://made-kulture-studio.vercel.app/api/cron/session-reminder',
      headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
    );
  $$
);

-- ── Useful management commands ────────────────────────────────────────────────
-- See scheduled jobs:        select * from cron.job;
-- See recent run history:    select * from cron.job_run_details order by start_time desc limit 20;
-- Pause/remove the job:      select cron.unschedule('session-reminder');
