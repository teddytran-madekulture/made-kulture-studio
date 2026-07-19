-- Update June's knowledge base with the membership program (free + Plus) and its
-- policies. June only states what's in agent_kb, and her prompt is rebuilt from
-- this table on every reply — so running this makes her fluent in Plus with no
-- redeploy. Idempotent: re-running replaces these five topics cleanly.

delete from agent_kb where topic in (
  'membership', 'plus_pricing', 'plus_short_notice', 'plus_cancellation_protection', 'membership_billing'
);

insert into agent_kb (topic, content) values

('membership', $kb$Made Kulture has two account tiers. (1) FREE account — anyone can create one at no cost at /signup. It unlocks the member booking rate (lower per hour than the guest rate), saved-card fast checkout, a creative profile, the creator directory (get found by brands and other creatives), the castings board and direct messaging, and one place to manage bookings and studio credit. (2) MADE KULTURE PLUS — a paid annual membership that adds three things on top of a free account: short-notice booking access, cancellation protection, and no-show credit. Learn more or join at /plus. Plus does NOT change the per-session booking rate — it is about access and protection, not a discount.$kb$),

('plus_pricing', $kb$Made Kulture Plus is an annual membership. Founding/intro price is $99/year for anyone who joins through December 31, 2026; it rises to $149/year starting January 1, 2027. Renewals are billed at the price in effect at the time of renewal (so joining now at $99 does not lock $99 forever — the next year renews at the then-current price). These are the current numbers, but always point people to /plus for live, exact pricing rather than promising a figure.$kb$),

('plus_short_notice', $kb$Short-notice booking is a Plus perk. Normally every booking needs at least 48 hours advance notice. Plus members can see availability inside the 48-hour window and REQUEST a short-notice booking. Every request is reviewed and approved by the studio — an open time slot on the calendar is NOT a guarantee, and the studio may be unavailable even when the calendar looks open. If approved, the member gets a short window to complete the booking. Non-members always book with at least 48 hours notice.$kb$),

('plus_cancellation_protection', $kb$Cancellation protection is a Plus perk. If a Plus member cancels a booking — even last minute — the full value comes back to their account as studio credit instead of being forfeited, and it applies automatically to their next booking. Studio credit never expires. If a Plus member no-shows entirely (never cancels), they can reach out and the studio may credit the session on request, reviewed case by case. Non-members follow the standard booking policy: full refund only if cancelled 48+ hours ahead, no refund within 48 hours.$kb$),

('membership_billing', $kb$Plus membership billing and cancellation: Plus renews automatically each year, charged to the card on file, at the then-current price. A member can turn off auto-renew at any time from their account — their benefits continue through the end of the paid term and they are not charged again. Membership fees are NON-REFUNDABLE, including for partial or unused terms. This is separate from booking cancellations. Never promise a membership refund or exception — escalate refund requests or complaints to Teddy.$kb$);
