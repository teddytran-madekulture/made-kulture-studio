-- ============================================
-- Migration 016 — Per-booking guest count + guest fee
-- ============================================
-- Records the party size the customer declared at checkout (the contract) and
-- any per-person buffer fee charged for guests 6-7 on a single set. guest_count
-- is what admin checks against the people who actually show up.

alter table bookings add column if not exists guest_count integer;
alter table bookings add column if not exists guest_fee_amount numeric not null default 0;
