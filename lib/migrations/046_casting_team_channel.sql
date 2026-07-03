-- Team channel — a private group chat per casting, visible only to the author
-- and the confirmed crew. Plus a per-user read marker so the board can show an
-- unread dot. In-app only (no email/SMS).

create table if not exists casting_messages (
  id          uuid primary key default gen_random_uuid(),
  casting_id  uuid not null references castings(id) on delete cascade,
  sender_id   uuid not null references auth.users(id) on delete cascade,
  body        text not null,
  reply_to_id uuid references casting_messages(id) on delete set null, -- lightweight quote-reply
  created_at  timestamptz not null default now()
);
alter table casting_messages enable row level security;
create index if not exists casting_messages_casting_idx on casting_messages (casting_id, created_at);

-- Membership test used by the policies. SECURITY DEFINER so it can read castings
-- / casting_participants without tripping their own RLS or recursing.
create or replace function is_casting_team_member(cid uuid, uid uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from castings c where c.id = cid and c.author_id = uid)
      or exists (select 1 from casting_participants p
                 where p.casting_id = cid and p.user_id = uid and p.status = 'confirmed');
$$;

drop policy if exists "cm read team"   on casting_messages;
drop policy if exists "cm insert team" on casting_messages;
create policy "cm read team" on casting_messages for select to authenticated
  using (is_casting_team_member(casting_id, auth.uid()));
create policy "cm insert team" on casting_messages for insert to authenticated
  with check (sender_id = auth.uid() and is_casting_team_member(casting_id, auth.uid()));

-- Live delivery (idempotent add to the realtime publication).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'casting_messages'
  ) then
    alter publication supabase_realtime add table casting_messages;
  end if;
end $$;

-- Per-user last-read marker for the team channel → drives the board unread dot.
create table if not exists casting_reads (
  casting_id   uuid not null references castings(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (casting_id, user_id)
);
alter table casting_reads enable row level security;
drop policy if exists "cr own" on casting_reads;
create policy "cr own" on casting_reads for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
