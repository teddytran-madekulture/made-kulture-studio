-- ============================================
-- Migration 097 — allow 'short-notice-autopay' as a booking source
-- ============================================
-- `bookings.source` is a CHECK-constrained taxonomy of HOW a booking came in
-- (migration 056 added 'website-delegated' for exactly this reason: a website
-- booking whose payment path differs enough to be worth counting separately).
--
-- Short-notice auto-pay is the same kind of thing — a Plus member's request
-- that the owner approved into a booking — so it gets its own value rather than
-- being folded into 'website', where it would be invisible in reporting.
--
-- ⚠️ Without this the insert in lib/booking-core.ts `insertBookingRows()` fails
-- the constraint and approval refuses with "Could not hold the slot". That
-- failure is SAFE — the insert runs BEFORE Square is called, so nothing is
-- charged — but the feature cannot work until this runs.

alter table bookings drop constraint if exists bookings_source_check;

alter table bookings add constraint bookings_source_check
  check (source = any (array[
    'website',
    'acuity',
    'peerspace',
    'manual',
    'website-delegated',
    'short-notice-autopay'
  ]::text[]));
