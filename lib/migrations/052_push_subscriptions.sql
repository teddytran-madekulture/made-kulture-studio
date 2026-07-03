-- ============================================
-- Migration 052 — Web Push subscriptions (admin PWA notifications)
-- ============================================
-- Teddy's devices register here when he taps "Enable notifications" in the
-- admin PWA. lib/push.ts fans out to every row and prunes dead endpoints.

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text unique not null,
  keys       jsonb not null,          -- { p256dh, auth }
  user_agent text,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;
