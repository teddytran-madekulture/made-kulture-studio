-- Google-review request automation.
--
-- After a session ends, /api/cron/review-requests texts + emails the customer a
-- direct link to leave a Google review (2-3 hours after checkout), with one
-- email follow-up a few days later if the link was never clicked. Settings
-- (the review URL + on/off switch) live in site_settings and are edited from
-- Admin -> Settings -> Emails.

-- Per-booking send/click stamps.
alter table bookings add column if not exists review_request_sent_at  timestamptz;
alter table bookings add column if not exists review_followup_sent_at timestamptz;
alter table bookings add column if not exists review_clicked_at       timestamptz;

-- ── SETUP (run once, in the Supabase SQL editor) ──────────────────────────────
-- STEP 1 — extensions (safe to re-run; already enabled by migration 043):
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- STEP 2 — schedule the job. Replace YOUR_CRON_SECRET with the CRON_SECRET
-- value from Vercel (Settings -> Environment Variables) / Bitwarden. Deploy the
-- code FIRST so the endpoint exists before the cron starts calling it.
select cron.schedule(
  'review-requests',
  '*/30 * * * *',
  $$
    select net.http_get(
      url     := 'https://made-kulture-studio.vercel.app/api/cron/review-requests',
      headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
    );
  $$
);

-- ── Useful management commands ────────────────────────────────────────────────
-- See scheduled jobs:        select * from cron.job;
-- See recent run history:    select * from cron.job_run_details order by start_time desc limit 20;
-- Pause/remove the job:      select cron.unschedule('review-requests');
