-- ============================================
-- Migration 092 — June learns from you (pending knowledge proposals)
-- ============================================
-- Teddy can now teach June a fact by talking to her in a thread, and June can
-- notice a fact in a reply he wrote himself. Neither writes to agent_kb
-- directly: she drafts the exact line and it waits here until he saves it.
--
-- Why a table and not just client state: the "learn" pass fires right after he
-- sends his own reply, which is exactly the moment he closes the tab. A
-- proposal has to survive a refresh or it may as well not exist.

create table if not exists agent_kb_proposals (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references agent_conversations(id) on delete cascade,
  -- 'new' = add a topic June doesn't have. 'update' = replace the content of an
  -- existing row (kb_id). She has to pick one, so a correction overwrites the
  -- wrong fact instead of sitting next to it contradicting itself.
  mode            text not null default 'new',
  kb_id           uuid,                    -- set when mode = 'update'
  topic           text not null,
  content         text not null,
  -- One line, in her words, on why she's proposing it. Shown to Teddy so he can
  -- tell "you told Michael this" from "I inferred this".
  reason          text,
  -- 'revise' = he taught her directly. 'learn' = she noticed it in his own reply.
  source          text not null default 'revise',
  status          text not null default 'pending',   -- pending | saved | dismissed
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);

create index if not exists agent_kb_proposals_pending_idx
  on agent_kb_proposals (conversation_id, status, created_at);

alter table agent_kb_proposals enable row level security;

-- Reached only through admin API routes on the service role, same as agent_kb.

-- PostgREST caches the schema; without this the first insert 400s with
-- "column ... in the schema cache" even though selects work.
notify pgrst, 'reload schema';
