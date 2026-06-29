-- ============================================
-- Migration 015 — Guest-limit pricing knobs (admin-editable)
-- ============================================
-- Seeds the guest-capacity pricing model into studio_settings (same key/value
-- pattern as buyout_rate / ban_message) so the booking flow and the bookings
-- API read them live and Teddy can tune them without a deploy.
--
--   guest_capacity_per_set   guests included in one set's base rate
--   per_person_fee           $/extra guest/hr on a single set (guests 6-7)
--   max_guests_per_set       hard cap on one set (5 included + 2 paid buffer)
--   max_sets_before_buyout   above this many sets, recommend the full buyout
--   guest_penalty_per_head   $/undeclared extra guest charged on the day

insert into studio_settings (key, value)
select v.key, v.value
from (values
  ('guest_capacity_per_set', '5'),
  ('per_person_fee',         '10'),
  ('max_guests_per_set',     '7'),
  ('max_sets_before_buyout', '3'),
  ('guest_penalty_per_head', '50')
) as v(key, value)
where not exists (
  select 1 from studio_settings s where s.key = v.key
);
