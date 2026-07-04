-- ============================================
-- Migration 057 — Customer account credit (store credit)
-- ============================================
-- Append-only ledger. Balance = sum(amount_cents) for a user. Credit is
-- account-based (auth_user_id), dollar-denominated (cents), and NON-EXPIRING
-- (expires_at stays NULL — kept on the row only so a promo credit could expire
-- later with proper disclosure).
--
-- Sources: cancel→credit (instead of refund), admin grant, future prepaid packs.
-- Redemption: applied at checkout (credit first, card for the remainder).

create table if not exists credit_ledger (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents int  not null,                 -- + = credit added, - = credit used
  kind         text not null,                 -- 'issued' | 'redeemed' | 'purchased' | 'adjustment' | 'expired'
  reason       text,
  booking_id   uuid references bookings(id) on delete set null,
  created_by   text,                          -- 'admin' | 'system' | 'customer'
  created_at   timestamptz not null default now(),
  expires_at   timestamptz                    -- NULL = never (default policy)
);

create index if not exists credit_ledger_user_idx on credit_ledger (auth_user_id, created_at);

-- Service-role only (all reads/writes go through API routes with the service key).
alter table credit_ledger enable row level security;
