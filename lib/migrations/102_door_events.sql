-- ============================================
-- Migration 102 — the door starts talking back
-- ============================================
-- Until now igloohome has been write-only: we mint an algoPIN and never learn
-- whether anyone used it. The lock validates a code offline against its own
-- clock, so nothing phoned home. With a Bridge on each door the lock's activity
-- log reaches us as a webhook (event type 5), and this table is where it lands.
--
-- Why store the raw event at all, rather than just stamping checked_in_at:
--   1. It is the ONLY forensic record. A guest reports being locked out, or a
--      session shows no arrival — without this there is nothing to look at.
--   2. It carries facts nothing else in the system has: wrong-PIN attempts
--      (logType 16), attempted break-in (53), key/thumbturn entry (51/52).
--   3. The Bridge's log cadence is UNKNOWN (asked igloohome 2026-09-03).
--      entry_at vs received_at is how we measure it. Do not drop either column.
--
-- WARNING: pin is a live door code. This table is service-role only — no RLS
-- policy is added, which in this database means nothing but the service key
-- reads it (same pattern as the payroll tables in user-scoped-write-sweep).
-- Do NOT expose it through PostgREST to anon, and do not render it in /admin
-- next to a customer name without thinking about who is standing behind them.

create table if not exists door_events (
  id            uuid primary key default gen_random_uuid(),

  -- Straight from the webhook payload.
  event_id      text,                    -- payload.event.id — igloohome's own id
  device_id     text,                    -- payload.product.id — WHICH lock
  log_type      integer not null,        -- 19/22 = duration PIN used, 16 = wrong PIN, 53 = break-in
  entry_at      timestamptz not null,    -- when the LOCK says it happened (entryDate, epoch seconds)
  received_at   timestamptz not null default now(),  -- when the webhook reached us
  pin           text,                    -- the code used, when the log type carries one
  raw           jsonb not null,          -- the whole activity-log object, nothing discarded

  -- What we resolved it to. Null is a legitimate, expected state: a staff
  -- master PIN, a thumbturn entry, or a code we could not match to a booking.
  booking_id    uuid references bookings(id) on delete set null,
  checked_in    boolean not null default false  -- true only if THIS event set checked_in_at
);

-- WARNING: RLS must be ENABLED, not merely left without policies. Those are two
-- different states. With RLS off, the anon key reads this table freely — and
-- every current door code with it. Enabled + zero policies is the service-role-
-- only shape the payroll tables use (worker_profiles, shifts, onboarding_*).
-- The Supabase SQL editor warns about this on create; that warning is correct.
alter table door_events enable row level security;

-- The retry guard. igloohome may redeliver, and the same activity log can also
-- arrive twice if the Bridge re-reports it. A lock cannot produce two identical
-- events at the same second with the same code, so this is safe to dedupe on.
-- Partial, because pin is null for the log types that carry no code.
create unique index if not exists door_events_dedupe_idx
  on door_events(device_id, entry_at, log_type, pin)
  where pin is not null;

-- The two ways this table gets read: "what happened at the door lately" and
-- "what happened during this booking".
create index if not exists door_events_entry_at_idx on door_events(entry_at desc);
create index if not exists door_events_booking_idx  on door_events(booking_id)
  where booking_id is not null;

-- Matching an event to a booking is a lookup BY DOOR CODE, which no index has
-- ever served — door_code was only ever written, never searched.
create index if not exists bookings_door_code_idx      on bookings(door_code)
  where door_code is not null;
create index if not exists bookings_door_code_back_idx on bookings(door_code_back)
  where door_code_back is not null;

comment on table door_events is
  'Lock activity from the igloohome Bridge webhook. Append-only forensic log; '
  'also the source of automatic check-in. Contains live door codes — service role only.';
comment on column door_events.received_at is
  'Webhook arrival. entry_at minus this IS the Bridge log latency — the open question as of 2026-09-03.';

-- PostgREST caches table shape; without this, writes can 400/500 while reads
-- look fine right after a table is added.
notify pgrst, 'reload schema';
