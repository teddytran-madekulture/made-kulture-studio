-- Migration 158 — Mini Sessions (2026-10-09)
--
-- A photographer turns one of their bookings into a mini-session day: the
-- booked hours are cut into slots, their clients sign up through a share link
-- (no account, never in the directory), and the photographer gets a roster.
-- Made Kulture never touches the clients' money — the photographer collects it.
--
-- ⚠️ Slots are stored as an INDEX into the booking's hours, never as a clock
-- time. A reschedule moves the booking; every slot moves with it for free.
-- Spec: MK_Mini_Days_Spec_2026-10-09.docx

create table if not exists mini_sessions (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null unique references bookings(id) on delete cascade,
  owner_user_id    uuid not null references auth.users(id) on delete cascade,
  title            text,
  note             text,
  price_text       text,
  slot_minutes     integer not null default 20 check (slot_minutes between 5 and 240),
  break_minutes    integer not null default 5  check (break_minutes between 0 and 60),
  crew_count       integer not null default 1  check (crew_count between 1 and 30),
  cutoff_hours     integer not null default 12 check (cutoff_hours between 0 and 168),
  blocked_slots    integer[] not null default '{}',
  share_token      text not null unique default replace(gen_random_uuid()::text, '-', ''),
  status           text not null default 'open',        -- open | closed | cancelled
  announced_start  timestamptz,                          -- the booking start when last checked
  last_sms_broadcast_at timestamptz,                     -- "also text" broadcasts: one per 12 hours
  purged_at        timestamptz,                          -- client details cleared (90-day rule)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table mini_sessions enable row level security;   -- service-role API routes only
create index if not exists mini_sessions_owner_idx on mini_sessions (owner_user_id);

create table if not exists mini_session_clients (
  id               uuid primary key default gen_random_uuid(),
  mini_session_id  uuid not null references mini_sessions(id) on delete cascade,
  slot_index       integer not null check (slot_index >= 0),
  name             text,
  email            text,
  phone            text,
  party_size       integer not null default 1 check (party_size between 1 and 30),
  sms_ok           boolean not null default false,       -- ticked "text me a reminder"
  status           text not null default 'booked',       -- booked | cancelled | removed | bumped
  added_by         text not null default 'client',       -- client | photographer
  manage_token     text not null unique default replace(gen_random_uuid()::text, '-', ''),
  checked_in_at    timestamptz,
  reminder_sent_at timestamptz,
  told_start       timestamptz,                          -- booking start this client was last told about
  purged_at        timestamptz,                          -- contact details cleared (90-day rule)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table mini_session_clients enable row level security;
create index if not exists mini_session_clients_session_idx on mini_session_clients (mini_session_id);
-- One client per slot. The database refuses the second sign-up for a slot, so
-- two people tapping the same time at once cannot both get it.
create unique index if not exists mini_session_clients_one_per_slot
  on mini_session_clients (mini_session_id, slot_index) where status = 'booked';
-- One self-sign-up per email per day (a photographer can still add a family's
-- second child under the same email by hand).
create unique index if not exists mini_session_clients_one_email
  on mini_session_clients (mini_session_id, lower(email)) where status = 'booked' and added_by = 'client' and email is not null;

-- Set Drops: "Planning mini sessions?" on a reservation (visible to Teddy only).
alter table set_drop_pledges add column if not exists plans_minis boolean not null default false;

notify pgrst, 'reload schema';
