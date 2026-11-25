-- 193 — AI USAGE + COST (2026-11-25). One row per Claude API call made by the
-- site (June chat/email/kiosk, coaching, question review, polish). Tokens come
-- straight from the API's usage block; cost_usd is computed at write time from
-- the price table in lib/ai-usage.ts, so a later price change never rewrites
-- history. cost_usd NULL = model missing from that table (tokens still kept).
-- RLS on, zero policies: service role only, read through /api/admin/ai-usage.
create table if not exists public.ai_usage (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  feature text not null,
  model text not null,
  conversation_id uuid,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(12,6)
);
create index if not exists ai_usage_created_at_idx on public.ai_usage (created_at desc);
alter table public.ai_usage enable row level security;
