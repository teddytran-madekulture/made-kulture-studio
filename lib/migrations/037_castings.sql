-- Casting / project board. A casting is a shoot someone wants to do at the
-- studio: it carries an optional studio "plan" (set/hours/gear/guests) that we
-- price into an estimate, the roles they need, and a compensation tag. Other
-- members express interest; the author confirms collaborators.

create table if not exists castings (
  id                uuid primary key default gen_random_uuid(),
  author_id         uuid not null references auth.users(id) on delete cascade,
  title             text not null,
  description       text,
  compensation_type text not null default 'tfp',      -- paid | unpaid | tfp
  roles_needed      text[] not null default '{}',
  -- Studio plan (all optional — a casting can be a plain gig post):
  plan_mode         text not null default 'none',      -- none | set | buyout
  set_slug          text,
  hours             numeric,
  guests            integer,
  equipment         jsonb not null default '[]'::jsonb, -- [{id,name,rate,quantity}]
  shoot_date        date,
  start_hour        integer,                            -- 9..22
  estimated_cost    numeric,                            -- snapshot at post time
  status            text not null default 'open',       -- open | closed
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table castings enable row level security;
create index if not exists castings_status_idx on castings (status, created_at desc);

create table if not exists casting_participants (
  id          uuid primary key default gen_random_uuid(),
  casting_id  uuid not null references castings(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'interested',       -- interested | confirmed
  created_at  timestamptz not null default now(),
  unique (casting_id, user_id)
);
alter table casting_participants enable row level security;
create index if not exists casting_participants_casting_idx on casting_participants (casting_id);

-- RLS. Reads/writes across other members go through service-role API routes, so
-- these policies mainly guard the authenticated client. Keep them tight.
drop policy if exists "castings read"       on castings;
drop policy if exists "castings write own"  on castings;
create policy "castings read" on castings for select to authenticated using (true);
create policy "castings insert own" on castings for insert to authenticated with check (auth.uid() = author_id);
create policy "castings update own" on castings for update to authenticated using (auth.uid() = author_id);
create policy "castings delete own" on castings for delete to authenticated using (auth.uid() = author_id);

drop policy if exists "cp read"        on casting_participants;
drop policy if exists "cp insert self" on casting_participants;
drop policy if exists "cp delete self" on casting_participants;
create policy "cp read" on casting_participants for select to authenticated using (true);
create policy "cp insert self" on casting_participants for insert to authenticated with check (auth.uid() = user_id);
create policy "cp delete self" on casting_participants for delete to authenticated using (auth.uid() = user_id);
