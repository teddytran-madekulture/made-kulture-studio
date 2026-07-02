-- SMS notifications are opt-IN (default off) since toll-free texts cost per
-- message, unlike email which is opt-out.
alter table customer_profiles add column if not exists notify_sms boolean not null default false;
