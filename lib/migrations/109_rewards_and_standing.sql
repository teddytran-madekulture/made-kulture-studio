-- 109_rewards_and_standing.sql — Made Kulture Rewards + Account Standing (2026-09-27)
--
-- Plans: MK_Rewards_Build_Plan_2026-09-27.docx, MK_Account_Standing_Plan_2026-09-27.docx
-- Everything here is inert until studio_settings.rewards_enabled = 'true'
-- (rewards) or an incident is logged (standing). Safe to run before the push.

-- ── REWARDS ─────────────────────────────────────────────────────────────────
-- The rate is LOCKED at booking time (5 member / 10 Plus) so the number shown at
-- checkout is the number paid, even if Plus lapses before the session.
-- reward_basis_cents = the earnable part of THIS row (set time + gear) actually
-- paid by card, after promo and credit. NULL rate ⇒ this booking never earns.
alter table bookings add column if not exists reward_rate           numeric(5,2);
alter table bookings add column if not exists reward_basis_cents    integer;
-- Written by the nightly payout. reward_paid_at is set even when 0 is paid
-- (with reward_note saying why), so a booking is only ever considered once.
alter table bookings add column if not exists reward_cents          integer;
alter table bookings add column if not exists reward_paid_at        timestamptz;
alter table bookings add column if not exists reward_note           text;
-- Running total taken back by refunds, so a second refund can't over-reverse.
alter table bookings add column if not exists reward_reversed_cents integer not null default 0;

create index if not exists bookings_reward_due_idx
  on bookings (end_time) where reward_rate is not null and reward_paid_at is null;

-- One warning email per account per expiry date (the 30-day notice).
create table if not exists reward_expiry_notices (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  expires_on   date not null,
  sent_at      timestamptz not null default now(),
  primary key (auth_user_id, expires_on)
);
alter table reward_expiry_notices enable row level security;

insert into studio_settings (key, value)
select v.key, v.value
from (values
  ('rewards_enabled',     'false'),  -- the launch-day switch
  ('reward_rate_member',  '5'),
  ('reward_rate_plus',    '10')
) as v(key, value)
where not exists (select 1 from studio_settings s where s.key = v.key);

-- ── ACCOUNT STANDING ────────────────────────────────────────────────────────
-- Standing is CALCULATED from this table (lib/standing.ts), never stored.
-- Nothing is deleted: a mistaken incident is voided with a reason.
create table if not exists customer_incidents (
  id                  uuid primary key default gen_random_uuid(),
  -- No cascade: deleting a customer with incidents must fail loudly.
  -- ⚠️ app/api/admin/customers/dedupe moves these rows before deleting.
  customer_id         uuid not null references customers(id),
  booking_id          uuid references bookings(id) on delete set null,
  occurred_on         date not null,
  category            text not null,
  severity            text not null check (severity in ('minor','moderate','serious','critical')),
  points              integer not null check (points >= 0),
  details             text not null default '',
  photo_urls          jsonb not null default '[]'::jsonb,
  fee_cents           integer,
  logged_by           text not null default 'admin',
  customer_notified_at timestamptz,
  voided_at           timestamptz,
  void_reason         text,
  created_at          timestamptz not null default now()
);
create index if not exists customer_incidents_customer_idx on customer_incidents (customer_id, occurred_on);
alter table customer_incidents enable row level security;   -- service role only, zero policies

-- A suspension that lifts itself. NULL + banned=true ⇒ until lifted by hand.
alter table customers add column if not exists suspended_until timestamptz;

notify pgrst, 'reload schema';
