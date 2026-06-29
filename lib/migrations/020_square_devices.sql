-- ============================================
-- Migration 020 — Square Register device pairing
-- ============================================
-- Stores the Square Terminal-API device id for the front-desk Register so the
-- web app can push charges to it (Terminal Checkout). Pairing is a one-time
-- setup done by an owner: create a device code, enter it on the Register, then
-- the paired device id is saved here. One active device is enough for one desk.

create table if not exists square_devices (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,            -- e.g. 'Front Desk Register'
  device_id   text not null,            -- Square Devices API device id
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists square_devices_active_idx on square_devices (is_active) where is_active = true;
