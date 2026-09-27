-- ============================================
-- Migration 108 — Visit history from before the Acuity sync (2026-09-27)
-- ============================================
-- The bookings table only holds Acuity appointments from 2026-02-14 on, when the
-- sync began. Anyone who came before that reads as a newer customer than they
-- are — and someone who came often before February but not since reads as a
-- FIRST VISIT, which is the one wrong answer that matters.
--
-- This stores two facts per EMAIL, pulled once from Acuity's history: how many
-- visits before the bookings table begins, and the last one. It deliberately
-- does NOT insert old appointments as bookings (they would land on the calendar,
-- in revenue, and — with retired appointment types — as phantom full-studio
-- buyouts), and it never touches the customers table (the existing sync
-- overwrites current names/phones with Acuity's older copies).
--
-- Keyed on lowercased email so it applies to any customer row with that email,
-- including ones created later. Re-running the import overwrites it: idempotent.

create table if not exists customer_prior_visits (
  email        text primary key,            -- lowercased
  visits       int  not null check (visits >= 0),
  first_visit  timestamptz,
  last_visit   timestamptz,
  last_set     text,
  source       text not null default 'acuity',
  imported_at  timestamptz not null default now()
);

-- Server-only, like the other customer tables: RLS ON with zero policies.
-- (Off and un-policied are different states — see migration 102.)
alter table customer_prior_visits enable row level security;
