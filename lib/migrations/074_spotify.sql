-- ============================================
-- Migration 074 — Spotify auth (single stored refresh token)
-- ============================================
-- The studio authorizes its own Spotify account once (admin → Connect Spotify).
-- We keep only the refresh token server-side; short-lived access tokens are
-- minted on demand for the laptop player (Web Playback SDK) and for search-side
-- playback control. Guests never authenticate with Spotify.
-- Note: jukebox_zones.source already exists (migration 072) — 'youtube' | 'spotify'.

create table if not exists spotify_auth (
  id              int primary key default 1,
  refresh_token   text,
  scope           text,
  connected_email text,
  updated_at      timestamptz not null default now(),
  constraint spotify_auth_singleton check (id = 1)
);

alter table spotify_auth enable row level security;
