-- ============================================
-- Migration 017 — Make guest_count meaningful (nullable, no default)
-- ============================================
-- bookings.guest_count pre-existed as NOT NULL DEFAULT 1, so every booking —
-- including legacy Acuity imports — falsely reported a 1-person party. Make it
-- nullable with no default so an unknown party size reads as "—", and clear the
-- existing fake 1s. Real declared counts (website bookings) populate it going
-- forward; the Acuity sync + webhook now write NULL.
--
-- RUN in Supabase. ✅ (run via SQL editor this session)

alter table bookings alter column guest_count drop default;
alter table bookings alter column guest_count drop not null;
update bookings set guest_count = null where guest_count = 1;
