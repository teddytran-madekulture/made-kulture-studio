-- 131_portfolio_reports.sql — 2026-10-01
-- Portfolio vetting beyond the member's own 18+ toggle.
--
-- 1. explore_hidden: the owner (or 3 member reports) can take a photo OFF the
--    Explore feed without archiving it and without labelling it 18+. It stays on
--    the member's own profile, unblurred. Teddy's rule: 18+ is only for obvious
--    nudity / explicit content — "too much for the Explore grid" is different.
--    explore_hidden_reason: 'admin' (Teddy did it) | 'reports' (auto, 3 reports).
-- 2. reviewed_at: when Teddy last looked at the photo and kept it. Reports made
--    BEFORE this don't count toward auto-hide again.
-- 3. portfolio_reports: anonymous member reports. reporter_id is stored ONLY so
--    one person can report a photo once and can't take it down alone — it is
--    never shown to the photo's owner, and the admin page shows counts and
--    reasons, not names.

alter table portfolio_images add column if not exists explore_hidden        boolean not null default false;
alter table portfolio_images add column if not exists explore_hidden_reason text;
alter table portfolio_images add column if not exists reviewed_at           timestamptz;

create table if not exists portfolio_reports (
  id          uuid primary key default gen_random_uuid(),
  image_id    uuid not null references portfolio_images(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason      text not null,                         -- nudity | sexual | harassment | not_theirs | spam | other
  note        text,
  status      text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  unique (image_id, reporter_id)
);
create index if not exists portfolio_reports_open_idx  on portfolio_reports (image_id) where status = 'open';
create index if not exists portfolio_reports_recent_idx on portfolio_reports (created_at desc);

-- Service-role only (every read/write goes through an API route).
alter table portfolio_reports enable row level security;

notify pgrst, 'reload schema';
