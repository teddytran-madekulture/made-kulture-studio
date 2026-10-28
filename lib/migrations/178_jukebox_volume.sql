-- 178 — Jukebox volume per zone, shared by admin and the kiosk (2026-10-27).
-- Before this, volume lived only in the playing tablet's localStorage, so Admin
-- → Jukebox could not change it. Now either side writes here; the player picks
-- it up on its next /api/jukebox/state poll (no new polling).
-- volume_at is the change stamp: the player applies a level only when the stamp
-- moves, so whoever changed it LAST wins and an unchanged row never fights a
-- local adjustment. NULL = never set (the tablet keeps its own saved level).

alter table jukebox_zones add column if not exists volume smallint
  check (volume is null or (volume between 0 and 100));
alter table jukebox_zones add column if not exists volume_at timestamptz;
