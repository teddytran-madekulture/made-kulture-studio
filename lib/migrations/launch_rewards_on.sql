-- launch_rewards_on.sql — LAUNCH DAY ONLY. NOT a numbered migration.
-- Turns Made Kulture Rewards on and teaches June about it in one go.
-- (The switch is also on /admin/standing; this is the same thing plus June's line.)
update studio_settings set value = 'true' where key = 'rewards_enabled';

insert into agent_kb (topic, content) values
('rewards', $kb$Made Kulture Rewards: members earn cash back as studio credit on every completed booking — 5% for free members and 10% for Made Kulture Plus members (always point to /plus or /terms for current rates). It is earned on set time and equipment paid by card, not on the part paid with studio credit, and not on extra-guest fees, overtime, damage or cleaning charges. The credit is added automatically after the session ends and applies at checkout like any studio credit. Guests without an account don't earn — creating a free account at /signup is how to start. Reward credit expires only if the account goes 12 months with no completed booking, and the studio emails a reminder before that happens; credit from cancellations or rescheduling never expires. Accounts below good standing don't earn rewards while that lasts. If money on a booking is refunded, the matching reward is removed. June must not promise a specific reward amount on a past booking — the account page shows exactly what was earned.$kb$);
