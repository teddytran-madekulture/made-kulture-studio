-- Home page / marketing-site editable images.
-- Lets the admin swap the hero, each set card photo, and the "studio photo"
-- from /admin/homepage without a redeploy. Rows override the hardcoded
-- defaults in lib/site-images.ts; a missing row falls back to the default.

create table if not exists site_images (
  slug        text primary key,          -- e.g. 'hero', 'set-a', 'studio-photo'
  url         text not null,             -- public URL in the 'site' storage bucket
  updated_at  timestamptz not null default now()
);

-- Public storage bucket for site imagery. Writes happen server-side with the
-- service-role key (bypasses RLS); we only need public read for serving.
insert into storage.buckets (id, name, public)
  values ('site', 'site', true)
  on conflict (id) do nothing;

drop policy if exists "site read" on storage.objects;
create policy "site read" on storage.objects
  for select using (bucket_id = 'site');
