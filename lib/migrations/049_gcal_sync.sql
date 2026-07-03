-- ============================================
-- Migration 049 — Google Calendar sync
-- ============================================
-- 1. bookings.gcal_event_id — the Google Calendar event mirrored for this
--    booking row (one event per set line), so cancel/reschedule can find it.
-- 2. studio_settings.gcal_sync_enabled — runtime on/off switch, editable from
--    the admin dashboard (Sets view). Seeded ON; the feature stays dormant
--    until the GCAL_* env vars are set in Vercel anyway.

alter table bookings add column if not exists gcal_event_id text;

insert into studio_settings (key, value)
select 'gcal_sync_enabled', 'true'
where not exists (
  select 1 from studio_settings where key = 'gcal_sync_enabled'
);
