-- ============================================
-- Migration 091 — Overtime charging: half-hours, overage mode, pay-by-new-card
-- ============================================
-- Three things the extension flow couldn't do before:
--
--   1. HALF HOURS. `hours` was `int`, so a 30-minute overage was rejected by the
--      database even though every price calculation already handled fractions.
--
--   2. OVERAGE vs EXTENSION. An extension moves end_time forward. An overage is
--      time the guest ALREADY used — it's charged, but the booking window must
--      not move (the set may well be booked right after them, which is exactly
--      when running over hurts). `kind` tells the confirm endpoint which one it
--      is looking at.
--
--   3. NO CARD ON FILE. The flow used to refuse outright. Now the guest can key
--      a card in on the confirm page; these columns record what happened so a
--      later look at the row explains itself.

alter table extension_requests
  alter column hours type numeric(4,2);

alter table extension_requests
  add column if not exists kind text not null default 'extend';   -- extend | overage

alter table extension_requests
  add column if not exists created_by text;                        -- 'june' | 'cron' | 'admin'

alter table extension_requests
  add column if not exists paid_new_card boolean not null default false;

-- Keep the two kinds honest.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'extension_requests_kind_check'
  ) then
    alter table extension_requests
      add constraint extension_requests_kind_check
      check (kind in ('extend', 'overage'));
  end if;
end $$;

-- A booking can hold at most one live request at a time; the app cancels the
-- old one before minting a new one, but this makes the intent visible.
create index if not exists extension_requests_pending_idx
  on extension_requests (booking_id, kind, status);

-- PostgREST caches the table shape. Without this, WRITES to the new columns
-- fail with "…column of 'extension_requests' in the schema cache" while reads
-- look perfectly fine.
notify pgrst, 'reload schema';
