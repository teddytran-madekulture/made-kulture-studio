-- 148_member_blocks.sql — members can block each other (2026-10-07).
--
-- App Store guideline 1.2: an app with user content and messaging must let a
-- person block abusive users, not just report content. A block works BOTH
-- ways: neither member sees the other in the directory, home, profile or
-- inbox, and neither can message the other.
--
-- Written only by /api/directory/block (service role). Members can read the
-- rows THEY created (so a client could show "blocked" state), never who
-- blocked them.

create table if not exists member_blocks (
  blocker_id  uuid not null references auth.users(id) on delete cascade,
  blocked_id  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint member_blocks_not_self check (blocker_id <> blocked_id)
);
create index if not exists member_blocks_blocked_idx on member_blocks (blocked_id);

alter table member_blocks enable row level security;
drop policy if exists "blocks read own" on member_blocks;
create policy "blocks read own" on member_blocks for select to authenticated
  using (auth.uid() = blocker_id);

-- Backstop for EVERY message insert path — the API, the casting invite, the
-- listing REQUEST, and the "msg insert own" RLS policy that lets a signed-in
-- client insert straight into messages. If either side has blocked the other,
-- the insert fails, whoever wrote it.
create or replace function reject_blocked_message() returns trigger
  language plpgsql security definer set search_path = public as $$
declare a uuid; b uuid; other uuid;
begin
  select user_a, user_b into a, b from conversations where id = new.conversation_id;
  other := case when a = new.sender_id then b else a end;
  if exists (
    select 1 from member_blocks
     where (blocker_id = new.sender_id and blocked_id = other)
        or (blocker_id = other and blocked_id = new.sender_id)
  ) then
    raise exception 'blocked' using errcode = 'P0001', hint = 'member_blocked';
  end if;
  return new;
end $$;
drop trigger if exists messages_reject_blocked on messages;
create trigger messages_reject_blocked before insert on messages
  for each row execute function reject_blocked_message();

notify pgrst, 'reload schema';
