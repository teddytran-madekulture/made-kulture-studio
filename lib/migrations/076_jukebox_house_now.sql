-- ============================================
-- Migration 076 — Jukebox house "now playing" report
-- ============================================
-- The player device (tablet/laptop) knows which house-playlist track is actually
-- on; the server does not. The player POSTs the current house track to
-- /api/jukebox/house-now, which stores it here so the admin console can show the
-- real song under NOW PLAYING instead of a generic "House playlist" label.
--
-- Note: migration 075 (jukebox_zones.paused) was applied directly in Supabase and
-- has no committed file; 076 is the next numbered migration. Idempotent — safe to
-- re-run.

alter table jukebox_zones
  add column if not exists house_now_title  text,
  add column if not exists house_now_artist text,
  add column if not exists house_now_at     timestamptz;
