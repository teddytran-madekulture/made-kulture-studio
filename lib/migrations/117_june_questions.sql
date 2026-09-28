-- ============================================
-- Migration 117 — Questions June couldn't answer (2026-09-28)
-- ============================================
-- A member asked "how many pictures can I upload to my portfolio?" and June
-- said she didn't know. The answer (12) was in the code, not her KB, and
-- nobody would have noticed unless they happened to be watching the chat.
--
-- june_questions  — one row each time June hits a gap (she calls the silent
--                   log_knowledge_gap tool). Written mid-conversation.
-- june_question_groups — the weekly review folds those into groups ("portfolio
--                   photo limit, asked 3x") and drafts a KB line for each as an
--                   agent_kb_proposals row. Teddy saves it with one click;
--                   nothing reaches agent_kb without that click.
--
-- RLS on, ZERO policies: service role only, same as agent_kb.

create table if not exists june_question_groups (
  id               uuid primary key default gen_random_uuid(),
  label            text not null,                 -- "Portfolio photo limit"
  ask_count        int  not null default 0,
  examples         jsonb not null default '[]',   -- up to 5 phrasings, as asked
  conversation_ids uuid[] not null default '{}',
  channels         text[] not null default '{}',  -- web | kiosk | email
  proposal_id      uuid references agent_kb_proposals(id) on delete set null,
  note             text,                          -- reviewer's note, e.g. what to fill in
  status           text not null default 'open',  -- open | done | ignored
  first_asked_at   timestamptz,
  last_asked_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists june_questions (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references agent_conversations(id) on delete cascade,
  channel         text,
  question        text not null,
  kind            text not null default 'not_in_knowledge',  -- not_in_knowledge | partial
  group_id        uuid references june_question_groups(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists june_questions_ungrouped_idx on june_questions (created_at) where group_id is null;
create index if not exists june_question_groups_status_idx on june_question_groups (status, last_asked_at desc);

alter table june_questions       enable row level security;
alter table june_question_groups enable row level security;

notify pgrst, 'reload schema';
