-- 173 — Nomad application review (2026-10-25)
--
-- Phase 1 of the Nomad backend: Teddy reviews /nomad applications in
-- /admin/nomad. status: new | approved | waitlisted | declined.
-- Waitlist order = reviewed_at (first waitlisted is first in line).
-- invited_at / waitlist_notified_at stamp the one email each status sends, so a
-- second click never re-sends silently.

-- `notes` already holds the applicant's own answer (migration 172); these are Teddy's.
alter table nomad_interest add column if not exists admin_notes text;
alter table nomad_interest add column if not exists reviewed_at timestamptz;
alter table nomad_interest add column if not exists invited_at timestamptz;
alter table nomad_interest add column if not exists waitlist_notified_at timestamptz;

create index if not exists nomad_interest_status_idx on nomad_interest (status, reviewed_at);
