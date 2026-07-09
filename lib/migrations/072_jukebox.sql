-- ============================================
-- Migration 072 — Studio Jukebox (guests request → Teddy approves → plays)
-- ============================================
-- The APP owns the music queue; guests never log into any music service. Each
-- physical area is a "zone" (its own Fire-tablet player + Bluetooth speaker +
-- its own queue). Source is pluggable (youtube now, spotify later). All access
-- goes through service-role API routes, so RLS stays locked (no public policies).

-- ── Zones (one per area / player tablet) ──────────────────────────────────────
create table if not exists jukebox_zones (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,               -- used in the QR + player URL
  name                text not null,                      -- shown to guests ("Main Studio")
  source              text not null default 'youtube',    -- youtube | spotify (phase 3)
  is_open             boolean not null default true,      -- master music on/off for this zone
  explicit_filter     boolean not null default true,      -- best-effort block of explicit titles
  house_playlist_url  text,                               -- YouTube playlist played when queue is empty
  now_playing_id      uuid,                               -- current jukebox_requests row (null = house/idle)
  sort                int not null default 100,
  created_at          timestamptz not null default now()
);

-- ── Requests (the queue) ──────────────────────────────────────────────────────
create table if not exists jukebox_requests (
  id                uuid primary key default gen_random_uuid(),
  zone_id           uuid not null references jukebox_zones(id) on delete cascade,
  source            text not null default 'youtube',
  external_id       text not null,                        -- YouTube video id (or Spotify uri later)
  title             text not null,
  artist            text,                                 -- channel / artist
  thumbnail_url     text,
  duration_sec      int,
  requester_device  text,                                 -- anonymous per-device id (spam guard)
  requester_name    text,                                 -- optional
  status            text not null default 'pending',      -- pending | approved | playing | played | rejected | skipped
  position          int,                                  -- reserved for phase-2 manual reorder
  approved_at       timestamptz,
  played_at         timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists jukebox_requests_zone_status_idx on jukebox_requests (zone_id, status);
create index if not exists jukebox_requests_device_idx on jukebox_requests (requester_device, status);

alter table jukebox_zones    enable row level security;
alter table jukebox_requests enable row level security;

-- ── Seed the two starting zones ───────────────────────────────────────────────
insert into jukebox_zones (slug, name, sort)
select 'main-studio', 'Main Studio', 10
where not exists (select 1 from jukebox_zones where slug = 'main-studio');

insert into jukebox_zones (slug, name, sort)
select 'vanity', 'Office Vanity', 20
where not exists (select 1 from jukebox_zones where slug = 'vanity');

-- June (front-desk agent) learns the jukebox exists.
insert into agent_kb (topic, content)
select 'jukebox',
  'Music/jukebox: guests can request songs from their phone. Scan the jukebox QR at your area (or ask the team), search a song, and submit it — the team approves requests before they play so the vibe stays right for everyone in the shared space. Each area (main studio, office vanity) has its own music.'
where not exists (select 1 from agent_kb where topic = 'jukebox');
