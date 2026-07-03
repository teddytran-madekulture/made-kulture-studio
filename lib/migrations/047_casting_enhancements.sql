-- Casting enhancements: expiration + renew, author mood board, team-channel pin,
-- and voluntary contribution pledges (author covers the studio cost by default).

-- Expiration: castings drop off the board after this time; author can renew.
alter table castings add column if not exists expires_at timestamptz;
update castings set expires_at = created_at + interval '30 days' where expires_at is null;

-- Mood board: up to 6 reference images the author posts on the casting.
alter table castings add column if not exists mood_board jsonb not null default '[]'::jsonb; -- [{url}]

-- Pinned team-channel message (author-set).
alter table castings add column if not exists pinned_message_id uuid references casting_messages(id) on delete set null;

-- Voluntary pledges from confirmed members (display-only — no payments handled).
alter table casting_participants add column if not exists pledge_type  text not null default 'none'; -- none | amount | percent
alter table casting_participants add column if not exists pledge_value numeric;

-- Storage bucket for mood-board images (public read, per-user-folder writes).
insert into storage.buckets (id, name, public)
  values ('casting-media', 'casting-media', true)
  on conflict (id) do nothing;

drop policy if exists "casting-media read"        on storage.objects;
drop policy if exists "casting-media insert own"  on storage.objects;
drop policy if exists "casting-media delete own"  on storage.objects;
create policy "casting-media read" on storage.objects
  for select using (bucket_id = 'casting-media');
create policy "casting-media insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'casting-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "casting-media delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'casting-media' and (storage.foldername(name))[1] = auth.uid()::text);
