-- ============================================
-- Migration 123 — Credits (résumé) on creator profiles
-- ============================================
-- credits: [{ type, title, role, year, url }] — see lib/credits.ts for the
--          allowed types and limits (validated in /api/account/profile).
-- cv_url:  optional PDF résumé, stored in the public 'avatars' bucket under
--          the member's own folder (<uid>/cv.pdf), same policies as avatars.
alter table customer_profiles add column if not exists credits jsonb not null default '[]'::jsonb;
alter table customer_profiles add column if not exists cv_url  text;
