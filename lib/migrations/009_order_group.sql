-- ============================================
-- Migration 009 — Multi-set checkout (order grouping)
-- ============================================
-- A customer can now book several sets (each with its own date/time) in one
-- checkout / one payment. Each set is still its own row in `bookings` (so the
-- overlap constraint, Acuity sync, and per-set cancellation all keep working);
-- the rows that were paid together share one `order_group` id.
--
-- Single-set and full-buyout bookings simply leave order_group null.

alter table bookings add column if not exists order_group uuid;

create index if not exists bookings_order_group_idx on bookings (order_group);
