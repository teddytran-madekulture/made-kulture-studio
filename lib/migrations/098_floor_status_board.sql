-- ============================================
-- Migration 098 — Floor status board
-- ============================================
-- "So I or an employee could see the status of the warehouse without having to
-- constantly walk around." Three states per room: guests inside, ready, or
-- needs cleaning.
--
-- ⚠️ THIS IS NOT `bookings.cleaning_status`. That column is a BILLING decision
-- made after the fact ('charged' | 'waived' — did we bill this customer a
-- cleaning fee). Nothing in this database has ever tracked whether a room is
-- dirty RIGHT NOW. That is what this migration adds.
--
-- ⚠️ THERE IS DELIBERATELY NO STATUS COLUMN. The state is DERIVED at read time:
--
--     a SET      needs cleaning when its last booking ENDED after cleared_at
--     a FACILITY needs cleaning when flagged_at is set and later than cleared_at
--
-- Storing the state would mean a cron to keep it true, a second source of truth
-- for "is this room free", and a column that silently drifts the first time a
-- booking is moved or cancelled. A derived state cannot drift, and there is no
-- job to fail quietly at 3 AM.

create table if not exists floor_areas (
  code          text primary key,          -- 'set-a' … 'restroom-1', 'vanity'
  label         text not null,
  kind          text not null check (kind in ('set', 'facility')),
  -- Sets point at a real bookable set; facilities never do.
  set_id        uuid references sets(id) on delete set null,
  sort_order    int not null default 100,

  cleared_at    timestamptz,
  cleared_by    text,
  cleared_by_id uuid,

  -- Facilities only. A restroom has no bookings, so nothing can ever flag it
  -- automatically — Teddy's call was manual only: red when someone flags it,
  -- green when someone clears it, no timer and no clock.
  flagged_at    timestamptz,
  flagged_by    text,

  constraint floor_areas_set_link check (
    (kind = 'set' and set_id is not null) or (kind = 'facility' and set_id is null)
  )
);

-- Every clear, every flag, and every WRONG PIN.
--
-- ⚠️ The bad_pin rows are not paranoia — they are the rate limiter. The kiosk
-- cannot verify a PIN the way the desk does (the desk knows WHO you are from
-- the locked cookie and checks one hash; a wall tablet has no cookie and must
-- test every active staff member). That makes a 4-digit PIN brute-forceable
-- over a public route, and an in-memory counter CANNOT be the guard: module
-- state on Vercel is per-serverless-instance, which is exactly how the kiosk
-- summon managed to both double-push and silently throttle.
create table if not exists floor_area_events (
  id         uuid primary key default gen_random_uuid(),
  code       text,
  at         timestamptz not null default now(),
  action     text not null check (action in ('clear', 'flag', 'bad_pin')),
  staff_id   uuid,
  staff_name text,
  source     text not null default 'kiosk' check (source in ('kiosk', 'desk'))
);

create index if not exists floor_area_events_recent_idx on floor_area_events (at desc);
create index if not exists floor_area_events_code_idx   on floor_area_events (code, at desc);

-- Locked to the service role. Every read and write goes through a server route;
-- `sets` is publicly readable and these must not inherit that.
alter table floor_areas       enable row level security;
alter table floor_area_events enable row level security;

-- ── Seed the 13 tracked spaces ───────────────────────────────────────────────
-- Ten sets, matched to sets.slug so a renamed set keeps its board tile.
insert into floor_areas (code, label, kind, set_id, sort_order)
select s.slug, upper(s.name), 'set', s.id, coalesce(s.sort_order, 100)
from sets s
where s.slug in ('set-a','set-b','set-c','set-d','concrete','vintage','cottage','watering-hole','the-tank','studio-one')
on conflict (code) do nothing;

-- Two restrooms and the vanity. The vanity is one CORNER of the shared
-- back-of-house space — the rest of that block (private staff, the register,
-- an eventual lounge) is deliberately NOT tracked.
insert into floor_areas (code, label, kind, sort_order) values
  ('restroom-1', 'RESTROOM',  'facility', 201),
  ('restroom-2', 'RESTROOM',  'facility', 202),
  ('vanity',     'VANITY',    'facility', 203)
on conflict (code) do nothing;

-- Start everyone clean rather than opening on a wall of red nobody caused.
update floor_areas set cleared_at = now(), cleared_by = 'setup' where cleared_at is null;

-- PostgREST caches table shape; without this, writes 400/500 while reads look fine.
notify pgrst, 'reload schema';
