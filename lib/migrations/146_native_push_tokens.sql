-- 146_native_push_tokens.sql — push notifications for the App Store / Play app (2026-10-07).
-- One row per phone. iOS rows hold the APNs device token; Android rows will
-- hold an FCM token once the Android build ships. Written only through
-- /api/push/native with the service key (RLS on, no policies).
create table if not exists native_push_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  platform     text not null check (platform in ('ios', 'android')),
  token        text unique not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists native_push_user_idx on native_push_tokens (user_id);
alter table native_push_tokens enable row level security;

notify pgrst, 'reload schema';
