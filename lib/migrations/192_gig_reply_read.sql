-- 192 — GIG REPLIES IN MESSAGES + BADGE (2026-11-23). A company's reply to an
-- applicant lives on the gig page (gig_messages), not in Messages, so nothing on
-- the site told the member a reply was waiting. member_read_at = when the
-- applicant last opened that thread; company messages after it are unread.
-- NULL = never opened since applying.
alter table public.gig_applications add column if not exists member_read_at timestamptz;
