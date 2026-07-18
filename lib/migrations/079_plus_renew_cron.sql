-- Daily Plus-membership renewal job.
--
-- The logic lives at /api/cron/plus-renew: it sends renewal reminders ~7 days
-- before expiry and auto-charges the saved card on/after the renewal date
-- (skipping comp, opted-out, suspended, and no-card members). Runs once a day —
-- scheduled via pg_cron so it doesn't count against Vercel's cron limit.
--
-- ── SETUP (run once, in the Supabase SQL editor) ──────────────────────────────
-- Extensions (safe to re-run):
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule. Replace YOUR_CRON_SECRET with the CRON_SECRET value from Vercel
-- (Settings → Environment Variables) / Bitwarden, and confirm the domain matches
-- production. Deploy the code FIRST so the endpoint exists before the cron calls it.
-- 14:00 UTC ≈ 9:00 AM Central.
select cron.schedule(
  'plus-renew',
  '0 14 * * *',
  $$
    select net.http_get(
      url     := 'https://made-kulture-studio.vercel.app/api/cron/plus-renew',
      headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
    );
  $$
);

-- ── Management ────────────────────────────────────────────────────────────────
-- See jobs:        select * from cron.job;
-- Run history:     select * from cron.job_run_details order by start_time desc limit 20;
-- Remove the job:  select cron.unschedule('plus-renew');
