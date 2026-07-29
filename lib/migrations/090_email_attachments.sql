-- 090_email_attachments.sql — File attachments on June's email channel.
--
-- STORAGE POSTURE — Gmail is the system of record, we store as little as possible:
--
--   direction='in'   A file a customer emailed us. Google already stores it in the
--                    june@ mailbox forever, so we keep only a POINTER
--                    (gmail_msg_id + gmail_attachment_id) and stream the bytes
--                    from Gmail on demand. Nothing is copied into our storage.
--
--   direction='out'  A file staged in the admin inbox to go out with a reply. The
--                    browser uploads it straight to the email-media bucket via a
--                    signed URL (bypassing the 4.5MB serverless body cap), the send
--                    route pulls the bytes and hands them to Gmail, then DELETES the
--                    object — Gmail's Sent copy is the record. The bucket is a
--                    staging area, not an archive; rows outlive their bytes so the
--                    transcript can still show what was sent.
--
-- Also adds cc/bcc so a reply can loop in a third party.

create table if not exists email_attachments (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references agent_conversations(id) on delete cascade,
  -- Null while an outbound file is still staged; set when the message is sent.
  -- Inbound rows are linked to their message immediately.
  message_id      uuid references agent_messages(id) on delete cascade,
  direction       text not null check (direction in ('in', 'out')),
  filename        text not null,
  mime_type       text not null default 'application/octet-stream',
  size_bytes      bigint not null default 0,

  -- Inbound only: where to fetch the bytes from Gmail.
  gmail_msg_id        text,
  gmail_attachment_id text,

  -- Outbound only, and only until the send succeeds: object path in email-media.
  -- Nulled once the bytes are handed to Gmail and the staged object is removed.
  storage_path    text,

  created_at      timestamptz not null default now(),

  -- An inbound row is useless without its Gmail pointer. An outbound row is
  -- either still staged (has a path) or already sent (linked to a message).
  constraint email_attachments_locatable check (
    (direction = 'in'  and gmail_msg_id is not null and gmail_attachment_id is not null)
    or
    (direction = 'out' and (storage_path is not null or message_id is not null))
  )
);
alter table email_attachments enable row level security;   -- service-role only; APIs enforce scope

create index if not exists email_attachments_convo_idx   on email_attachments (conversation_id);
create index if not exists email_attachments_message_idx on email_attachments (message_id);
-- The staged-outbound lookup ("what's pending on this thread") is the hot path.
create index if not exists email_attachments_pending_idx on email_attachments (conversation_id)
  where message_id is null and direction = 'out';

-- CC / BCC on an outgoing reply. Stored on the message so the transcript shows
-- who actually received it, not just who the thread is with.
alter table agent_messages add column if not exists cc_emails  text[];
alter table agent_messages add column if not exists bcc_emails text[];

-- Staging bucket for outbound files only. Private: no public reads, no per-object
-- policies — uploads come in on short-lived signed URLs and the send path reads
-- with the service role, which bypasses storage RLS.
insert into storage.buckets (id, name, public)
  values ('email-media', 'email-media', false)
  on conflict (id) do nothing;

-- Adding columns to agent_messages invalidates PostgREST's cached schema; without
-- this the first WRITE that sets cc_emails 400s with "…column of 'agent_messages'
-- in the schema cache" even though reads look fine.
notify pgrst, 'reload schema';
