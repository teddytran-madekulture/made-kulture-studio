-- 139_listing_moderation.sql — keeping Services listings honest (2026-10-03).
-- 1. Max 8 search tags per listing, enforced in the DB (vendors write their own
--    rows directly, so a UI-only cap could be skipped). NOT VALID = existing rows
--    aren't re-checked; every new insert/update is.
-- 2. review_hold: a listing pulled from Services/profiles pending Teddy's review
--    — set by 3 member reports or by Teddy. Vendors can toggle their own
--    `active`, but must NOT be able to clear a review hold, so a trigger pins
--    the review columns for anyone who isn't the service role.
-- 3. listing_reports: anonymous member reports, one per member per listing
--    (same shape as portfolio_reports, migration 131).
alter table service_listings drop constraint if exists service_listings_tags_max;
alter table service_listings add constraint service_listings_tags_max check (cardinality(tags) <= 8) not valid;

alter table service_listings add column if not exists review_hold        boolean not null default false;
alter table service_listings add column if not exists review_hold_reason text;      -- 'reports' | 'admin'
alter table service_listings add column if not exists reviewed_at        timestamptz;

create or replace function protect_listing_review() returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.review_hold        := old.review_hold;
    new.review_hold_reason := old.review_hold_reason;
    new.reviewed_at        := old.reviewed_at;
  end if;
  return new;
end $$;
drop trigger if exists listing_review_protect on service_listings;
create trigger listing_review_protect before update on service_listings
  for each row execute function protect_listing_review();

create table if not exists listing_reports (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references service_listings(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason      text not null,          -- misleading | off_topic | spam | inappropriate | other
  note        text,
  status      text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  unique (listing_id, reporter_id)
);
create index if not exists listing_reports_open_idx on listing_reports (listing_id) where status = 'open';
alter table listing_reports enable row level security;   -- service-role only

notify pgrst, 'reload schema';
