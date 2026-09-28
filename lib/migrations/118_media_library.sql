-- ============================================
-- Migration 118 — Media Library (2026-09-28)
-- ============================================
-- One place that knows every website photo: set photos + galleries, home-page
-- slots, props, hero banners, and anything uploaded straight into the library.
-- Browsed at Website Editor → Library; the same picker feeds the editors.
--
-- ⚠️ A row is an INDEX of a file, not the file. Existing site photos are
-- imported by URL (lib/media-library.ts syncFromSite, idempotent on `url`), so
-- nothing is copied or moved and every page keeps its current URL.
-- ⚠️ Delete is a 30-day TRASH (deleted_at). Only "delete forever" (or the
-- 30-day purge) removes the storage object, and only when the photo is in the
-- 'site' bucket AND not used anywhere on the site.
--
-- RLS on, ZERO policies: service role only, same as agent_kb.

create table if not exists media_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order int  not null default 100,
  created_at timestamptz not null default now()
);
create unique index if not exists media_categories_name_unique on media_categories (lower(btrim(name)));

create table if not exists media (
  id            uuid primary key default gen_random_uuid(),
  url           text not null,                 -- what pages reference (public URL or /images/… repo path)
  storage_path  text,                          -- 'site' bucket path when we own the file; null for repo files
  thumb_url     text,                          -- small preview for the grid (null ⇒ use url)
  name          text not null default '',
  alt           text not null default '',      -- short description (Google + screen readers)
  tags          text[] not null default '{}',
  category_id   uuid references media_categories(id) on delete set null,
  favorite      boolean not null default false,
  width         int,
  height        int,
  bytes         int,
  source        text not null default 'upload', -- upload | set | site-slot | prop | hero-crop
  deleted_at    timestamptz,                   -- in Trash since; null = live
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists media_url_unique on media (url);
create index if not exists media_live_idx on media (deleted_at, favorite desc, created_at desc);
create index if not exists media_category_idx on media (category_id);

alter table media_categories enable row level security;
alter table media            enable row level security;

notify pgrst, 'reload schema';
