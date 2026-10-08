-- ============================================
-- Migration 151 — Open Call voting
-- ============================================
-- Listed directory members vote for ONE shortlisted series per open call
-- during the voting window (The Patient: Dec 1–7). They can change their vote
-- until it closes; entrants can't vote for their own series. Counts are hidden
-- from members until voting ends, and the studio confirms the winner.
--
-- Teddy, 2026-10-08: anyone listed can vote — no directory approval queue — but
-- the admin view splits each series' votes into accounts made BEFORE voting
-- opened vs DURING the vote, so a win built on brand-new accounts is obvious.
-- `voter_new` is decided once, at vote time, from the auth account's created_at.

create table if not exists open_call_votes (
  id             uuid primary key default gen_random_uuid(),
  call_id        uuid not null references open_calls(id) on delete cascade,
  submission_id  uuid not null references open_call_submissions(id) on delete cascade,
  voter_id       uuid not null,
  voter_new      boolean not null default false,   -- account created after voting opened
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (call_id, voter_id)                       -- one vote per member per call
);

create index if not exists open_call_votes_submission_idx on open_call_votes (submission_id);

-- Service-role only: RLS ENABLED with zero policies.
alter table open_call_votes enable row level security;
