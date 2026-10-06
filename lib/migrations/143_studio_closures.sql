-- 143_studio_closures.sql — time off / blocked time (2026-10-06).
--
-- Until now the only way to keep customers off a day was a FAKE manual
-- booking, which clutters the calendar, counts as a visit, and can mint door
-- codes. Closures are their own thing:
--
--   studio_closures          one-off windows. set_ids NULL = the whole studio,
--                            otherwise just those sets. Full day = 00:00-24:00
--                            Central, partial = any window.
--   studio_holiday_closures  yearly holidays, dates computed in code
--                            (lib/closures.ts). skip_dates opens one year
--                            without turning the holiday off for good.
--
-- Enforced server-side by lib/set-availability.ts (checkout, reschedule,
-- Plus instant-book, short-notice approve) + /api/availability (the grid) +
-- setHeadroom (kiosk ADD TIME). Admin edits/creates are NOT blocked: Teddy
-- can book over his own closure on purpose.
--
-- RLS enabled, zero policies = service role only (same as 098/102/103/105).

create table if not exists studio_closures (
  id           uuid primary key default gen_random_uuid(),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  set_ids      uuid[],                 -- NULL = whole studio
  note         text,                   -- private, admin only
  public_label text,                   -- optional, shown to customers ("Closed for a private event")
  created_at   timestamptz not null default now(),
  constraint studio_closures_window check (ends_at > starts_at)
);
create index if not exists studio_closures_window_idx on studio_closures (starts_at, ends_at);
alter table studio_closures enable row level security;

create table if not exists studio_holiday_closures (
  key        text primary key,
  enabled    boolean not null default true,
  skip_dates date[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table studio_holiday_closures enable row level security;

insert into studio_holiday_closures (key, enabled) values
  ('new_years_day', true), ('easter', true), ('memorial_day', true),
  ('july_4', true), ('labor_day', true), ('thanksgiving', true),
  ('christmas_eve', true), ('christmas', true), ('new_years_eve', true)
on conflict (key) do nothing;

notify pgrst, 'reload schema';
