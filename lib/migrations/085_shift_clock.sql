-- 085_shift_clock.sql — Shift clock-in/out + closeout photos.
-- Hangs off 084_shifts. A claimed worker clocks in (unlocks 30 min before start,
-- stays open through the end), snaps closeout photos as proof-of-work, and can't
-- clock out until at least one closeout photo is in. Worked hours (clock_in →
-- clock_out) become the source for the future Square Payroll timecard sync.

-- Clock stamps on the shift itself (one worker per shift, so columns are fine).
alter table shifts add column if not exists clock_in_at  timestamptz;
alter table shifts add column if not exists clock_out_at timestamptz;

-- Closeout photos, attributed + timestamped, tied to the shift.
create table if not exists shift_photos (
  id           uuid primary key default gen_random_uuid(),
  shift_id     uuid not null references shifts(id) on delete cascade,
  worker_id    uuid references worker_profiles(id) on delete set null,
  storage_path text not null,                 -- object path inside the shift-media bucket
  caption      text not null default '',
  created_at   timestamptz not null default now()
);
alter table shift_photos enable row level security;   -- service-role only; API enforces scope
create index if not exists shift_photos_shift_idx on shift_photos (shift_id);

-- Private bucket for closeout photos (proof-of-work / cleaning-fee-dispute evidence).
-- Not public: all writes + reads go through server APIs using the service role,
-- which bypasses storage RLS, so no per-user object policies are needed here.
insert into storage.buckets (id, name, public)
  values ('shift-media', 'shift-media', false)
  on conflict (id) do nothing;
