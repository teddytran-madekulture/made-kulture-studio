-- 188 — CLIENT GIGS (2026-11-23). Any signed-in customer can post a PAID gig
-- ("need a photographer for a birthday") from /account/hire, without a
-- directory profile. posted_by = 'client'. It waits for Teddy's approval like a
-- brand post, then runs exactly like a studio-posted company gig: applicants
-- reach the customer through the private manage link + email relay, so no
-- contact details change hands. poster_id is the customer, so they can see
-- their own posts.
--
-- Creatives can opt out of alerts for client gigs (brands/companies only):
-- customer_profiles.gig_alerts_clients, default on.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.gigs'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%posted_by%'
  loop
    execute format('alter table public.gigs drop constraint %I', c);
  end loop;
end $$;

alter table public.gigs add constraint gigs_posted_by_check
  check (posted_by in ('member','studio','client'));

alter table public.customer_profiles add column if not exists gig_alerts_clients boolean not null default true;
