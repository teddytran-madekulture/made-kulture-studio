-- 134 — booking_changes (2026-10-02)
--
-- Append-only log of every cancel / reschedule / release-to-credit, who did it,
-- and how much notice they gave. First layer of the late-change meter Teddy
-- asked for on 2026-10-02 (green → orange → red, recovers with completed
-- sessions and time). This migration only RECORDS; nothing reads it yet.
--
-- hours_notice = hours between the change and the session's ORIGINAL start.
-- A change with hours_notice < 48 is a "late change". The meter counts
-- actor = 'customer' rows; admin/desk rows are kept so the history is complete
-- (Teddy moving a session because the customer texted him still shows up).

create table if not exists booking_changes (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid references bookings(id) on delete set null,
  auth_user_id  uuid,
  customer_email text,
  kind          text not null check (kind in ('cancel', 'reschedule', 'release_credit')),
  actor         text not null check (actor in ('customer', 'admin', 'desk', 'system')),
  via           text,                 -- account | manage-link | request-approved | admin | desk
  old_start     timestamptz,
  new_start     timestamptz,          -- reschedules only
  hours_notice  numeric(8,2),         -- negative = after the session started
  credit_cents  int,                  -- credit issued by this change, if any
  created_at    timestamptz not null default now()
);

create index if not exists booking_changes_email_idx   on booking_changes (lower(customer_email), created_at desc);
create index if not exists booking_changes_user_idx    on booking_changes (auth_user_id, created_at desc);
create index if not exists booking_changes_booking_idx on booking_changes (booking_id);

-- Service-role only, like credit_ledger.
alter table booking_changes enable row level security;
