-- Plus membership payment history. The membership STATE (active, started,
-- expires, auto-renew, comp) lives on customers.pricing_overrides as
-- plus / plus_started_at / plus_expires_at / plus_auto_renew / plus_comp — no
-- schema change needed for that. This table records each charge for tracking.
create table if not exists plus_payments (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid,
  customer_email    text,
  amount_cents      integer not null,
  square_payment_id text,
  kind              text not null default 'signup',   -- signup | renewal | manual | comp
  period_start      timestamptz,
  period_end        timestamptz,
  created_at        timestamptz not null default now()
);

alter table plus_payments enable row level security;   -- service-role only

create index if not exists plus_pay_cust_idx on plus_payments (customer_id, created_at desc);
