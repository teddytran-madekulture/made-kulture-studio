-- 170_profile_second_identity.sql — a vendor's OWN work as a second identity (2026-10-13).
--
-- Migrations 168/169 put the "second identity" on company_rosters, so only an
-- account WITH a roster (Neil Jou) could have one. A film lab, a rental house,
-- a caterer who also shoots — none of them has a roster. This moves the
-- PORTFOLIO-tab identity onto the profile itself, self-serve for any vendor:
--   second_label     — renames the PORTFOLIO tab, e.g. "Neil Jou Studios"
--   second_tagline   — the line under the name while that tab is open
--   second_bio       — the bio while that tab is open
--   second_instagram — handle only, no @
--   second_website   — full URL, blank = none
-- All blank by default = nothing swaps, so every existing profile looks the same.
--
-- The roster keeps its OWN identity for the ROSTER tab (168, about_on='roster').
-- Neil's portfolio-side text is copied across, then cleared on the roster so
-- there is exactly one place each tab's identity lives.

alter table customer_profiles
  add column if not exists second_label     text not null default '',
  add column if not exists second_tagline   text not null default '',
  add column if not exists second_bio       text not null default '',
  add column if not exists second_instagram text not null default '',
  add column if not exists second_website   text not null default '';

update customer_profiles p set
  second_label     = r.portfolio_label,
  second_tagline   = r.about_tagline,
  second_bio       = r.about_bio,
  second_instagram = r.about_instagram,
  second_website   = r.about_website
from company_rosters r
where r.owner_id = p.id and r.about_on = 'portfolio';

update company_rosters set
  portfolio_label = '', about_tagline = '', about_bio = '', about_instagram = '', about_website = '', about_on = 'roster'
where about_on = 'portfolio';

notify pgrst, 'reload schema';

-- Check: Neil's row should show his studio name + bio here.
select full_name, account_type, second_label, second_tagline, left(second_bio, 60) as bio_start, second_instagram, second_website
from customer_profiles where second_label <> '' or second_bio <> '';
