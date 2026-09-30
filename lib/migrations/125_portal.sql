-- 125 — PORTAL (2026-09-29)
-- The kiosk's QR hub: a guest scans the set tablet with their phone and gets a
-- page tied to THIS session. First feature: a mood board (public Pinterest board
-- or uploaded photos) shown full screen on the set tablet.
-- One portal per (booking, set) — a buyout has a board per set tablet.
-- Everything is wiped once the booking ends (lib/portal.ts purgeEnded).
-- Service-role only: RLS on, no policies. Uploads live in a PRIVATE bucket and
-- are shown through short-lived signed URLs.
create table if not exists portal_sessions (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,
  booking_id  uuid not null references bookings(id) on delete cascade,
  set_slug    text not null,
  created_at  timestamptz not null default now(),
  unique (booking_id, set_slug)
);
create table if not exists portal_items (
  id            uuid primary key default gen_random_uuid(),
  portal_id     uuid not null references portal_sessions(id) on delete cascade,
  kind          text not null,          -- 'pin' | 'upload'
  url           text,                   -- pin: the i.pinimg.com image
  storage_path  text,                   -- upload: path in portal-media
  created_at    timestamptz not null default now()
);
create index if not exists portal_items_portal_idx on portal_items (portal_id, created_at);
alter table portal_sessions enable row level security;
alter table portal_items    enable row level security;

insert into storage.buckets (id, name, public)
  values ('portal-media', 'portal-media', false)
  on conflict (id) do nothing;
