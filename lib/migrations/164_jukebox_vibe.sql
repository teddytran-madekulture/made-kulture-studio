-- ============================================
-- Migration 164 — Jukebox "keep the vibe going"
-- ============================================
-- When the last guest request ends, a YouTube zone keeps playing songs similar
-- to it (YouTube's own Mix for that video, list=RD<videoId>) for 30 minutes
-- instead of dropping straight back to the house playlist — guests were having
-- to keep re-adding songs to hold their energy. A new request always plays
-- first and re-seeds the Mix from itself.
--
-- vibe_enabled   per-zone switch (Admin → Jukebox), ON by default
-- vibe_seed_id   YouTube video id the Mix is built from (null = no vibe)
-- vibe_seed_title shown on the guest page ("based on …")
-- vibe_until     when it hands back to the house playlist. After this the
--                player finishes the track it's on, then switches.
-- "Back to house music" clears seed + until, which switches immediately.
--
-- ⚠️ RUN THIS BEFORE PUSHING. /api/jukebox/state selects these columns; without
-- them it 404s every zone and the tablets stop playing.
-- Idempotent — safe to re-run.

alter table jukebox_zones
  add column if not exists vibe_enabled    boolean not null default true,
  add column if not exists vibe_seed_id    text,
  add column if not exists vibe_seed_title text,
  add column if not exists vibe_until      timestamptz;
