-- ============================================
-- Migration 060 — Marketing hub (email campaigns)
-- ============================================
-- US opt-out (CAN-SPAM) model: we may email customers until they unsubscribe.
-- email_suppressions is the do-not-email list; every marketing send filters it
-- out and includes an unsubscribe link + physical address. (For stricter regimes
-- add an explicit opt-in later.)

create table if not exists marketing_campaigns (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  segment_key     text not null,               -- all | members | guests | lapsed | recent
  subject         text not null,
  body_html       text not null,
  promo_id        uuid references promo_codes(id) on delete set null,
  status          text not null default 'draft', -- draft | sent
  recipient_count int not null default 0,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists email_suppressions (
  email      text primary key,                 -- lowercased
  reason     text,                              -- 'unsubscribe' | 'bounce'
  created_at timestamptz not null default now()
);

alter table marketing_campaigns enable row level security;
alter table email_suppressions enable row level security;
