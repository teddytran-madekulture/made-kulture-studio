-- 094_addon_label_and_link.sql
--
-- Two columns on booking_add_ons, both of which exist because of one real
-- incident on 2026-08-10.
--
-- 1. `label`
--    booking_add_ons stored booking_id, equipment_id, quantity, rate, paid and
--    square_order_id — and nothing that says WHAT a line is. Equipment lines
--    read fine because equipment_id joins to a name. A free-form line (a guest
--    overage, a cleaning charge, a one-off fee) had equipment_id null and so
--    rendered in the admin dashboard as the literal word "Item".
--
--    A real $80 guest-overage line sat on a booking as `Item (UNPAID)` and
--    nobody — owner or assistant — could work out what it was. Both add-charge
--    and the payment-link route already COMPUTE a label; they just sent it to
--    Square's payment note and threw it away locally. Now it is stored.
--
-- 2. `square_payment_link_id`
--    The payment-link route saved `paymentLink.orderId` (enough for the webhook
--    to reconcile a payment) but discarded `paymentLink.id` — which is the only
--    handle Square's DeletePaymentLink accepts.
--
--    ⚠️ Square payment links DO NOT EXPIRE. Square's own answer: "The link will
--    be active as long as you don't deactivate or delete them. There is no
--    expiry date." So a link created for a charge that was later waived stays
--    payable forever, and we had no way to kill it. Storing the id makes the
--    CANCEL LINK action possible.
--
--    Rows created before this migration have a null link id. /api/admin/bookings
--    /[id]/cancel-link falls back to ListPaymentLinks matched on
--    square_order_id for exactly that case, so old links are still cancellable.

alter table booking_add_ons add column if not exists label                  text;
alter table booking_add_ons add column if not exists square_payment_link_id text;

-- The cancel action looks a row up by its link id.
create index if not exists booking_add_ons_payment_link_idx
  on booking_add_ons (square_payment_link_id);

-- Adding columns leaves PostgREST's schema cache stale, which shows up as
-- writes 400ing while reads look fine.
notify pgrst, 'reload schema';
