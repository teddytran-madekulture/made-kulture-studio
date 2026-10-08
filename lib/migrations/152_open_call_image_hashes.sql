-- ============================================
-- Migration 152 — duplicate-entry detection for Open Calls
-- ============================================
-- Teddy, 2026-10-08: editorials are made by teams, and two team members could
-- submit the SAME series as two entries (double the shortlist odds, split
-- votes). One series = one entry.
--
-- The browser computes a 64-bit difference hash (dHash) of every image before
-- upload; near-identical images have hashes a few bits apart even after
-- resizing and re-encoding. The submit route REFUSES an entry when 2+ of its
-- images match another member's entry in the same call, and Admin → Open Calls
-- FLAGS any entries sharing even one image.

alter table open_call_submissions add column if not exists image_hashes text[] not null default '{}';
