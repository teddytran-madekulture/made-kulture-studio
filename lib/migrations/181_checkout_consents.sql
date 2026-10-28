-- 181 — Remember a member's checkout agreements (2026-10-28).
-- Members ticked three boxes on EVERY booking. Now:
--   sms_consent_at/_phone  — text consent lasts until STOP, so once is enough
--                            (asked again if they book with a different number)
--   agreement_version/_at  — the Rental Agreement & Waiver + guest policy they
--                            last accepted in full. Returning members get ONE
--                            combined box per booking (they still agree each
--                            time); bump AGREEMENT_VERSION in lib/checkout-consent.ts
--                            when either document changes and everyone sees the
--                            full boxes again.
-- Guests without an account always see all three. Written only by
-- /api/account/checkout-consent with the service role, keyed on the session user.
alter table customer_profiles add column if not exists sms_consent_at     timestamptz;
alter table customer_profiles add column if not exists sms_consent_phone  text;
alter table customer_profiles add column if not exists agreement_version  text;
alter table customer_profiles add column if not exists agreement_at       timestamptz;
