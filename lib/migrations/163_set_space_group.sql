-- Migration 163 — sets that share one physical space (2026-10-09)
--
-- The Winter Is Coming set is built inside Studio One. Both can be booked, but
-- never at the same time: a Studio One booking blocks Winter Is Coming and the
-- other way round. Every set with the same space_group blocks the others
-- (lib/set-catalog spaceMates — availability grid, checkout, reschedule, add
-- time, kiosk tablet, Plus instant booking, mini-session plans).
--
-- Access is NOT symmetric and is not modelled here: booking Winter Is Coming
-- includes the rest of Studio One; booking Studio One does not include the
-- Winter set. That is a studio rule, not a scheduling one.

alter table sets add column if not exists space_group text;

update sets set space_group = 'studio-one'
where slug in ('studio-one', 'winter-is-coming') or name in ('Studio One', 'Winter Is Coming');

-- The app checks this before every sale, but two checkouts in the same second
-- (one on each set) could both pass that check. The database closes the race
-- the same way no_overlap does for a single set: bookings in one space_group
-- carry a space_key, and two live bookings with the same key can't overlap.
-- space_key is NULL for every set without a group, so nothing else changes.
alter table bookings add column if not exists space_key text;

create or replace function bookings_set_space_key() returns trigger
language plpgsql as $$
begin
  new.space_key := case when new.set_id is null then null
    else (select space_group from sets where id = new.set_id) end;
  return new;
end $$;

drop trigger if exists bookings_space_key on bookings;
create trigger bookings_space_key
  before insert or update of set_id on bookings
  for each row execute function bookings_set_space_key();

-- Current and future bookings on grouped sets (past rows don't matter).
-- ⚠️ If you give another set a space_group later, re-run this update.
update bookings b set space_key = s.space_group
from sets s
where s.id = b.set_id and s.space_group is not null
  and b.end_time > now() and b.space_key is distinct from s.space_group;

alter table bookings drop constraint if exists no_overlap_shared_space;
alter table bookings add constraint no_overlap_shared_space exclude using gist (
  space_key with =,
  tstzrange(start_time, end_time) with &&
) where (status not in ('cancelled') and space_key is not null);

notify pgrst, 'reload schema';

-- Check: should list Studio One and Winter Is Coming, both 'studio-one'.
select name, slug, space_group from sets where space_group is not null;
