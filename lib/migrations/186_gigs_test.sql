-- 186 (2026-11-21): test gigs. A gig Teddy posts with "Test only" ticked never
-- alerts members and never shows on the members' board; it opens only by direct link.
alter table gigs add column if not exists is_test boolean not null default false;
notify pgrst, 'reload schema';
