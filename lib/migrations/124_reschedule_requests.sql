-- 124 — reschedule_requests (2026-09-29)
-- A Plus member asking to move a booking into short-notice hours the studio
-- isn't already open for. Nothing on the booking changes until the owner
-- approves via /reschedule/approve/<token> or the dashboard banner.
-- Service-role only: RLS on, no policies.
create table if not exists reschedule_requests (
  id              uuid primary key default gen_random_uuid(),
  token           text not null unique,
  booking_id      uuid not null references bookings(id) on delete cascade,
  customer_email  text,
  customer_name   text,
  set_name        text,
  old_start       timestamptz not null,
  old_end         timestamptz not null,
  new_date        date not null,
  new_start_hour  numeric not null,
  new_start       timestamptz not null,
  new_end         timestamptz not null,
  when_old        text,
  when_new        text,
  status          text not null default 'pending',  -- pending | approving | approved | declined | superseded | expired | failed
  decision_note   text,
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists reschedule_requests_pending_idx on reschedule_requests (status, new_start);
create index if not exists reschedule_requests_booking_idx on reschedule_requests (booking_id);
alter table reschedule_requests enable row level security;
