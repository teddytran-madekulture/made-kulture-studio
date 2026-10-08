-- ============================================
-- Migration 150 — Rolling (always-open) Open Calls
-- ============================================
-- Teddy, 2026-10-08: the submission page should be ongoing. Anyone can submit
-- work shot anywhere at Made Kulture, any time; he vets it and the best becomes
-- the featured editorial. Only the special temporary-set calls (The Patient,
-- Christmas…) have a deadline, a vote and a prize — and those may overlap.
--
-- • closes_at becomes optional: a rolling call never closes.
-- • `rolling` calls allow one PENDING entry per member at a time (submit again
--   once the last one is reviewed); contest calls keep one entry per member.
--   That rule now lives in the API, so the unique index from 149 goes.

alter table open_calls alter column closes_at drop not null;
alter table open_calls add column if not exists rolling boolean not null default false;

drop index if exists open_call_submissions_one_per_user;
create index if not exists open_call_submissions_user_idx
  on open_call_submissions (call_id, auth_user_id, status);

insert into open_calls (slug, title, tagline, set_slug, set_name, prize, opens_at, closes_at, rolling, status)
select 'editorial', 'Featured Editorial',
       'Shot something at Made Kulture you''re proud of? Send it in. We review every series, and the best become the featured editorial on madekulture.com and the studio kiosks.',
       null, null, null, now(), null, true, 'open'
where not exists (select 1 from open_calls where slug = 'editorial');

-- Winter Is Coming (the Christmas set): on /submissions as a TBA section until its dates are set.
insert into open_calls (slug, title, tagline, set_slug, set_name, prize, opens_at, closes_at, rolling, status)
select 'winter-is-coming', 'Winter Is Coming', 'Our next limited-run set. Dates, details and the prize are coming soon.',
       null, 'Winter Is Coming', null, now(), null, false, 'announced'
where not exists (select 1 from open_calls where slug = 'winter-is-coming');
