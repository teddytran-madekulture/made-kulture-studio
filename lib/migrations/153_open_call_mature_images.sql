-- ============================================
-- Migration 153 — per-IMAGE 18+ flag on open call entries
-- ============================================
-- Teddy, 2026-10-08: artistic nudity is allowed, but each nude frame must be
-- marked 18+. Those frames are blurred/age-gated for voters and NEVER used on
-- public placements (home page, kiosks, Instagram, email, member profiles).
-- An entry needs at least 3 frames that are NOT 18+, so a winner always has a
-- public-safe version. `mature` (series-level) stays = "has any 18+ frame".

alter table open_call_submissions add column if not exists mature_paths text[] not null default '{}';
