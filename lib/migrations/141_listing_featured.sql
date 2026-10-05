-- 141_listing_featured.sql — Teddy's FEATURE switch for Services listings (2026-10-05).
--
-- The directory home now has a "Production services" row. A featured listing
-- leads it (newest feature first), then the newest others. Only the admin
-- (service role) may set it: vendors write their own rows directly under RLS,
-- so without the trigger below a vendor could feature themselves.

alter table service_listings add column if not exists featured    boolean not null default false;
alter table service_listings add column if not exists featured_at timestamptz;

-- Same pin as migration 139's review columns, now covering featured too.
create or replace function protect_listing_review() returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.review_hold        := old.review_hold;
    new.review_hold_reason := old.review_hold_reason;
    new.reviewed_at        := old.reviewed_at;
    new.featured           := old.featured;
    new.featured_at        := old.featured_at;
  end if;
  return new;
end $$;

-- A vendor's INSERT can't arrive pre-featured either.
create or replace function protect_listing_insert() returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.featured    := false;
    new.featured_at := null;
  end if;
  return new;
end $$;
drop trigger if exists listing_insert_protect on service_listings;
create trigger listing_insert_protect before insert on service_listings
  for each row execute function protect_listing_insert();

notify pgrst, 'reload schema';
