-- ============================================
-- MADE KULTURE STUDIO - SUPABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================

-- Required for double-booking prevention on uuid + tstzrange
create extension if not exists btree_gist;

-- SETS
create table if not exists sets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  rate_per_hour numeric(10,2) not null,
  min_hours numeric(4,1) default 1,
  capacity int not null default 5,
  features text[] default '{}',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- EQUIPMENT
create table if not exists equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate numeric(10,2) not null,
  category text check (category in ('lighting','modifier','special_effects','camera')),
  is_available boolean default true,
  created_at timestamptz default now()
);

-- CUSTOMERS
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,
  phone text not null,
  square_customer_id text unique,
  square_card_id text,
  created_at timestamptz default now()
);

-- BOOKINGS
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  set_id uuid references sets(id),
  start_time timestamptz not null,
  end_time timestamptz not null,
  guest_count int not null default 1,
  status text default 'pending' check (status in ('pending','confirmed','completed','cancelled','no_show')),
  payment_status text default 'unpaid' check (payment_status in ('unpaid','paid','partially_paid','refunded')),
  base_amount numeric(10,2) not null,
  extras_amount numeric(10,2) default 0,
  total_amount numeric(10,2) not null,
  square_payment_id text,
  square_card_on_file_id text,
  hold_amount numeric(10,2) default 150,
  hold_released boolean default false,
  source text default 'website' check (source in ('website','acuity','peerspace','manual')),
  notes text,
  created_at timestamptz default now(),
  -- prevent double bookings: same set cannot overlap in time
  constraint no_overlap exclude using gist (
    set_id with =,
    tstzrange(start_time, end_time) with &&
  ) where (status not in ('cancelled'))
);

-- BOOKING ADD-ONS
create table if not exists booking_add_ons (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  equipment_id uuid references equipment(id),
  quantity int default 1,
  rate numeric(10,2) not null,
  created_at timestamptz default now()
);

-- ============================================
-- MIGRATIONS
-- ============================================

-- Add Acuity appointment ID for webhook upserts (run once)
alter table bookings add column if not exists acuity_appointment_id text;
create unique index if not exists bookings_acuity_appointment_id_key
  on bookings (acuity_appointment_id)
  where acuity_appointment_id is not null;

-- Also fix booking_add_ons table name (schema uses booking_add_ons, code used booking_addons)
-- The correct name is booking_add_ons per this schema.

-- ============================================
-- SEED: STUDIO SETS
-- ============================================
insert into sets (name, description, rate_per_hour, min_hours, capacity, features) values
  ('Set A',             '12x15ft white cinderblock and smooth walls, large windows', 40, 1, 5, '{"White cinderblock","Smooth walls","Large windows"}'),
  ('Set B',             '12x14ft faux brush walls and duo color smooth walls',       40, 1, 5, '{"Faux brush walls","Duo color walls"}'),
  ('Set C',             '12x14ft white walls with 8''6"x20'' seamless red vinyl backdrop', 40, 1, 5, '{"White walls","Red vinyl backdrop"}'),
  ('Set D',             '12x15ft bare cinderblock, single smooth colored wall, concrete floor', 40, 1, 5, '{"Bare cinderblock","Concrete floor"}'),
  ('Concrete',          '12x16ft faux concrete walls, mirror wall, rubber black floors', 40, 1, 5, '{"Faux concrete walls","Mirror wall","Black rubber floors"}'),
  ('Vintage',           '12x16ft vintage aesthetic',                                 40, 1, 5, '{"Vintage aesthetic"}'),
  ('Cottage',           '12x16ft slate walls, light brown faux wood flooring',       40, 1, 5, '{"Slate walls","Faux wood flooring"}'),
  ('The Watering Hole', '12x16x13 shallow black pool',                               75, 2, 5, '{"Shallow black pool"}'),
  ('Studio One',        'Large open dilapidated warehouse aesthetic',                65, 1, 30,'{"Open warehouse","Dilapidated aesthetic","Large capacity"}')
on conflict (name) do nothing;

-- ============================================
-- SEED: EQUIPMENT
-- ============================================
insert into equipment (name, rate, category) values
  ('Aputure LS 600d Daylight LED Monolight',       70,  'lighting'),
  ('Aputure LS C300d II Daylight LED Monolight',   50,  'lighting'),
  ('Aputure LS 300x Bi-Color LED Monolight',       50,  'lighting'),
  ('Aputure Amaran F22C',                          50,  'lighting'),
  ('Aputure Amaran PT4c 2 Light Kit',              50,  'lighting'),
  ('Amaran 300c 300W RGBWW LED Light',             35,  'lighting'),
  ('Amaran 200x Bi-Color LED Monolight',           25,  'lighting'),
  ('Profoto 2x D1 Air 500w Studio Kit',           150,  'lighting'),
  ('Flashpoint XPLOR 400 Pro',                     30,  'lighting'),
  ('Flashpoint XPLOR 100 Pro Battery Monolight',   20,  'lighting'),
  ('Aputure Spotlight Mount with 36° Lens',        25,  'modifier'),
  ('ADJ Entourage 1400W Haze Machine',             60,  'special_effects'),
  ('ANTARI ICE-101 Ice Fog Machine',               65,  'special_effects'),
  ('Christie HD6K-M Projector',                   150,  'special_effects'),
  ('Canon EOS R5',                                 65,  'camera')
on conflict do nothing;

-- EMAIL TEMPLATES (admin-editable settings)
create table if not exists email_templates (
  key         text primary key,
  enabled     boolean not null default true,
  subject     text,
  updated_at  timestamptz default now()
);

-- ============================================
-- ENABLE REALTIME
-- ============================================
alter publication supabase_realtime add table bookings;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
alter table bookings enable row level security;
alter table customers enable row level security;
alter table sets enable row level security;
alter table equipment enable row level security;
alter table booking_add_ons enable row level security;

-- Public can read sets and equipment
create policy "sets are public" on sets for select using (true);
create policy "equipment is public" on equipment for select using (true);

-- Bookings readable by public for availability checking (no PII exposed)
create policy "availability is public" on bookings
  for select using (true);

-- Service role handles all writes (via API routes)
create policy "service role full access on bookings" on bookings
  for all using (auth.role() = 'service_role');
create policy "service role full access on customers" on customers
  for all using (auth.role() = 'service_role');
create policy "service role full access on add_ons" on booking_add_ons
  for all using (auth.role() = 'service_role');
