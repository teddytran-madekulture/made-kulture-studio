-- ============================================================
-- Retime the per-minute pg_cron jobs
-- Run in the Supabase SQL editor. Safe to run more than once.
-- Written 2026-08-01 · REWRITTEN 2026-08-10 (the old version matched nothing)
-- ============================================================
--
-- ⚠️ READ THIS BEFORE RUNNING — the schedules below are ALREADY APPLIED.
--
-- Live state verified 2026-08-02 and re-confirmed 2026-08-10:
--   jobid 2  june-email-poll        */3 * * * *   → /api/cron/agent-email
--   jobid 3  payment-holds-sweep    */3 * * * *   → /api/cron/payment-holds
--   jobid 6  kiosk-escalate         *   * * * *   → /api/cron/kiosk-escalate
--   jobid 4  review-requests        */30 * * * *  → /api/cron/review-requests
--   jobid 1  session-reminder       */5 * * * *   → /api/cron/session-reminder
--
-- This file is kept as a REPAIR TOOL, not a pending change. Running it now is a
-- no-op that re-asserts the intended state. See [[pgcron-job-names]].
--
-- ------------------------------------------------------------
-- ⚠️ WHY THE ORIGINAL VERSION WAS A TRAP
-- ------------------------------------------------------------
-- It matched jobs by NAME:
--
--     where jobname ilike '%agent-email%' or jobname ilike '%agent_email%'
--
-- Two of these jobs are NOT named after the route they call. The agent-email
-- job is named `june-email-poll`, so that pattern matched NOTHING — and because
-- the whole thing was a `for ... loop`, zero matches produced zero rows, zero
-- notices and zero errors. It looked like it worked. June's poll silently
-- stayed at 60 seconds and someone had to spot it by eye.
--
-- ✅ THE FIX: match on the ROUTE IN THE COMMAND, not the job name. `cron.job.
-- command` holds the net.http_get call including the URL, so this stays correct
-- no matter what anyone names a job — and it CANNOT drift from the route the
-- job actually invokes, which is the thing we actually care about.
--
-- The loop also now raises a warning when a target matches nothing, so a future
-- silent miss announces itself instead of hiding.

-- ------------------------------------------------------------
-- STEP 1 — look before you touch. Read this output.
-- ------------------------------------------------------------
select jobid, jobname, schedule, active,
       substring(command from '/api/cron/[a-z-]+') as route
from cron.job
order by jobname;

-- ------------------------------------------------------------
-- STEP 2 — assert the intended schedules.
-- ------------------------------------------------------------
-- agent-email (June's inbound mail poll): every 3 min.
--   A customer's email becomes a draft up to 3 minutes later. That draft waits
--   for a human to approve it anyway, so the delay is invisible to the customer.
--
-- payment-holds (delegated "someone else pays" holds): every 3 min.
--   The reminder window is a full 10 minutes wide, so it still fires; an expired
--   hold just frees the slot up to 3 minutes later than before.

do $$
declare
  target text;
  j      record;
  hits   int;
begin
  foreach target in array array['/api/cron/agent-email', '/api/cron/payment-holds']
  loop
    hits := 0;
    for j in
      select jobid, jobname, schedule from cron.job where command like '%' || target || '%'
    loop
      hits := hits + 1;
      if j.schedule = '*/3 * * * *' then
        raise notice 'OK       % (% , jobid %) already */3', target, j.jobname, j.jobid;
      else
        perform cron.alter_job(j.jobid, schedule => '*/3 * * * *');
        raise notice 'RETIMED  % (% , jobid %) from % to */3', target, j.jobname, j.jobid, j.schedule;
      end if;
    end loop;

    -- The failure the old version hid. Say it out loud.
    if hits = 0 then
      raise warning 'NO JOB FOUND calling % — nothing was changed. Check cron.job by hand.', target;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- DELIBERATELY NOT TOUCHED: kiosk-escalate
-- ------------------------------------------------------------
-- It re-pushes Teddy about an unanswered GET THE TEAM ring, once a minute,
-- giving up after 6 minutes. Widening it to 3 minutes cuts five nudges to one or
-- two — and the point of the job is that a guest standing at the tablet needing
-- a human doesn't get missed. It costs ~9 seconds of CPU per 12 hours. Leave it.

-- ------------------------------------------------------------
-- STEP 3 — confirm. Both targets should read */3, kiosk-escalate every minute.
-- ------------------------------------------------------------
select jobid, jobname, schedule, active,
       substring(command from '/api/cron/[a-z-]+') as route
from cron.job
order by jobname;
