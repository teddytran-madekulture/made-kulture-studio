-- ============================================
-- Migration 129 — Email changes that keep the person together (2026-10-01)
-- ============================================
-- A customer is TWO records: the login (Supabase auth, keyed by id) and the
-- customer row (keyed by EMAIL — Plus, saved card, custom pricing, history,
-- standing). Changing only the login used to orphan everything on the customer
-- row. lib/email-change.ts now moves the customer row to the new address and
-- keeps the old one in customers.alt_emails (which the suspended-customer
-- screen already reads), and logs every change here.
--
-- status: 'pending'     customer asked; waiting on Supabase's confirmation link
--         'applied'     done — customer row moved
--         'needs_merge' login changed, but a DIFFERENT customer row already
--                       owns the new address; owner merges by hand (pushed)
--         'cancelled'   the request failed before anything changed
-- RLS on, no policies: service role only.

create table if not exists customer_email_changes (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  customer_id  uuid references customers(id) on delete set null,
  old_email    text not null,
  new_email    text not null,
  changed_by   text not null default 'customer',   -- 'customer' | 'admin'
  status       text not null default 'pending',
  note         text,
  requested_at timestamptz not null default now(),
  applied_at   timestamptz
);
create index if not exists customer_email_changes_user_idx on customer_email_changes (auth_user_id, status);

alter table customer_email_changes enable row level security;
