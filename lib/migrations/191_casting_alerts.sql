-- 191 — CASTING ALERTS (2026-11-23). When a casting goes live, listed members
-- whose roles match the roles it needs get an app notification (push only, no
-- email or text). This is the member's switch to turn those off. Default on.
alter table public.customer_profiles add column if not exists notify_castings boolean not null default true;
