-- Migration 161 — Mini Sessions: plan first, book later (2026-10-09)
--
-- A photographer can open a mini day BEFORE booking the studio, to see if
-- clients sign up. A planned day holds NO studio time: it carries the set and
-- window the photographer intends to book; clients see "pending". When the
-- photographer books, they attach the booking and it becomes a normal mini day.
-- An unbooked plan is cancelled automatically once its start time passes.
alter table mini_sessions alter column booking_id drop not null;
alter table mini_sessions add column if not exists planned_set_id uuid references sets(id);
alter table mini_sessions add column if not exists planned_buyout boolean not null default false;
alter table mini_sessions add column if not exists planned_start timestamptz;
alter table mini_sessions add column if not exists planned_end timestamptz;
alter table mini_sessions add column if not exists conflict_notified_at timestamptz;   -- someone else booked the planned time
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mini_sessions_booked_or_planned') then
    alter table mini_sessions add constraint mini_sessions_booked_or_planned
      check (booking_id is not null or (planned_start is not null and planned_end is not null and (planned_set_id is not null or planned_buyout)));
  end if;
end $$;

notify pgrst, 'reload schema';
