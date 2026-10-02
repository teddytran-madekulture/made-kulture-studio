-- 132_plus_new_member_pricing.sql — 2026-10-01
-- Plus pricing rules (Teddy): $99 is a FIRST-YEAR, NEW-MEMBER promo. Renewals
-- are always the standard $149. Someone who has had Plus before (by account,
-- phone, or the same card on another account) pays $149. The launch promo runs
-- through Jan 31, 2027; future promos run in January so renewals bunch up there.

-- Card fingerprint (Square's per-card id, the same across accounts) on each
-- Plus payment, so a second account can't reopen the new-member price.
alter table plus_payments add column if not exists card_fingerprint text;
create index if not exists plus_payments_card_fp_idx on plus_payments (card_fingerprint) where card_fingerprint is not null;

-- Launch promo cutoff (the site defaults to this too; the row makes it editable).
delete from studio_settings where key = 'plus_intro_until';
insert into studio_settings (key, value) values ('plus_intro_until', '2027-01-31');

-- June: the new rules (her prompt is rebuilt from agent_kb on every reply).
update agent_kb set content = $kb$Made Kulture Plus is an annual membership. The standard price is $149/year. NEW members — people who have never had Plus before — can join at an introductory $99 for their FIRST YEAR during a promo window; the current launch promo runs through January 31, 2027. After the first year, Plus renews at the standard $149/year. The $99 price is not available to past or lapsed members who rejoin, and it never applies to renewals. Always point people to /plus for the live, exact price rather than promising a figure.$kb$
where topic = 'plus_pricing';

update agent_kb set content = $kb$Plus membership billing and cancellation: Plus renews automatically each year, charged to the card on file, at the standard annual rate (currently $149/year) — the $99 introductory price covers a new member's first year only. A member can turn off auto-renew at any time from their account — their benefits continue through the end of the paid term and they are not charged again. Membership fees are NON-REFUNDABLE, including for partial or unused terms. This is separate from booking cancellations. Never promise a membership refund or exception — escalate refund requests or complaints to Teddy.$kb$
where topic = 'membership_billing';

notify pgrst, 'reload schema';
