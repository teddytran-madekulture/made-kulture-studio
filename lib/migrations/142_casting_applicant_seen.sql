-- 142_casting_applicant_seen.sql — "new applicant" badge on the Castings icon (2026-10-05).
-- A casting author sees a gold count of applicants they haven't looked at yet.
-- Opening the casting stamps seen_by_author_at on its rows (via /api/castings/[id]).
alter table casting_participants add column if not exists seen_by_author_at timestamptz;

-- Anything older than a week counts as already seen, so the badge starts
-- with recent applicants only instead of every interest ever recorded.
update casting_participants set seen_by_author_at = now()
  where seen_by_author_at is null and created_at < now() - interval '7 days';

create index if not exists casting_participants_unseen_idx
  on casting_participants (casting_id) where seen_by_author_at is null;

notify pgrst, 'reload schema';
