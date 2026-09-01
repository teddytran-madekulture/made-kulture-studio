-- ============================================
-- Migration 101 — let a GUEST reach their own booking
-- ============================================
-- Booking without an account was a one-way door. /api/account/... requires a
-- Supabase session, and a guest booking has auth_user_id null, so the customer
-- had no way to see or move their own session — every change went through Teddy
-- by text. This token is the way back in: it goes in the confirmation email and
-- opens /manage/<token>.
--
-- ⚠️ A SEPARATE TOKEN, not check_in_token. Every booking already carries one of
-- those (migration 018) and reusing it would have saved this migration — but a
-- check-in token is handed to the kiosk lookup, and a token that opens a door
-- must not also move the booking. This is the same reasoning migration 054 used
-- to keep a tour's cancel_token apart from its decision_token: one capability
-- per secret.
--
-- ⚠️ It is a BEARER credential sitting in an inbox forever. What it can do is
-- deliberately narrow — view the booking, and move it under exactly the rules a
-- signed-in customer gets (lib/reschedule.ts). It cannot cancel, cannot spend,
-- cannot see another booking, and reveals no card details. Anyone weighing
-- widening it should read that list again first.

alter table bookings add column if not exists manage_token text;

-- Backfill existing rows, then let new ones generate their own. Same shape as
-- check_in_token in migration 018 — a dashless uuid, 128 bits, not guessable.
update bookings
  set manage_token = replace(gen_random_uuid()::text, '-', '')
  where manage_token is null;

alter table bookings
  alter column manage_token set default replace(gen_random_uuid()::text, '-', '');

-- Unique so a lookup by token can never return two bookings, and indexed
-- because that lookup is the entire hot path of /manage/[token].
create unique index if not exists bookings_manage_token_idx
  on bookings(manage_token);

comment on column bookings.manage_token is
  'Bearer token for the customer-facing /manage/<token> page (view + reschedule only). '
  'Separate from check_in_token on purpose — one capability per secret.';

-- PostgREST caches table shape; without this, writes can 400/500 while reads
-- look fine right after a column is added.
notify pgrst, 'reload schema';
