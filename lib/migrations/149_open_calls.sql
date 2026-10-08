-- ============================================
-- Migration 149 — Open Calls (featured-editorial submissions)
-- ============================================
-- An Open Call is tied to a temporary set (The Patient, Oct 2026; a Christmas
-- set later). Members shoot on it, submit their best images, Teddy vets every
-- submission and shortlists, directory members vote, the winner becomes the
-- featured editorial and gets a prize (a free year of Plus for The Patient).
--
-- Teddy's rule: no "tag us to be featured" — work is SUBMITTED and VETTED.
-- Nothing a member uploads is public until he shortlists it.
--
-- Voting (open_call_votes) is a later migration; the window columns live here
-- so the page can already say when voting happens.

create table if not exists open_calls (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,          -- /open-call/<slug>
  title            text not null,                 -- THE PATIENT
  tagline          text,                          -- one line under the title
  set_slug         text,                          -- the set entries must be shot on (sets.slug)
  set_name         text,                          -- display name, e.g. "The Patient in Studio One"
  prize            text,                          -- shown on the page
  cover_url        text,                          -- public image URL for the page header
  opens_at         timestamptz not null default now(),
  closes_at        timestamptz not null,          -- submissions close
  voting_opens_at  timestamptz,
  voting_closes_at timestamptz,
  max_images       int not null default 8,
  status           text not null default 'open',  -- draft | open | closed | voting | decided
  created_at       timestamptz not null default now()
);

create table if not exists open_call_submissions (
  id            uuid primary key default gen_random_uuid(),
  call_id       uuid not null references open_calls(id) on delete cascade,
  auth_user_id  uuid not null,                    -- submitter (must be signed in)
  email         text not null,                    -- submitter email at submit time
  title         text not null,                    -- name of the series
  photographer  text not null,                    -- byline (the main credit)
  photographer_ig text,
  credits       jsonb not null default '[]',      -- [{role, name, handle}]
  shoot_date    date,
  note          text,                             -- concept / story, optional
  image_paths   text[] not null default '{}',     -- private bucket open-call-media
  mature        boolean not null default false,   -- submitter flags artistic nudity etc.
  consents_at   timestamptz not null,             -- all four consents ticked at submit
  status        text not null default 'pending',  -- pending | shortlisted | declined | winner | withdrawn
  admin_note    text,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One live entry per member per call (a withdrawn one doesn't count).
create unique index if not exists open_call_submissions_one_per_user
  on open_call_submissions (call_id, auth_user_id) where status <> 'withdrawn';
create index if not exists open_call_submissions_call_idx
  on open_call_submissions (call_id, status, created_at desc);

-- Service-role only: RLS ENABLED with zero policies (see migration 104's warning).
alter table open_calls enable row level security;
alter table open_call_submissions enable row level security;

-- Private bucket. Unshortlisted work is never public; admin and (later) voters
-- see short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('open-call-media', 'open-call-media', false)
on conflict (id) do nothing;

-- The first call. The Patient is bookable through Oct 31; submissions close
-- Nov 30 11:59 PM Central (CST, -06 — DST ended Nov 1); voting Dec 1–7.
insert into open_calls (slug, title, tagline, set_slug, set_name, prize, opens_at, closes_at, voting_opens_at, voting_closes_at, status)
select 'the-patient', 'The Patient',
       'Shoot it by Halloween. Submit your best frames by Nov 30. The directory picks the feature.',
       'studio-one', 'The Patient in Studio One',
       'A free year of Made Kulture Plus, and your series as the featured editorial on madekulture.com and the studio kiosks.',
       '2026-10-01 00:00:00-05', '2026-11-30 23:59:59-06',
       '2026-12-01 00:00:00-06', '2026-12-07 23:59:59-06', 'open'
where not exists (select 1 from open_calls where slug = 'the-patient');
