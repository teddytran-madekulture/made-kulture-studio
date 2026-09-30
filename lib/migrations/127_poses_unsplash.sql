-- 127 — Pose Guide starter set moves to Unsplash (2026-09-29).
-- Pexels paused new API keys, so stock poses now come from Unsplash. stock_id
-- holds the Unsplash photo id and is unique, so re-seeding never duplicates.
alter table poses add column if not exists stock_id text;
create unique index if not exists poses_stock_id_key on poses (stock_id);
