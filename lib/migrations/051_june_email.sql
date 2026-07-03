-- ============================================
-- Migration 051 — June email channel (june@madekulture.com)
-- ============================================
-- Email conversations reuse agent_conversations/agent_messages (channel 'email').
-- Replies are stored as role 'draft' until Teddy approves them in /admin/inbox.
-- Setup steps: June_Email_Setup.md.

alter table agent_conversations add column if not exists gmail_thread_id text;
alter table agent_conversations add column if not exists contact_email  text;
alter table agent_conversations add column if not exists subject        text;
create unique index if not exists agent_convos_gmail_thread_idx
  on agent_conversations (gmail_thread_id) where gmail_thread_id is not null;

-- external_id = Gmail message id (dedupe inbound; track sent replies)
alter table agent_messages add column if not exists external_id text;
create unique index if not exists agent_messages_external_idx
  on agent_messages (external_id) where external_id is not null;

-- ── pg_cron: poll the june@ mailbox every 5 minutes ───────────────────────────
-- Run AFTER deploying and setting the env vars. Replace <CRON_SECRET> with the
-- value from Bitwarden (same secret the session-reminder job uses).
-- select cron.schedule(
--   'june-email-poll',
--   '*/5 * * * *',
--   $$ select net.http_get(
--        url := 'https://made-kulture-studio.vercel.app/api/cron/agent-email',
--        headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb
--      ) $$
-- );
