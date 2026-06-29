-- ============================================
-- Migration 018 — Self check-in / check-out
-- ============================================
-- Records when a customer arrives and leaves, the head count they confirm on
-- arrival, and a per-booking token used for the check-in link / kiosk lookup.

alter table bookings add column if not exists checked_in_at      timestamptz;
alter table bookings add column if not exists checked_out_at     timestamptz;
alter table bookings add column if not exists arrived_guest_count integer;
alter table bookings add column if not exists check_in_token     text;

-- Backfill tokens for existing rows, then make new rows auto-generate one.
update bookings
  set check_in_token = replace(gen_random_uuid()::text, '-', '')
  where check_in_token is null;

alter table bookings
  alter column check_in_token set default replace(gen_random_uuid()::text, '-', '');

create unique index if not exists bookings_check_in_token_idx
  on bookings(check_in_token);
