-- ============================================================
-- Retime the per-minute pg_cron jobs  (2026-08-01)
-- Run in the Supabase SQL editor. Safe to run more than once.
-- ============================================================
--
-- WHY: three jobs fire 60× an hour, every hour, forever — 1,440 function calls
-- a day each. They're a small slice of the Vercel CPU bill next to the jukebox,
-- but they're free to widen and they run whether or not anything is waiting.
--
-- STEP 1 — see what's actually scheduled. Run this on its own first and read
-- the jobname column; the ALTERs below match on name, so if yours are named
-- differently you'll want to adjust them.

select jobid, jobname, schedule, active
from cron.job
order by jobname;

-- ------------------------------------------------------------
-- STEP 2 — widen the two that tolerate it.
-- ------------------------------------------------------------
--
-- agent-email (June's inbound mail poll): every 1 min → every 3 min.
--   A customer's email now becomes a draft up to 3 minutes later. That draft
--   waits for you to approve it anyway, so the extra couple of minutes is
--   invisible to the customer.
--
-- payment-holds (delegated "someone else pays" holds): every 1 min → every 3 min.
--   The reminder window is a full 10 minutes wide, so it still fires; an expired
--   hold just frees the slot up to 3 minutes later than before.

do $$
declare j record;
begin
  for j in
    select jobid, jobname from cron.job
    where jobname ilike '%agent-email%' or jobname ilike '%agent_email%'
       or jobname ilike '%payment-hold%' or jobname ilike '%payment_hold%'
  loop
    perform cron.alter_job(j.jobid, schedule => '*/3 * * * *');
    raise notice 'retimed % (jobid %) to */3 * * * *', j.jobname, j.jobid;
  end loop;
end $$;

-- ------------------------------------------------------------
-- DELIBERATELY NOT TOUCHED: kiosk-escalate
-- ------------------------------------------------------------
-- It re-pushes you about an unanswered GET THE TEAM ring, once a minute, giving
-- up after 6 minutes. Widening it to 3 minutes would cut that from five nudges
-- to one or two — and the whole point of the job is that a guest standing at
-- the tablet needing a human doesn't get missed. It costs about 9 seconds of
-- CPU per 12 hours. Not worth it. Leave it alone.

-- ------------------------------------------------------------
-- STEP 3 — confirm
-- ------------------------------------------------------------
select jobid, jobname, schedule, active
from cron.job
order by jobname;
