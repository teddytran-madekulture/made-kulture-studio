-- 087_shift_booking.sql — Tie shifts to bookings.
-- Lets staffing follow the booking calendar: each upcoming booking can be turned
-- into a claimable shift for the exact booked window, so workers only cover real
-- booked times. A shift's booking_id also anchors its clock/photos/timecard to the
-- specific booking. Nullable — hand-posted shifts (no booking) still work.

alter table shifts add column if not exists booking_id uuid references bookings(id) on delete set null;
create index if not exists shifts_booking_idx on shifts (booking_id);
