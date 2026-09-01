-- ============================================
-- Migration 100 — record the guest surcharge on the booking
-- ============================================
-- A non-member pays `guest_surcharge_per_hour` (currently 10) on top of the set
-- rate for every set-hour. That money was charged correctly and then FORGOTTEN:
-- it was folded into total_amount with nothing marking it, while base_amount
-- kept only the space value at the BASE rate.
--
-- So nothing on a booking row said a guest rate had ever been applied, and every
-- piece of code that later re-derived a price had no choice but to use the
-- member rate:
--
--   * lib/extensions.ts rateFor() — the SMS extension link, the kiosk ADD TIME
--     button and the admin extension all charged a guest $40/hr to extend a
--     session sold at $50/hr. This one moves real money on real cards.
--   * app/admin/dashboard SET_RATES — the edit modal shows "@ $40/hr" on a guest
--     booking, and undercharges by the surcharge if the duration changes.
--
-- Fix the record and the recomputes stop guessing.
--
-- ⚠️ NULLABLE, and NULL is meaningful: 0 means "member, no surcharge" and NULL
-- means "we do not know what this old row was charged". guest_fee_amount went
-- `not null default 0` in migration 016; copying that here would have written a
-- confident 0 onto thousands of historical rows, which is precisely the wrong
-- answer for a guest booking and indistinguishable from the right one.

alter table bookings
  add column if not exists guest_surcharge_amount numeric;

comment on column bookings.guest_surcharge_amount is
  'Non-member surcharge charged on this row (guest_surcharge_per_hour x set hours). '
  '0 = member rate. NULL = unknown (pre-migration-100 row that could not be inferred safely).';


-- ── Backfill ────────────────────────────────────────────────────────────────
--
-- At insert time a row's arithmetic is exactly:
--     total_amount = base_amount + extras_amount + guest_fee_amount + surcharge
-- so the surcharge is the residual. But total_amount is INCREMENTED afterwards
-- by extensions, overage charges and admin add-charges (see the note at the top
-- of app/admin/dashboard/page.tsx), while base_amount and extras_amount stay
-- put. On a booking that was later extended, the residual is surcharge + the
-- extension, and there is no way to separate them from here.
--
-- So this only fills the rows where the arithmetic is UNAMBIGUOUS, and leaves
-- the rest NULL rather than inventing a number:
--
--   residual = 0                     -> surcharge was 0 and nothing was added
--   residual = per_hour x set_hours  -> that is the surcharge, nothing was added
--   anything else                    -> contaminated or unrecognised, stays NULL
--
-- ⚠️ Deliberately does NOT key off auth_user_id. That column is not proof of
-- membership: app/api/bookings/route.ts sets it by matching the TYPED email
-- against auth.users (`listUsers().find(u => u.email === body.email)`), long
-- after `isMember` was decided from the verified session. Someone who has an
-- account but checks out signed OUT pays the surcharge and still gets
-- auth_user_id populated. Trusting it here would zero exactly the rows that
-- were surcharged.

-- Preview, before anything is written. Run the file and read this first: it is
-- the same three buckets the backfill below uses, so the counts here are exactly
-- what it is about to do. A big UNKNOWN number is expected and fine — those rows
-- keep today's behaviour (member rate) rather than getting a guessed one.
select
  case
    when coalesce(total_amount,0) - coalesce(base_amount,0)
       - coalesce(extras_amount,0) - coalesce(guest_fee_amount,0) = 0
      then 'no surcharge (will set 0)'
    when set_id is not null and base_amount > 0 and end_time > start_time
     and coalesce(total_amount,0) - coalesce(base_amount,0)
       - coalesce(extras_amount,0) - coalesce(guest_fee_amount,0)
       = 10 * (extract(epoch from (end_time - start_time)) / 3600.0)
      then 'guest surcharge (will set)'
    else 'UNKNOWN (left null)'
  end as bucket,
  count(*)
from bookings
where guest_surcharge_amount is null
group by 1
order by 2 desc;


do $$
declare
  per_hour numeric;
  filled_zero  int;
  filled_guest int;
  left_null    int;
begin
  -- Guarded cast: the setting is free text. A stray non-numeric value must not
  -- abort the whole migration, and 10 is the same default the app falls back to.
  select case when value ~ '^[0-9]+(\.[0-9]+)?$' then value::numeric else null end
    into per_hour
    from studio_settings where key = 'guest_surcharge_per_hour';
  if per_hour is null then per_hour := 10; end if;

  -- Pass 1 — residual is exactly zero. No surcharge, nothing added later.
  update bookings
     set guest_surcharge_amount = 0
   where guest_surcharge_amount is null
     and coalesce(total_amount, 0)
       - coalesce(base_amount, 0)
       - coalesce(extras_amount, 0)
       - coalesce(guest_fee_amount, 0) = 0;
  get diagnostics filled_zero = row_count;

  -- Pass 2 — residual is exactly the surcharge this booking's hours imply.
  -- Buyouts (set_id null) are a flat rate and are never surcharged, so they are
  -- excluded; any residual on one of those is something else entirely.
  update bookings
     set guest_surcharge_amount =
           per_hour * (extract(epoch from (end_time - start_time)) / 3600.0)
   where guest_surcharge_amount is null
     and set_id is not null
     and end_time > start_time
     and per_hour > 0
     -- A row with no base_amount has no reconstructable breakdown — its whole
     -- total reads as residual, which could coincidentally equal the surcharge
     -- on a short booking. (app/api/admin/charge never wrote base_amount; fixed
     -- going forward, but the historical rows are still here.) Leave them NULL.
     and base_amount is not null
     and base_amount > 0
     and coalesce(total_amount, 0)
       - coalesce(base_amount, 0)
       - coalesce(extras_amount, 0)
       - coalesce(guest_fee_amount, 0)
       = per_hour * (extract(epoch from (end_time - start_time)) / 3600.0);
  get diagnostics filled_guest = row_count;

  select count(*) into left_null from bookings where guest_surcharge_amount is null;

  raise notice 'migration 100: per_hour=%, set 0 on % rows, set surcharge on % rows, % rows left UNKNOWN (null)',
    per_hour, filled_zero, filled_guest, left_null;
end $$;

-- PostgREST caches table shape; without this, writes can 400/500 while reads
-- look fine right after a column is added.
notify pgrst, 'reload schema';
