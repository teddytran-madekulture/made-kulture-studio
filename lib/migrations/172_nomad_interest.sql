-- 172 — Nomad interest list (2026-10-25)
--
-- Teddy's member creative-travel program (Mexico City first). /nomad is an
-- UNLISTED page: not in nav, not in the sitemap, noindex. It pitches the idea
-- and collects interest — nothing here takes money or promises a place.
--
-- RLS on, zero policies = service role only (same as concept_reviews).

create table if not exists nomad_interest (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  name          text not null,
  email         text not null,
  phone         text,
  instagram     text,
  role          text not null,
  based_in      text,
  portfolio_url text,
  trips_per_year text,
  notes         text,
  status        text not null default 'new'
);

create index if not exists nomad_interest_created_idx on nomad_interest (created_at desc);

alter table nomad_interest enable row level security;
