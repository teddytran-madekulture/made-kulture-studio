-- ============================================
-- Migration 054 — Tour cancellation (customer link + studio button)
-- ============================================
-- cancel_token: separate from decision_token (which is Teddy's approve/decline
-- auth) so the customer's cancel link can't approve anything.

alter table tour_requests add column if not exists cancel_token text unique;
update tour_requests set cancel_token = replace(gen_random_uuid()::text, '-', '')
  where cancel_token is null;
