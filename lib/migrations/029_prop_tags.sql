-- Adds freeform tags to props for admin search/filtering.
alter table props add column if not exists tags text[] default '{}';

-- GIN index so tag filtering/search stays fast as the catalog grows.
create index if not exists props_tags_gin on props using gin (tags);
