-- 145_rate_limits.sql — 2026-10-06 security pass, shared rate limiting.
--
-- Every limiter in the app was an in-memory Map, which on Vercel means one
-- counter PER INSTANCE — advisory at best. This is the one table every
-- public endpoint counts against (lib/rate-limit.ts): a row per hit, counted
-- inside a window, keyed on whatever the route decides (ip, email, user id).
-- Rows older than a day are pruned by the hit path itself, so no cron.
-- RLS enabled, zero policies = service role only.

create table if not exists rate_limit_hits (
  id    bigint generated always as identity primary key,
  key   text not null,
  at    timestamptz not null default now()
);
create index if not exists rate_limit_hits_key_at_idx on rate_limit_hits (key, at desc);
alter table rate_limit_hits enable row level security;

notify pgrst, 'reload schema';
