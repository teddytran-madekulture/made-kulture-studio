-- 184 — SET CARE (2026-11-10). Owner-only reference + log for every set:
-- paint and finishes, where parts come from, how to clean it, what was done
-- and when. The two pool sets also get Equipment, Procedures and a Water Log.
--
-- One table for everything. `kind` says which section an entry belongs to:
--   reference: finish | part | cleaning | equipment | procedure | note
--   dated log: maintenance | water   (these carry log_date)
-- `fields` holds the section's own text fields (brand, color, supplier, link,
-- steps, pH...) as plain strings. The API whitelists and length-caps them.
--
-- Admin only: RLS ON with NO policies = only the service role (the admin API
-- routes) can read or write. Photos live in the PRIVATE `set-care` bucket and
-- are shown through short-lived signed URLs.

create table if not exists set_care_entries (
  id          uuid primary key default gen_random_uuid(),
  set_id      uuid not null references sets(id) on delete cascade,
  kind        text not null check (kind in ('finish','part','cleaning','equipment','procedure','note','maintenance','water')),
  title       text,
  fields      jsonb not null default '{}'::jsonb,
  photo_paths text[] not null default '{}',
  log_date    date,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists set_care_entries_set_kind on set_care_entries (set_id, kind);
alter table set_care_entries enable row level security;

-- Which sets get the pool sections. Toggle lives on the Set Care page.
alter table sets add column if not exists care_pool boolean not null default false;
update sets set care_pool = true where slug in ('watering-hole', 'the-tank');

insert into storage.buckets (id, name, public)
values ('set-care', 'set-care', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
