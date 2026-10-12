-- 168_roster_about.sql — a roster carries its company's OWN identity (2026-10-12).
--
-- First case: Neil Jou runs two businesses from one directory profile — Neil
-- Jou Agency (models, the roster tab) and Neil Jou Studios (his photography,
-- the portfolio tab). When a member opens the agency tab, the profile header
-- swaps to the agency's tagline, bio, Instagram and website; on the portfolio
-- tab it shows his own. The OWNER fills these in from Settings → Edit profile
-- (app/api/account/roster) — the admin only creates the roster.
--
-- All blank by default = the header never swaps, so a roster nobody has
-- described looks exactly as it did before this migration.
--   about_tagline   — the line under the name, e.g. "Model & Talent Agency · Houston"
--   about_bio       — the agency's bio
--   about_instagram — handle only, no @
--   about_website   — blank = the roster's own source site
--   portfolio_label — renames the PORTFOLIO tab on this profile, e.g. "Neil Jou Studios"

alter table company_rosters
  add column if not exists about_tagline   text not null default '',
  add column if not exists about_bio       text not null default '',
  add column if not exists about_instagram text not null default '',
  add column if not exists about_website   text not null default '',
  add column if not exists portfolio_label text not null default '';

notify pgrst, 'reload schema';
