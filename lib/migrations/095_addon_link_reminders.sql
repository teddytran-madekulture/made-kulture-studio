-- 095_addon_link_reminders.sql
--
-- Timestamps so an unpaid payment link can be chased once, automatically.
--
-- Nothing in the app has EVER reminded anyone about an unpaid payment link.
-- All eight cron jobs were checked (agent-email, auto-checkout, kiosk-escalate,
-- payment-holds, plus-renew, reminders, review-requests, session-reminder) and
-- none of them look at booking_add_ons. Combined with the fact that Square
-- payment links never expire, an unpaid link is silent forever: a real $80 one
-- sat unnoticed from Aug 9 until someone happened to query the row.
--
-- Note the machinery already existed for the OTHER payment flow — /api/cron/
-- payment-holds nudges a delegated payer before their hold expires. It was
-- simply never wired to the admin payment link, which is the one actually used.
--
-- `link_sent_at`     — when the link was raised. The 48-hour clock runs off this
--                      rather than a row created_at, which this table may not
--                      have. NULL on every pre-existing row, and the sweep skips
--                      NULLs on purpose: back-dating old links would fire a
--                      surprise burst of texts at customers about charges from
--                      weeks ago. Old links stay a manual job.
-- `reminder_sent_at` — set when the nudge goes out, and checked as a CLAIM so a
--                      retry or an overlapping run can't text someone twice.

alter table booking_add_ons add column if not exists link_sent_at     timestamptz;
alter table booking_add_ons add column if not exists reminder_sent_at timestamptz;

-- The sweep asks for: unpaid, has a link, sent long enough ago, not yet chased.
create index if not exists booking_add_ons_unpaid_link_idx
  on booking_add_ons (paid, link_sent_at)
  where paid = false;

-- Adding columns leaves PostgREST's schema cache stale, which shows up as
-- writes 400ing while reads look fine.
notify pgrst, 'reload schema';
