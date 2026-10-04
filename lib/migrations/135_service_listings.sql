-- 135_service_listings.sql — Production Services listings (2026-10-03).
--
-- Vendors (vehicle rental, wardrobe rental, catering…) are directory members
-- whose ROLE is in the "Production Services" category (lib/roles.ts). Instead
-- of (or as well as) a portfolio, their profile shows LISTINGS: one row per
-- thing they rent or offer, with photos, a rate and a REQUEST button that
-- opens a directory message. Made Kulture never takes payment for these.
--
-- RLS: a member reads and writes ONLY their own rows. Other members see
-- listings through /api/directory/[id], which runs the members-only gate
-- (lib/directory-access.ts) server-side — so the gate cannot be bypassed by
-- querying the table directly with the anon key.
-- Photos live in the existing public 'portfolios' bucket under
-- <user_id>/listings/…, which the migration-034 folder policy already allows.

create table if not exists service_listings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text not null,
  title       text not null,
  details     text not null default '',
  rate        text not null default '',
  notes       text not null default '',
  photos      text[] not null default '{}',
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists service_listings_user_idx on service_listings (user_id, sort_order);

alter table service_listings enable row level security;
drop policy if exists "listings read own"   on service_listings;
drop policy if exists "listings insert own" on service_listings;
drop policy if exists "listings update own" on service_listings;
drop policy if exists "listings delete own" on service_listings;
create policy "listings read own"   on service_listings for select to authenticated using (auth.uid() = user_id);
create policy "listings insert own" on service_listings for insert to authenticated with check (auth.uid() = user_id);
create policy "listings update own" on service_listings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "listings delete own" on service_listings for delete to authenticated using (auth.uid() = user_id);

-- Hard cap: 12 listings per member (the UI says the same number).
create or replace function enforce_listing_cap() returns trigger language plpgsql as $$
begin
  if (select count(*) from service_listings where user_id = new.user_id) >= 12 then
    raise exception 'Listing limit reached (12).';
  end if;
  return new;
end $$;
drop trigger if exists listing_cap on service_listings;
create trigger listing_cap before insert on service_listings
  for each row execute function enforce_listing_cap();

notify pgrst, 'reload schema';
