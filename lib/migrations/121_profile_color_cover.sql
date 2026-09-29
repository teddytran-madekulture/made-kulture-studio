-- ============================================
-- Migration 121 — Profile banner color (everyone) + cover photo (Founding)
-- ============================================
-- profile_color: a KEY from lib/profile-colors.ts (curated palette, each with a
--   light- and dark-mode shade) — never a raw hex, so nobody can pick a color
--   that makes their card unreadable.
-- cover_url: a cover photo across the top of the profile. Founding Creatives
--   only (migration 120). The API checks that; this trigger backs it up, since
--   members can write their own profile row directly.

alter table customer_profiles add column if not exists profile_color text;
alter table customer_profiles add column if not exists cover_url     text;

create or replace function guard_founding_columns()
  returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.founding_number := null; new.founding_blocked := false; new.founding_at := null;
    else
      new.founding_number := old.founding_number; new.founding_blocked := old.founding_blocked; new.founding_at := old.founding_at;
    end if;
  end if;
  -- Cover photos are a Founding perk.
  if new.founding_number is null then new.cover_url := null; end if;
  return new;
end $$;
