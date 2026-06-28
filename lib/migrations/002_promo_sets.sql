-- ============================================
-- Migration 002 — Promotional / seasonal sets
-- ============================================
-- These are themed sets that only run occasionally (Acuity appointment types
-- that don't match the 9 standard sets). They are seeded INACTIVE so they:
--   1. Are recognized by the Acuity sync (resolves the booking to a real set)
--   2. Stay hidden from customer booking + availability until you flip them on
--
-- Turn one on for its season from the admin Sets Manager (or set is_active = true).
-- Names are matched case-insensitively against the Acuity appointment type, so
-- they must read the same as the Acuity type (minus casing).

insert into sets (name, description, rate_per_hour, min_hours, capacity, features, is_active) values
  ('The Yard',              'Promotional / seasonal set', 40, 1, 5, '{"Promotional"}', false),
  ('The Tank',              'Promotional / seasonal set', 40, 1, 5, '{"Promotional"}', false),
  ('The Patient',           'Promotional / seasonal set', 40, 1, 5, '{"Promotional"}', false),
  ('Winter Is Coming',      'Promotional / seasonal set', 40, 1, 5, '{"Promotional"}', false),
  ('Valentine Powder Room', 'Promotional / seasonal set', 40, 1, 5, '{"Promotional"}', false),
  ('The Trainer',           'Promotional / seasonal set', 40, 1, 5, '{"Promotional"}', false)
on conflict (name) do nothing;
