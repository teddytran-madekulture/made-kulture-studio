-- 093_card_alerts.sql
--
-- Square tells us when a card on file goes bad — the issuer reissues it, the
-- expiry moves, or the account closes — via the `card.automatically_updated`
-- and `card.disabled` webhook events. Until now nothing listened, so the first
-- anyone learned a card was dead was a GENERIC_DECLINE at the moment of
-- charging, in front of the customer.
--
-- This table is the record of those notices. Service-role only; it is written
-- by /api/webhooks/square and read by /api/admin/booking-cards.

create table if not exists card_alerts (
  id                 uuid primary key default gen_random_uuid(),
  square_card_id     text not null,
  square_customer_id text,
  event_type         text not null,       -- 'card.automatically_updated' | 'card.disabled'
  detail             jsonb,
  created_at         timestamptz not null default now(),
  dismissed_at       timestamptz
);

create index if not exists card_alerts_card_idx
  on card_alerts (square_card_id, created_at desc);

alter table card_alerts enable row level security;   -- service-role only, no policies

-- Adding a table/columns leaves PostgREST's schema cache stale, which shows up
-- as writes 400ing while reads look fine.
notify pgrst, 'reload schema';
