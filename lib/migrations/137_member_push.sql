-- 137_member_push.sql — web push for members (the installable Made Kulture app).
-- One row per device that turned notifications on. Separate from
-- push_subscriptions (migration 052), which is Teddy's admin devices only —
-- mixing them would send customers the owner's alerts.
-- Service-role only: RLS on, no policies (writes go through /api/push/member).
create table if not exists member_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text unique not null,
  keys         jsonb not null,            -- { p256dh, auth }
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists member_push_user_idx on member_push_subscriptions (user_id);
alter table member_push_subscriptions enable row level security;

notify pgrst, 'reload schema';
