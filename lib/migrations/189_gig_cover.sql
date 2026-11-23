-- 189 — GIG COVER IMAGE (2026-11-23). An optional photo on a gig, shown on the
-- gig page, the board card and the company's applicant page. Set from the admin
-- form only; files live in the public 'site' bucket under gigs/.
alter table public.gigs add column if not exists cover_url text;
