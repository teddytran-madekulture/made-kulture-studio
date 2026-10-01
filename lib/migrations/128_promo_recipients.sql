-- ============================================
-- Migration 128 — Invite-only promo codes (2026-10-01)
-- ============================================
-- A promo code can be locked to the people a marketing campaign was sent to.
-- `recipients_only` turns the lock on; `promo_code_recipients` is the guest
-- list, filled by /api/admin/marketing/[id]/send BEFORE the emails go out
-- (and by test sends, so the owner can try the code himself).
--
-- At checkout (lib/promo.ts validatePromo) an invite-only code works ONLY for
-- a signed-in member whose ACCOUNT email is on the list — never the email typed
-- into the booking form, which anyone can fill in. A forwarded code does
-- nothing for the person it was forwarded to.
--
-- Emails are stored lowercased + trimmed. RLS on, no policies: service role only.

alter table promo_codes add column if not exists recipients_only boolean not null default false;

create table if not exists promo_code_recipients (
  promo_id    uuid not null references promo_codes(id) on delete cascade,
  email       text not null,
  campaign_id uuid references marketing_campaigns(id) on delete set null,
  added_at    timestamptz not null default now(),
  primary key (promo_id, email)
);

alter table promo_code_recipients enable row level security;
