-- ============================================
-- Migration 003 — The Tank is a real bookable set
-- ============================================
-- Migration 002 mistakenly seeded "The Tank" as an inactive promo set.
-- It's actually a separate, real pool set ($75/hr, 2-hour minimum), distinct
-- from The Watering Hole. This makes it active with the correct attributes.
-- (You can further edit its description/capacity in the admin Sets Manager.)

update sets
set is_active     = true,
    rate_per_hour = 75,
    min_hours     = 2,
    capacity      = 5
where name = 'The Tank';

-- Safety net: create it if the row somehow doesn't exist.
insert into sets (name, description, rate_per_hour, min_hours, capacity, features, is_active)
select 'The Tank', 'Pool set', 75, 2, 5, '{"Pool"}', true
where not exists (select 1 from sets where name = 'The Tank');
