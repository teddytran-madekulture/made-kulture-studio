-- 081 back-door door code — second igloohome lock (back door).
-- Each confirmed booking mints a second algoPIN on the back-door lock for the
-- same window; algoPINs are lock-specific so this is a distinct code from the
-- front door. Dormant until IGLOOHOME_DEVICE_ID_BACK is set in Vercel.

alter table bookings add column if not exists door_code_back text;
alter table bookings add column if not exists door_code_back_pin_id text;
