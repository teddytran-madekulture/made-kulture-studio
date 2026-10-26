-- 176 — Nomad + Flights (2026-10-26). Optional flight add-on: the member pays
-- the add-on each month, part of it becomes flight credit (capped), the studio
-- books their Houston <-> house flights from it. Logic lives in lib/nomad.ts.
-- RLS ON, ZERO policies = service role only (same rule as 174).

-- Membership: is the add-on on now, and a change waiting for the next renewal.
alter table nomad_memberships add column if not exists flights_enabled boolean not null default false;
alter table nomad_memberships add column if not exists flights_next boolean;   -- null = no change at renewal

-- Each dues charge records how much of it was the flight add-on (0 = none),
-- so a paid payment link knows whether to add flight credit.
alter table nomad_charges add column if not exists flight_cents integer not null default 0;

-- Flight credit ledger (append-only; balance = sum(delta_cents)).
create table if not exists nomad_flight_credit (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  membership_id      uuid not null references nomad_memberships(id) on delete cascade,
  delta_cents        integer not null,
  reason             text not null,      -- addon | flight | flight_refund | to_studio_credit | admin
  period_key         text,               -- addon de-dupe: one credit per paid period
  request_id         uuid,
  note               text
);
create index if not exists nomad_flight_credit_member_idx on nomad_flight_credit (membership_id);
create unique index if not exists nomad_flight_credit_period_uq on nomad_flight_credit (membership_id, period_key) where period_key is not null;
alter table nomad_flight_credit enable row level security;

-- Flight requests: member asks -> studio sends options -> member picks -> studio books.
create table if not exists nomad_flight_requests (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  membership_id      uuid not null references nomad_memberships(id) on delete cascade,
  stay_id            uuid references nomad_stays(id) on delete set null,
  -- requested | options_sent | chosen | booked | cancelled
  status             text not null default 'requested',
  prefs              jsonb not null default '{}'::jsonb,   -- airline, airport, out_time, back_time, bag, notes
  options            jsonb not null default '[]'::jsonb,   -- [{ label, price_cents }]
  chosen_index       integer,
  cost_cents         integer,             -- what the booked flight actually cost
  credit_used_cents  integer not null default 0,
  charged_cents      integer not null default 0,  -- difference charged to the member's card
  confirmation       text,
  admin_note         text,
  options_sent_at    timestamptz,
  chosen_at          timestamptz,
  booked_at          timestamptz,
  cancelled_at       timestamptz
);
create index if not exists nomad_flight_requests_member_idx on nomad_flight_requests (membership_id, created_at desc);
create index if not exists nomad_flight_requests_status_idx on nomad_flight_requests (status);
alter table nomad_flight_requests enable row level security;

notify pgrst, 'reload schema';

-- Nomad -> studio money log. Studio credit that came from Nomad (unused months,
-- leftover flight credit) is paid for out of the NOMAD bank account; when a
-- member spends it on a Houston booking, that amount is owed to the STUDIO
-- account. Usage is computed from credit_ledger (kinds nomad_*); this table
-- records the transfers Teddy has actually made, one row per transfer.
create table if not exists nomad_studio_transfers (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  month              text not null,       -- 'YYYY-MM' (Central) the usage was in
  amount_cents       integer not null,
  note               text
);
create index if not exists nomad_studio_transfers_month_idx on nomad_studio_transfers (month);
alter table nomad_studio_transfers enable row level security;

notify pgrst, 'reload schema';
