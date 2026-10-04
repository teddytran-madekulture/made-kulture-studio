-- 140_listing_price.sql — structured listing prices (2026-10-03).
--
-- The single free-text RATE box gave uneven cards ("800", "$800/day", "DM me")
-- and nothing to sort or filter on. Now a listing has a price (cents), a unit,
-- a "starting at" flag and a short extras line (deposit, delivery, minimums).
-- service_listings.rate is KEPT and written on every save as the formatted
-- display string (lib/listing-rate.ts), so older listings and every reader of
-- `rate` keep working unchanged.

alter table service_listings add column if not exists price_cents  integer;
alter table service_listings add column if not exists price_unit   text;
alter table service_listings add column if not exists price_from   boolean not null default false;
alter table service_listings add column if not exists price_extras text not null default '';

alter table service_listings drop constraint if exists service_listings_price_cents_chk;
alter table service_listings add constraint service_listings_price_cents_chk
  check (price_cents is null or (price_cents >= 0 and price_cents <= 10000000));
alter table service_listings drop constraint if exists service_listings_price_unit_chk;
alter table service_listings add constraint service_listings_price_unit_chk
  check (price_unit is null or price_unit in ('hour','half_day','day','flat','project','quote'));
alter table service_listings drop constraint if exists service_listings_price_extras_chk;
alter table service_listings add constraint service_listings_price_extras_chk
  check (char_length(price_extras) <= 120);

create index if not exists service_listings_price_idx on service_listings (price_cents) where price_cents is not null;

notify pgrst, 'reload schema';
