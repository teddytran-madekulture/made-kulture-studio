-- Member follows — one-directional social follow, no approval. A member can
-- follow anyone in the directory; counts drive the follower/following totals on
-- public profiles.
create table if not exists follows (
  follower_id  uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);
alter table follows enable row level security;
create index if not exists follows_following_idx on follows (following_id);
create index if not exists follows_follower_idx  on follows (follower_id);

-- Writes go through service-role API routes; keep client policies tight.
drop policy if exists "follows read"        on follows;
drop policy if exists "follows insert self" on follows;
drop policy if exists "follows delete self" on follows;
create policy "follows read" on follows for select to authenticated using (true);
create policy "follows insert self" on follows for insert to authenticated with check (auth.uid() = follower_id);
create policy "follows delete self" on follows for delete to authenticated using (auth.uid() = follower_id);
