-- ============================================
-- Migration 096 — Short-notice auto-pay on approval
-- ============================================
-- A short-notice request currently records only WHAT the customer wants
-- (set + date + start). To charge on approval it also has to record what they
-- AGREED TO PAY, and with which card — otherwise approving has no amount to
-- charge and no record of consent.
--
-- ⚠️ Every column is nullable with no default: existing pending/approved rows
-- stay valid and simply carry nulls. The approve route treats "no quoted_cents"
-- as "this is a pre-auto-pay request — unlock them to book, do not charge."

alter table short_notice_requests
  -- Session length in hours (e.g. 1.5). With desired_start this gives the end.
  add column if not exists desired_hours  numeric,
  -- The price SHOWN to the customer at the moment they consented, in cents.
  -- ⚠️ Charge THIS, not a recomputed figure — it is what they agreed to. If a
  -- rate changed in between, honour the quote and let the owner see the gap.
  add column if not exists quoted_cents   integer,
  -- Square card id they authorised. Null = no card on file; approval falls
  -- straight to the payment-link path.
  add column if not exists square_card_id text,
  -- When they agreed. Consent is valid until the session STARTS; past that
  -- there is nothing to charge for. No other timer, by decision.
  add column if not exists consented_at   timestamptz,
  -- Payment-link path only: when the pending_payment hold is released.
  -- 2 hours from approval, or the session start, whichever comes first.
  add column if not exists hold_expires_at timestamptz,
  -- The booking this request produced, once approved and paid. Lets the approve
  -- route stay idempotent — a double-tap must not create a second booking.
  add column if not exists booking_id     uuid;

-- Finding holds to expire, without scanning the whole table.
create index if not exists snr_hold_expiry_idx
  on short_notice_requests (hold_expires_at)
  where hold_expires_at is not null;

-- ⚠️ REQUIRED after adding columns. Without it PostgREST keeps serving the old
-- schema and writes to the new columns 400/500 while reads look fine.
notify pgrst, 'reload schema';
