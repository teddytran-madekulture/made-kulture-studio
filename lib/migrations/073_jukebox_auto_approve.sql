-- ============================================
-- Migration 073 — Jukebox per-zone auto-approve
-- ============================================
-- When a zone has auto_approve = true, guest requests skip the pending step and
-- go straight into the queue (still subject to the explicit-title filter and a
-- per-device cap). No push is sent in that mode.

alter table jukebox_zones add column if not exists auto_approve boolean not null default false;
