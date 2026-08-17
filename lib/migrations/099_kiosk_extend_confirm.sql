-- ============================================
-- Migration 099 — prove it's the guest before the wall tablet charges a card
-- ============================================
-- The kiosk ADD TIME flow charged the card on file straight from the tablet
-- whenever `hasCardOnFile` was true. The server only ever re-derived WHICH
-- booking was in the room, never WHO was tapping — so anyone standing at a set
-- tablet during someone's session could add time to that guest's card.
--
-- Fix: a kiosk-originated confirm must now carry the last 4 digits of the phone
-- number on the booking. This column counts wrong tries so a 4-digit secret on
-- a public route can't be brute-forced.
--
-- ⚠️ Counted in the DATABASE, not module memory — Vercel module state is
-- per-serverless-instance, which is exactly how the kiosk summon managed to
-- both double-push and silently throttle.

alter table extension_requests
  add column if not exists confirm_attempts int not null default 0;

-- PostgREST caches table shape; without this, writes can 400/500 while reads
-- look fine right after a column is added.
notify pgrst, 'reload schema';
