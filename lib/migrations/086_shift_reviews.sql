-- 086_shift_reviews.sql — Two-way shift reviews + the data behind reliability.
-- After a shift is done the studio rates the worker and the worker rates the
-- shift. studio_to_worker ratings + attendance history (from shifts: clock-ins,
-- no-shows, late) roll up into each worker's reliability score (computed in
-- lib/reviews.ts, not stored). worker_id is always the shift's worker, so both
-- directions aggregate per worker cleanly.

create table if not exists shift_reviews (
  id          uuid primary key default gen_random_uuid(),
  shift_id    uuid not null references shifts(id) on delete cascade,
  worker_id   uuid references worker_profiles(id) on delete set null,
  direction   text not null check (direction in ('studio_to_worker','worker_to_studio')),
  rating      int  not null check (rating between 1 and 5),
  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (shift_id, direction)
);
alter table shift_reviews enable row level security;   -- service-role only; API enforces scope
create index if not exists shift_reviews_worker_idx on shift_reviews (worker_id);
create index if not exists shift_reviews_shift_idx  on shift_reviews (shift_id);
