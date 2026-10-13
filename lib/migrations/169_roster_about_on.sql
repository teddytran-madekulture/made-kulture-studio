-- 169_roster_about_on.sql — which tab carries the second identity (2026-10-12).
--
-- Migration 168 let a roster's company swap into the profile header while the
-- ROSTER tab is open (a photographer's profile that also runs an agency).
-- Neil Jou turned out the other way round: the AGENCY is the main profile (a
-- Vendor account) and his photography studio is the second identity, shown
-- on the PORTFOLIO tab ("Neil Jou Studios"). about_on picks the tab:
--   roster    — header swaps on the roster tab (168's behaviour, the default)
--   portfolio — header swaps on the portfolio tab

alter table company_rosters
  add column if not exists about_on text not null default 'roster'
  check (about_on in ('roster', 'portfolio'));

notify pgrst, 'reload schema';
