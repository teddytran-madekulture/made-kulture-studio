-- 138_listing_tags.sql — search tags on Production Services listings (2026-10-03).
-- Lets the directory's Services page find "snake" on a listing titled
-- "Exotic Animal Handling". Lower-cased, trimmed, max 15 per listing (app-side).
alter table service_listings add column if not exists tags text[] not null default '{}';
create index if not exists service_listings_tags_idx on service_listings using gin (tags);

notify pgrst, 'reload schema';
