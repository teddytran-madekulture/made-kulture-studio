-- Email notifications (throttled). Per-participant "last notified" timestamps on
-- conversations enforce a cooldown so a back-and-forth = one email, not many.
alter table conversations add column if not exists notified_a_at timestamptz;
alter table conversations add column if not exists notified_b_at timestamptz;

-- Per-member opt-out for email notifications (default on).
alter table customer_profiles add column if not exists notify_email boolean not null default true;
