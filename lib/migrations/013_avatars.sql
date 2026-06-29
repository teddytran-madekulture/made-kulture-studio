-- ============================================
-- Migration 013 — Profile photos (avatars)
-- ============================================
-- Adds an avatar_url to customer profiles and a public "avatars" storage bucket.
-- Each user can upload/replace only their own avatar (stored under a folder
-- named after their user id); everyone can read (so directory cards show them).

alter table customer_profiles add column if not exists avatar_url text;

-- Public storage bucket for avatars.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Policies on storage.objects scoped to the avatars bucket.
drop policy if exists "Avatars are publicly readable" on storage.objects;
create policy "Avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users upload their own avatar" on storage.objects;
create policy "Users upload their own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update their own avatar" on storage.objects;
create policy "Users update their own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete their own avatar" on storage.objects;
create policy "Users delete their own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
