-- 175 — Nomad: more than one house (2026-10-25). Mexico City becomes the first
-- row in nomad_houses; every stay, studio block and visitor belongs to a house.
-- One membership and one night bank work at every house.
--
-- RLS ON, ZERO policies = service role only (same as the rest of Nomad).

create table if not exists nomad_houses (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  slug           text not null unique,
  name           text not null,
  city           text not null,
  timezone       text not null,            -- IANA, e.g. America/Mexico_City, America/Los_Angeles
  address        text,                     -- members only see it while active
  active         boolean not null default false,   -- open for booking
  has_studio     boolean not null default true,    -- a studio room members can block
  lock_device_id text,                     -- igloohome device; null = no door codes
  overrides      jsonb not null default '{}'::jsonb, -- house rules that differ from the program defaults
  sort           integer not null default 0
);
alter table nomad_houses enable row level security;

insert into nomad_houses (slug, name, city, timezone, active, sort)
values ('cdmx', 'Nomad House, Mexico City', 'Mexico City', 'America/Mexico_City', true, 0)
on conflict (slug) do nothing;

-- Carry the one-house settings (name, address, door-code switch) onto Mexico City.
-- studio_settings.value may hold the JSON as text, or double-encoded as a JSON string.
do $$
declare v jsonb;
begin
  select case when jsonb_typeof(value::jsonb) = 'string' then (value::jsonb #>> '{}')::jsonb else value::jsonb end
    into v from studio_settings where key = 'nomad_settings' limit 1;
  if v is not null then
    update nomad_houses set
      name = coalesce(nullif(v->>'house_name', ''), name),
      address = coalesce(nullif(v->>'house_address', ''), address),
      overrides = overrides || jsonb_build_object('door_codes_enabled', coalesce((v->>'door_codes_enabled')::boolean, false))
    where slug = 'cdmx';
  end if;
exception when others then
  raise notice 'nomad_settings not copied: %', sqlerrm;
end $$;

alter table nomad_stays add column if not exists house_id uuid references nomad_houses(id);
alter table nomad_studio_blocks add column if not exists house_id uuid references nomad_houses(id);
alter table nomad_visitors add column if not exists house_id uuid references nomad_houses(id);

update nomad_stays set house_id = (select id from nomad_houses where slug = 'cdmx') where house_id is null;
update nomad_studio_blocks b set house_id = s.house_id from nomad_stays s where b.stay_id = s.id and b.house_id is null;
update nomad_visitors v set house_id = s.house_id from nomad_stays s where v.stay_id = s.id and v.house_id is null;

alter table nomad_stays alter column house_id set not null;
alter table nomad_studio_blocks alter column house_id set not null;
alter table nomad_visitors alter column house_id set not null;

create index if not exists nomad_stays_house_dates_idx on nomad_stays (house_id, check_in, check_out);
create index if not exists nomad_studio_house_day_idx on nomad_studio_blocks (house_id, day);
create index if not exists nomad_visitors_house_day_idx on nomad_visitors (house_id, day);

notify pgrst, 'reload schema';
