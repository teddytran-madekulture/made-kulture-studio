-- 084_shifts.sql — Shift board (Phase: post → claim).
-- One worker slot per shift. Teddy posts a shift for a role (worker_class); an
-- ACTIVE + CERTIFIED worker of that class claims it. Open = not claimed, not
-- cancelled, still in the future. Clock-in/out, closeout photos, reviews, and
-- reliability come in a later phase and hang off this table.

create table if not exists shifts (
  id            uuid primary key default gen_random_uuid(),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  worker_class  worker_class not null,             -- role this shift needs
  notes         text not null default '',
  claimed_by    uuid references worker_profiles(id) on delete set null,
  claimed_at    timestamptz,
  cancelled_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table shifts enable row level security;       -- service-role only; API enforces per-user scope

create index if not exists shifts_starts_idx  on shifts (starts_at);
create index if not exists shifts_claimed_idx on shifts (claimed_by);
create index if not exists shifts_open_idx     on shifts (worker_class, starts_at)
  where claimed_by is null and cancelled_at is null;
