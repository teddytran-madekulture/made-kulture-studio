-- ============================================
-- Migration 004 — Equipment inventory system
-- ============================================
-- Adds inventory tracking + customer-facing fields to the equipment catalog,
-- and indexes the add-on / bookings tables for fast availability lookups.
-- Off-site (out-of-studio) rental fields are added now but unused until that
-- feature is switched on later.

-- ── Equipment table: inventory + display + off-site-ready fields ──────────────
alter table equipment add column if not exists quantity      int     not null default 1;   -- units owned
alter table equipment add column if not exists description   text;                          -- customer-facing blurb
alter table equipment add column if not exists image_url     text;                          -- optional photo for gear page
alter table equipment add column if not exists sort_order    int     default 0;             -- display ordering within category
alter table equipment add column if not exists allow_offsite boolean not null default false; -- future: off-site rentals
alter table equipment add column if not exists deposit       numeric(10,2) not null default 0; -- future: off-site deposit

-- ── Indexes for the availability engine ───────────────────────────────────────
create index if not exists booking_add_ons_equipment_id_idx on booking_add_ons (equipment_id);
create index if not exists booking_add_ons_booking_id_idx   on booking_add_ons (booking_id);
create index if not exists bookings_time_status_idx         on bookings (start_time, end_time, status);

-- ── Sensible default quantities ───────────────────────────────────────────────
-- Everything defaults to 1 unit. Adjust real counts in the admin Equipment manager.
-- The house Amaran 200x is the only item we know is stocked in multiples.
update equipment set quantity = 4 where name ilike '%Amaran 200x%' and quantity = 1;
