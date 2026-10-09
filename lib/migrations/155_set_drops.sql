-- 155_set_drops.sql — SET DROPS: pre-reserve a temporary set before it is built (2026-10-09).
--
-- A drop is announced, customers put down a refundable deposit, and Teddy
-- presses GO (build it: deposits become studio credit + perks) or CANCEL
-- (refund / credit / customer's choice). Every drop has its OWN `sets` row, so
-- its bookings, rate and history never touch an existing set. A drop may also
-- REPLACE an existing room for its run dates — done with an ordinary
-- studio_closures row (migration 143) on that room, so every booking path that
-- already respects closures keeps the physical room from being double-sold.
--
-- Spec: MK_Set_Drops_Spec_2026-10-09_v2.docx. Code: lib/set-drops.ts.
-- RLS enabled, zero policies = service role only (same as 098/102/103/105/143).

create table if not exists set_drops (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  name                 text not null,
  tagline              text,
  description          text,
  hero_url             text,
  gallery              text[] not null default '{}',
  video_url            text,
  video_hero           boolean not null default false,  -- true = the clip plays in the hero (cover image = poster)

  -- draft → pre_reserve → funded | cancelled → archived.
  -- "Pre-reserve closed, awaiting decision" is derived (pre_reserve + deadline passed).
  status               text not null default 'draft'
                         check (status in ('draft','pre_reserve','funded','cancelled','archived')),

  set_id               uuid references sets(id),          -- the drop's own set (inactive until open)
  replaces_set_id      uuid references sets(id),          -- optional room it takes over
  closure_id           uuid references studio_closures(id) on delete set null,
  open_call_id         uuid,                              -- optional open_calls.id

  -- Deposit
  deposit_mode         text not null default 'flat' check (deposit_mode in ('flat','per_hour')),
  deposit_cents        int  not null default 2500 check (deposit_cents >= 0),
  max_hours_per_pledge numeric(5,1) not null default 8,

  -- Goal
  goal_type            text not null default 'people' check (goal_type in ('people','hours','dollars')),
  goal_value           numeric(12,2) not null default 10,
  show_goal            boolean not null default true,

  -- Dates (Central calendar dates for the run; deadline is an instant)
  pre_reserve_ends_at  timestamptz,
  run_starts           date,
  run_ends             date,

  -- Rates for the drop's own set
  rate_per_hour        numeric(10,2) not null default 40,
  min_hours            numeric(4,1)  not null default 1,
  capacity             int not null default 5,

  -- Depositor perks (any mix)
  perk_early_access    boolean not null default true,
  early_access_hours   int not null default 72,
  perk_discount        boolean not null default false,
  discount_kind        text not null default 'percent' check (discount_kind in ('percent','fixed_rate')),
  discount_value       numeric(10,2) not null default 0,     -- percent off, or the fixed hourly rate
  discount_scope       text not null default 'all' check (discount_scope in ('all','pledged_hours')),
  bonus_credit_cents   int not null default 0 check (bonus_credit_cents >= 0),

  -- If it doesn't happen
  cancel_policy        text not null default 'choice'
                         check (cancel_policy in ('refund','credit','choice','decide_later')),
  cancel_resolution    text check (cancel_resolution in ('refund','credit','choice')),

  funded_at            timestamptz,
  early_access_ends_at timestamptz,
  cancelled_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists set_drops_set_idx on set_drops (set_id);
alter table set_drops enable row level security;

create table if not exists set_drop_pledges (
  id                  uuid primary key default gen_random_uuid(),
  drop_id             uuid not null references set_drops(id) on delete restrict,
  auth_user_id        uuid not null,
  customer_email      text not null,
  customer_name       text,
  phone               text,
  hours_wanted        numeric(5,1) not null default 1,
  timing_note         text,
  deposit_cents       int not null check (deposit_cents >= 0),
  square_payment_id   text,
  square_customer_id  text,
  square_card_id      text,
  -- The exact sentences the customer ticked, kept as the evidence for any dispute.
  agreed_terms        text not null,
  agreed_at           timestamptz not null default now(),
  -- active → credited | refunded | pending_choice → credited | refunded
  status              text not null default 'active'
                        check (status in ('active','credited','refunded','pending_choice','refund_failed')),
  credit_cents_issued int not null default 0,
  refund_id           text,
  choice_token        uuid not null default gen_random_uuid(),
  choice_deadline     timestamptz,
  resolved_at         timestamptz,
  created_at          timestamptz not null default now(),
  unique (drop_id, auth_user_id)
);
create index if not exists set_drop_pledges_drop_idx on set_drop_pledges (drop_id);
create unique index if not exists set_drop_pledges_choice_idx on set_drop_pledges (choice_token);
alter table set_drop_pledges enable row level security;

-- June: what a Set Drop is. Specific drops (names, dates, deposits) live on
-- /drops — she points people there rather than quoting numbers that change.
insert into agent_kb (topic, content)
select 'set_drops',
  $kb$SET DROPS: limited-run sets (seasonal/themed) that Made Kulture only builds if enough people want them. Current drops are listed at /drops, each with its own page (/drops/<name>). How it works: (1) a customer reserves with a small deposit while signed in to a free account and says roughly how many hours and when; this is NOT a booking. (2) When reservations close, the studio decides. If it is built, every deposit becomes studio credit on the customer's account (applied automatically at checkout) and people who reserved usually get early access to book their dates first; some drops also give reservers a lower hourly rate. (3) If it is not built, the deposit comes back as described on that drop's page (a refund, studio credit, or the customer's choice) — never promise one outcome without checking the drop's page. Exact dates, deposit and perks are on each drop's page; send people there.$kb$
where not exists (select 1 from agent_kb where topic = 'set_drops');

notify pgrst, 'reload schema';
