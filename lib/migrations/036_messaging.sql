-- In-app direct messaging (1:1 between members).
--   conversations: one row per member pair (canonical user_a < user_b).
--   messages: individual messages in a conversation.
-- RLS restricts everything to the two participants. Conversation creation is
-- done server-side with the service role. Realtime is enabled on messages so
-- open threads receive new messages live.

create table if not exists conversations (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references auth.users(id) on delete cascade,
  user_b          uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz,
  last_read_a     timestamptz,
  last_read_b     timestamptz,
  created_at      timestamptz not null default now(),
  constraint conversations_pair_order  check (user_a < user_b),
  constraint conversations_pair_unique unique (user_a, user_b)
);
alter table conversations enable row level security;

create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid not null references auth.users(id) on delete cascade,
  body            text not null,
  created_at      timestamptz not null default now()
);
alter table messages enable row level security;
create index if not exists messages_conv_idx on messages (conversation_id, created_at);

-- RLS ─────────────────────────────────────────────────────────────────────────
drop policy if exists "conv read own"   on conversations;
drop policy if exists "conv update own" on conversations;
create policy "conv read own"   on conversations for select to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);
create policy "conv update own" on conversations for update to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "msg read own"   on messages;
drop policy if exists "msg insert own" on messages;
create policy "msg read own" on messages for select to authenticated
  using (exists (
    select 1 from conversations c
    where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
  ));
create policy "msg insert own" on messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversations c
      where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- Keep last_message_at fresh so inboxes sort by recency. ───────────────────────
create or replace function bump_conversation()
  returns trigger language plpgsql as $$
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;
drop trigger if exists messages_bump on messages;
create trigger messages_bump after insert on messages
  for each row execute function bump_conversation();

-- Live delivery: add messages to the realtime publication (idempotent). ────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table messages;
  end if;
end $$;
