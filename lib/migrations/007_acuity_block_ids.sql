-- ============================================
-- Migration 007 — Two-way Acuity sync (outbound block tracking)
-- ============================================
-- When a website booking is made, we create matching "blocks" on the relevant
-- Acuity calendar(s) so the main (Acuity) site can't double-book the same time.
-- We store the Acuity block IDs here so we can remove them if the booking is
-- cancelled. Transition-only: remove once Acuity is retired.

alter table bookings add column if not exists acuity_block_ids jsonb not null default '[]'::jsonb;
