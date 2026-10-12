-- 167_roster_only_cities.sql — limit a company roster to some cities (2026-10-12).
--
-- Studio clients book a shoot in Houston, so an agency's LA-only or Miami-only
-- models are noise on its directory profile. only_cities lists the cities a
-- roster SHOWS; empty = everyone (the old behaviour, so existing rosters are
-- untouched). A talent stays if ANY of their cities is on the list, so someone
-- tagged Dallas + Houston still shows under Houston.
--
-- ⚠️ This is a DISPLAY filter, applied when the roster is read
-- (lib/roster-sync.ts). The nightly sync still mirrors the whole site, so
-- changing the list takes effect at once with no re-sync and nothing is lost.

alter table company_rosters add column if not exists only_cities text[] not null default '{}';

notify pgrst, 'reload schema';
