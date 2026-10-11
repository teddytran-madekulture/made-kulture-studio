-- 165_company_rosters.sql — Company rosters (2026-10-11).
--
-- A bigger vendor (first case: a model agency) shows its ROSTER of people on
-- its directory profile, synced automatically from the company's OWN website.
-- Nobody types anything in: lib/roster-sync.ts reads the site's public Shopify
-- product feed nightly, and the site stays the one source of truth. Photos are
-- the site's own CDN URLs (hotlinked, never copied), and every talent card
-- links back to that talent's page on the company site, where booking happens.
--
-- status:
--   draft  — synced and previewable in /admin/rosters ONLY. The default, so a
--            roster can be built before the company has said yes.
--   live   — shown on the owner's directory profile (members-only, like
--            everything else in the directory).
--   hidden — not shown and NOT synced (switched off / company said no).
--
-- ⚠️ Youth is never synced. lib/roster-sync.ts drops any product whose tags or
-- type look like a minor (youth/kids/teen/child…). That rule lives in code, not
-- in a per-roster setting, so no admin toggle can switch it off.
--
-- RLS enabled with NO policies = service role only. Members see talent through
-- /api/directory/[id], AFTER the members-only gate.

create table if not exists company_rosters (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  label           text not null default 'Roster',
  source_url      text not null,
  source_kind     text not null default 'shopify' check (source_kind in ('shopify')),
  include_tag     text not null default '',
  status          text not null default 'draft' check (status in ('draft', 'live', 'hidden')),
  last_synced_at  timestamptz,
  last_sync_count integer,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists company_rosters_owner_uq on company_rosters (owner_id);

create table if not exists roster_talent (
  id           uuid primary key default gen_random_uuid(),
  roster_id    uuid not null references company_rosters(id) on delete cascade,
  external_id  text not null,
  name         text not null,
  division     text not null default '',
  cities       text[] not null default '{}',
  bio          text not null default '',
  photos       text[] not null default '{}',
  profile_url  text not null default '',
  active       boolean not null default true,
  sort_order   integer not null default 0,
  synced_at    timestamptz not null default now()
);
create unique index if not exists roster_talent_ext_uq on roster_talent (roster_id, external_id);
create index if not exists roster_talent_roster_idx on roster_talent (roster_id, active, sort_order);

alter table company_rosters enable row level security;
alter table roster_talent  enable row level security;

notify pgrst, 'reload schema';
