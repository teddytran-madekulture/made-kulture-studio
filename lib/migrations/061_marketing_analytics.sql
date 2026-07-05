-- ============================================
-- Migration 061 — Marketing analytics (opens / clicks / unsubs / bounces)
-- ============================================
-- Per-recipient engagement events for each campaign, fed by the Resend webhook
-- (/api/webhooks/resend) for delivered/opened/clicked/bounced/complained, and by
-- our own unsubscribe route for 'unsubscribed'. Aggregates power the admin cards.

create table if not exists marketing_events (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid references marketing_campaigns(id) on delete cascade,
  email       text not null,                  -- lowercased recipient
  type        text not null,                  -- delivered | opened | clicked | bounced | complained | unsubscribed
  created_at  timestamptz not null default now()
);

create index if not exists marketing_events_campaign_type_idx on marketing_events (campaign_id, type);
create index if not exists marketing_events_email_idx on marketing_events (email);

alter table marketing_events enable row level security;

-- Attribute an unsubscribe (and bounce) to the campaign whose email triggered it.
alter table email_suppressions add column if not exists campaign_id uuid references marketing_campaigns(id) on delete set null;
