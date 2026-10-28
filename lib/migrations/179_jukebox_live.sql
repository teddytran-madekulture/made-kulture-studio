-- 179 — Instant jukebox volume + player confirmation (2026-10-27).
-- 178 put volume on jukebox_zones, but the player only found out on its next
-- poll (up to ~15s in house mode) and nobody could tell whether it had worked.
-- This table is what the player LISTENS to over Supabase Realtime, so a change
-- lands in under a second, and where the player WRITES BACK (via the server)
-- the level it is actually playing at — admin shows that as the confirmation.
--
-- ⚠️ LOCKED DOWN: the public may READ these rows (just volume numbers; the same
-- level is already public in /api/jukebox/state) but there is NO insert/update
-- policy, so only the server (service role) can write. Admin and the kiosk
-- change volume through API routes that check the admin login / staff PIN.
-- A separate table on purpose: jukebox_zones stays closed to public reads.

create table if not exists jukebox_live (
  slug             text primary key,
  volume           smallint check (volume is null or (volume between 0 and 100)),
  volume_at        timestamptz,
  reported_volume  smallint check (reported_volume is null or (reported_volume between 0 and 100)),
  reported_at      timestamptz
);
alter table jukebox_live enable row level security;
drop policy if exists jukebox_live_public_read on jukebox_live;
create policy jukebox_live_public_read on jukebox_live for select to anon, authenticated using (true);

insert into jukebox_live (slug, volume, volume_at)
select slug, volume, volume_at from jukebox_zones
on conflict (slug) do nothing;

do $$ begin
  alter publication supabase_realtime add table jukebox_live;
exception when duplicate_object then null; end $$;
