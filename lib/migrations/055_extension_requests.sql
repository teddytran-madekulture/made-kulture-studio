-- ============================================
-- Migration 055 — Session extension requests (June kiosk → confirm by SMS)
-- ============================================
-- Kiosk identity is never trusted for money: June creates a request here and
-- the CUSTOMER confirms from their own phone (SMS link) before any charge.

create table if not exists extension_requests (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings(id) on delete cascade,
  hours         int not null,
  amount_cents  int not null,
  status        text not null default 'pending',  -- pending | confirmed | expired | failed | cancelled
  confirm_token text unique not null,
  payment_id    text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);
create index if not exists extension_requests_booking_idx on extension_requests (booking_id, status);

alter table extension_requests enable row level security;
