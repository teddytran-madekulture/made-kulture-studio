-- 106_sets_video.sql — per-set video for the public set pages (2026-09-15)
--
-- video_url  : public URL in the 'site' bucket (sets/<uuid>/N.mp4), or NULL.
-- video_hero : Teddy's per-set call — true puts the clip in the hero slot
--              (muted autoplay loop, photo_url as the poster frame), false
--              renders it in its own block under the description. A toggle
--              rather than a build-time decision so switching a set needs no
--              deploy, same reasoning as sets.gallery living in the DB.
--
-- ⚠️ RUN BY HAND in the Supabase SQL editor. Migrations here do NOT run on a
-- Vercel deploy — see Guest_Access_Deploy.md. Run this BEFORE pushing the code,
-- or the first save 400s on a column PostgREST has never seen.
alter table sets
  add column if not exists video_url  text,
  add column if not exists video_hero boolean not null default false;

-- ⚠️ PostgREST caches the schema; a new column is invisible to writes until
-- this fires. See the schema-cache note in project memory.
notify pgrst, 'reload schema';
