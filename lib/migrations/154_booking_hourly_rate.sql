-- 154_booking_hourly_rate.sql — the hourly set rate each booking row was SOLD at (2026-10-09).
--
-- Until now nothing on a booking said what an hour cost. Add-time, overtime and
-- the admin edit modal re-derived it from a hardcoded table, so a rate changed in
-- Admin → Products & Pricing — or a Set Drop's own rate, or a depositor discount —
-- could never carry through to them. Checkout now writes this on every row and
-- lib/guest-rate effectiveHourlyRate() reads it first.
--
-- NULL on rows written before this migration: those fall back to the live
-- `sets.rate_per_hour`, which matched the old table to the dollar on 2026-10-09.
--
-- ⚠️ RUN THIS BEFORE PUSHING. Checkout inserts `hourly_rate`; against a missing
-- column the insert fails AFTER the card is charged.

alter table bookings add column if not exists hourly_rate numeric(10,2);

notify pgrst, 'reload schema';
