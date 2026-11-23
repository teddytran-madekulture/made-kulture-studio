-- 187 — GIG DRAFTS (2026-11-23). Teddy can save a gig he's posting for an
-- outside company and finish it later. A draft is invisible to members, sends
-- no alerts and no company email; PUBLISH runs the full checks and does all of
-- that at that moment. Castings need no migration (their status has no CHECK).
--
-- The 185 CHECK was created inline, so Postgres named it gigs_status_check —
-- found by definition below rather than by name, so a rename can't break this.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.gigs'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.gigs drop constraint %I', c);
  end loop;
end $$;

alter table public.gigs add constraint gigs_status_check
  check (status in ('draft','pending','live','declined','pulled','filled','closed'));
