-- Migration 160 — Mini Sessions: bigger groups, billed to the photographer (2026-10-09)
--
-- With allow_extra_guests on, a client may bring more than the included party
-- (up to the set's hard max, 7). Each person over the included number costs a
-- flat fee PER SLOT (studio_settings 'mini_extra_guest_fee', whole dollars),
-- billed to the photographer's chosen card ONCE, after the session ends, by the
-- hourly cron. A declined card falls back to a Square payment link.
-- Extras are always computed live from party size and crew — there is no
-- stored per-client count to drift.
alter table mini_sessions add column if not exists allow_extra_guests boolean not null default false;
alter table mini_sessions add column if not exists extra_card_id text;
alter table mini_sessions add column if not exists extra_square_customer_id text;
alter table mini_sessions add column if not exists extra_charge_status text;   -- null | charging | charged | link_sent | none | review
alter table mini_sessions add column if not exists extra_charge_claimed_at timestamptz;
alter table mini_sessions add column if not exists extra_fee_cents integer;          -- fee agreed when the setting was turned on
alter table mini_sessions add column if not exists extra_charge_cents integer;
alter table mini_sessions add column if not exists extra_payment_id text;
alter table mini_sessions add column if not exists extra_charged_at timestamptz;

insert into studio_settings (key, value)
select 'mini_extra_guest_fee', '5'
where not exists (select 1 from studio_settings where key = 'mini_extra_guest_fee');

-- Days already over before this feature existed: nothing to bill.
update mini_sessions set extra_charge_status = 'none'
where extra_charge_status is null and booking_id in (select id from bookings where end_time < now());

notify pgrst, 'reload schema';
