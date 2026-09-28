-- 112_addon_credit.sql — studio credit spent on in-studio gear (Add charge).
-- The part of an add-on paid with credit, so removing it returns THAT part as
-- credit and refunds only the card part. 0 = all card (every existing row).
alter table booking_add_ons add column if not exists credit_cents integer not null default 0;
notify pgrst, 'reload schema';
