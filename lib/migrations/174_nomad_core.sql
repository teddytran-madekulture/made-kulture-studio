-- 174 — Nomad phases 2-4: memberships, billing, night bank, stays, sharing,
-- studio blocks, visitors (2026-10-25). Logic lives in lib/nomad.ts.
--
-- Every table: RLS ON, ZERO policies = service role only. Members reach this
-- data only through /api/account/nomad/*, which re-derives who they are from
-- the session. (Same rule as concept_reviews, door_events, etc.)
--
-- Settings live in studio_settings key 'nomad_settings' (JSON), defaults in code.

-- ── Memberships ────────────────────────────────────────────────────────────
create table if not exists nomad_memberships (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  auth_user_id       uuid not null references auth.users(id) on delete cascade,
  email              text not null,
  name               text,
  application_id     uuid references nomad_interest(id) on delete set null,
  -- pending (invited, not started) | active | past_due | paused | ended
  status             text not null default 'pending',
  founding           boolean not null default false,
  dues_cents         integer,                 -- locked rate; null = current setting
  square_card_id     text,                    -- the card the member chose + consented to
  consented_at       timestamptz,             -- recurring-charge + house-rules consent
  rules_version      text,
  started_at         timestamptz,
  paid_through       timestamptz,             -- dues cover up to (not incl.) this instant
  past_due_since     timestamptz,
  charging_at        timestamptz,             -- claim while a dues charge is in flight
  cancel_at_period_end boolean not null default false,
  ended_at           timestamptz,
  admin_notes        text
);
create unique index if not exists nomad_memberships_user_uq on nomad_memberships (auth_user_id);
create index if not exists nomad_memberships_status_idx on nomad_memberships (status, paid_through);
alter table nomad_memberships enable row level security;

-- ── Every dues / extra-night charge ───────────────────────────────────────
create table if not exists nomad_charges (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  membership_id      uuid not null references nomad_memberships(id) on delete cascade,
  kind               text not null,           -- dues | extra_nights
  amount_cents       integer not null,
  period_start       timestamptz,
  period_end         timestamptz,
  stay_id            uuid,
  -- charged | link_sent | paid_link | failed | void (link killed: paid another way)
  status             text not null,
  square_payment_id  text,
  square_order_id    text,                    -- payment-link order (webhook reconciles)
  payment_link_id    text,                    -- to delete the Square link when superseded
  payment_link_url   text,
  error              text
);
create index if not exists nomad_charges_member_idx on nomad_charges (membership_id, created_at desc);
create index if not exists nomad_charges_order_idx on nomad_charges (square_order_id);
alter table nomad_charges enable row level security;

-- ── Night bank (append-only ledger; balance = sum(delta)) ─────────────────
create table if not exists nomad_nights (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  membership_id      uuid not null references nomad_memberships(id) on delete cascade,
  delta              integer not null,
  reason             text not null,           -- accrual | stay | stay_refund | admin
  stay_id            uuid,
  period_key         text,                    -- accrual de-dupe: one accrual per period
  note               text
);
create index if not exists nomad_nights_member_idx on nomad_nights (membership_id);
create unique index if not exists nomad_nights_accrual_uq on nomad_nights (membership_id, period_key) where period_key is not null;
alter table nomad_nights enable row level security;

-- ── Stays ─────────────────────────────────────────────────────────────────
create table if not exists nomad_stays (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  membership_id      uuid not null references nomad_memberships(id) on delete cascade,
  check_in           date not null,           -- Mexico City calendar dates
  check_out          date not null,
  -- private | chosen | any  (who may stay at the same time)
  visibility         text not null default 'chosen',
  share_with         uuid[] not null default '{}',   -- membership ids for 'chosen'
  -- requested (waiting on a host) | confirming (approval mid-charge) | confirmed | declined | cancelled
  status             text not null default 'confirmed',
  host_stay_ids      uuid[] not null default '{}',   -- stays that had to approve this one
  nights_cost        integer not null default 0,     -- bank nights taken
  extra_nights       integer not null default 0,     -- nights beyond the bank
  extra_cents        integer not null default 0,
  door_code          text,                           -- LIVE door code: never in a push
  reminded_at        timestamptz,                    -- pre-arrival email sent
  notes              text,
  cancelled_at       timestamptz,
  constraint nomad_stays_dates check (check_out > check_in)
);
create index if not exists nomad_stays_dates_idx on nomad_stays (check_in, check_out);
create index if not exists nomad_stays_member_idx on nomad_stays (membership_id);
alter table nomad_stays enable row level security;

-- ── Studio room blocks ────────────────────────────────────────────────────
create table if not exists nomad_studio_blocks (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  stay_id            uuid not null references nomad_stays(id) on delete cascade,
  membership_id      uuid not null references nomad_memberships(id) on delete cascade,
  day                date not null,
  start_hour         integer not null,
  hours              integer not null default 4,
  status             text not null default 'booked'   -- booked | cancelled
);
create index if not exists nomad_studio_day_idx on nomad_studio_blocks (day);
alter table nomad_studio_blocks enable row level security;

-- ── Visitors (models, MUAs, collaborators) ────────────────────────────────
create table if not exists nomad_visitors (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  stay_id            uuid not null references nomad_stays(id) on delete cascade,
  membership_id      uuid not null references nomad_memberships(id) on delete cascade,
  day                date not null,
  name               text not null,
  role               text,
  phone              text,
  status             text not null default 'registered'  -- registered | cancelled
);
create index if not exists nomad_visitors_day_idx on nomad_visitors (day);
alter table nomad_visitors enable row level security;

-- ── A tiny lock table: serializes bookings and join approvals ────────────
create table if not exists nomad_locks (
  key        text primary key,
  locked_at  timestamptz not null default now()
);
alter table nomad_locks enable row level security;
