-- ============================================
-- Migration 005 — Add-on payment tracking
-- ============================================
-- Lets us tell which equipment add-ons are paid. Gear added during the main
-- booking checkout is paid in that transaction (paid = true). Gear attached to
-- an existing booking is paid via a Square payment link; the Square webhook
-- flips paid = true once payment completes, matched on square_order_id.

alter table booking_add_ons add column if not exists paid            boolean not null default false;
alter table booking_add_ons add column if not exists square_order_id text;

create index if not exists booking_add_ons_square_order_id_idx on booking_add_ons (square_order_id);
