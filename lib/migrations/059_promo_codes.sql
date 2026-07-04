-- ============================================
-- Migration 059 — Promo codes (self-serve discount codes)
-- ============================================
-- Percentage or fixed-dollar codes applied at checkout. Guardrails: min spend,
-- total-use cap, per-customer cap, start/expiry window, active toggle.
-- A redemptions log enforces the per-customer limit and gives an audit trail.

create table if not exists promo_codes (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique not null,          -- stored UPPERCASE, matched case-insensitively
  kind               text not null,                 -- 'percent' | 'fixed'
  value              int  not null,                  -- percent (e.g. 20) OR cents off (e.g. 1000 = $10)
  min_cents          int,                            -- minimum order subtotal to qualify (null = none)
  max_uses           int,                            -- total redemptions allowed (null = unlimited)
  uses               int not null default 0,         -- running total
  per_customer_limit int default 1,                  -- max uses per email (null = unlimited)
  starts_at          timestamptz,
  expires_at         timestamptz,
  active             boolean not null default true,
  label              text,                            -- internal note ("Holiday 2026")
  created_at         timestamptz not null default now()
);

create table if not exists promo_redemptions (
  id           uuid primary key default gen_random_uuid(),
  promo_id     uuid not null references promo_codes(id) on delete cascade,
  email        text,                                 -- who redeemed (lowercased)
  booking_id   uuid references bookings(id) on delete set null,
  amount_cents int not null,                          -- discount given
  created_at   timestamptz not null default now()
);
create index if not exists promo_redemptions_promo_idx on promo_redemptions (promo_id, email);

alter table promo_codes enable row level security;
alter table promo_redemptions enable row level security;
