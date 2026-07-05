-- Editable marketing-site text content (the CMS layer).
-- One row per (page, field key). `value` is jsonb so a field can hold a string,
-- number, boolean, or list (for future repeaters). Rows override the code
-- defaults in lib/site-content.ts; a missing row falls back to the default.
-- The admin edits these at /admin/content; the home page reads them at render.

create table if not exists site_content (
  page        text not null,             -- e.g. 'home'
  key         text not null,             -- e.g. 'heroHeadline'
  value       jsonb not null,            -- string | number | boolean | array
  updated_at  timestamptz not null default now(),
  primary key (page, key)
);

-- Reads/writes are server-side with the service-role key (bypasses RLS). Enable
-- RLS with no policies so anon/public keys cannot touch this table.
alter table site_content enable row level security;
