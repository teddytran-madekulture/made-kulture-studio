-- Home page / marketing-site editable settings (non-image knobs).
-- Simple key/value store the admin tunes from /admin/homepage without a redeploy.
-- First knob: hero_height_vh — the desktop hero band height in vh units.
-- Writes happen server-side with the service-role key; reads are server-side too.

create table if not exists site_settings (
  key         text primary key,          -- e.g. 'hero_height_vh'
  value       text not null,             -- stored as text; parsed by the reader
  updated_at  timestamptz not null default now()
);

insert into site_settings (key, value)
  values ('hero_height_vh', '85')
  on conflict (key) do nothing;

-- Reads/writes are server-side with the service-role key (bypasses RLS). Enable
-- RLS with no policies so anon/public keys cannot touch this table.
alter table site_settings enable row level security;
