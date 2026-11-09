-- 183 — WHO PAID for an add-on line, when it isn't the booker (2026-11-08).
--
-- A regular on someone else's booking wants to pay for the strobe he added.
-- Add Charge could only charge the BOOKER's card or text the BOOKER a link, so
-- the receipt, the reminder texts and any rewards all went to the wrong person.
-- These columns record the payer on the line itself; NULL = the booker paid
-- (every row before this migration, and every normal charge after it).
--
-- payer_name / payer_phone are stored even when payer_customer_id is set, so a
-- later reminder still reaches the number the link was sent to, and a payer
-- with no customer record ("someone new") is still identifiable.

alter table booking_add_ons add column if not exists payer_customer_id uuid references customers(id) on delete set null;
alter table booking_add_ons add column if not exists payer_name  text;
alter table booking_add_ons add column if not exists payer_phone text;
alter table booking_add_ons add column if not exists payer_email text;

notify pgrst, 'reload schema';
