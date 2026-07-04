-- ============================================
-- Migration 056 — Delegated payments ("someone else pays")
-- ============================================
-- At checkout, a booker can send a payment link to a third party who covers the
-- bill. The slot is held as bookings.status = 'pending_payment' for a short
-- window (default 30 min). On payment the booking confirms; on expiry a cron
-- sweep cancels the held rows and frees the slot.
--
-- NOTE: 'pending_payment' must also be added to ACTIVE_STATUSES in
--   lib/set-availability.ts and lib/equipment-availability.ts (whitelists),
--   otherwise the held slot/gear is NOT reserved. (Done in code.)

create table if not exists payment_delegations (
  id                uuid primary key default gen_random_uuid(),
  order_group       uuid not null,             -- shared across the held booking row(s)
  booking_ids       uuid[] not null,           -- rows to confirm / cancel together
  payer_name        text,
  payer_contact     text not null,             -- E.164 phone or email
  channel           text not null,             -- 'sms' | 'email'
  amount_cents      int  not null,             -- locked at hold time
  status            text not null default 'pending', -- pending | paid | expired | cancelled | failed
  pay_token         text unique not null,
  square_payment_id text,
  booker_name       text,
  booker_email      text,                      -- who to notify on confirm/expiry
  booker_phone      text,
  reminder_sent_at  timestamptz,               -- ~10-min-left nudge guard
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null
);

create index if not exists payment_delegations_status_idx
  on payment_delegations (status, expires_at);

-- Service-role only (all access is via the service key in API routes), same as
-- extension_requests (migration 055).
alter table payment_delegations enable row level security;

-- Widen the bookings CHECK constraints so the held-row insert is allowed.
-- (Applied live 2026-07-04.) status gains 'pending_payment'; source gains
-- 'website-delegated'. Existing values preserved — this only ADDS values.
alter table bookings drop constraint if exists bookings_status_check;
alter table bookings add constraint bookings_status_check
  check (status = any (array['pending','confirmed','completed','cancelled','no_show','pending_payment']::text[]));

alter table bookings drop constraint if exists bookings_source_check;
alter table bookings add constraint bookings_source_check
  check (source = any (array['website','acuity','peerspace','manual','website-delegated']::text[]));

-- Admin-editable knobs (upsert; safe to re-run).
insert into studio_settings (key, value)
values ('delegated_hold_minutes', '30')
on conflict (key) do nothing;

insert into studio_settings (key, value)
values ('delegated_max_active_per_contact', '2')
on conflict (key) do nothing;

-- ── pg_cron: sweep holds every minute (reminder + expiry) ──────────────────
-- Vercel Hobby crons are daily-only, so (like session-reminder) the frequent
-- sweep runs via pg_cron hitting the API route with the shared CRON_SECRET.
-- Replace <APP_URL> and <CRON_SECRET> before running, or schedule in the
-- dashboard. Requires the pg_cron + pg_net extensions (already enabled for
-- session-reminder).
--
-- select cron.schedule(
--   'payment-holds-sweep',
--   '* * * * *',
--   $$
--   select net.http_get(
--     url    := '<APP_URL>/api/cron/payment-holds',
--     headers:= jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
--   );
--   $$
-- );
