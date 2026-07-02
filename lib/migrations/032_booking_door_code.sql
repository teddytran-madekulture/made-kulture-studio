-- Per-booking door codes (igloohome algoPIN). Generated on confirmation and
-- shared with the customer via SMS + email. Nullable so bookings made before
-- the feature (or when generation fails) simply have no code.
alter table bookings add column if not exists door_code text;
alter table bookings add column if not exists door_code_pin_id text;
