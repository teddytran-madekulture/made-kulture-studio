-- ============================================
-- Migration 120 — Founding Creatives
-- ============================================
-- The first 100 members with a COMPLETE, directory-listed profile become
-- Founding Creatives: a numbered gold badge (#1–#100) and 15 portfolio photos
-- instead of 12, for life. Numbers are handed out by claim_founding_number()
-- (called from the app, which owns the "is this profile complete" rule in
-- lib/directory-listing.ts). Admin can grant or revoke by hand; a revoked
-- member is blocked so the auto-claim doesn't give it straight back, and their
-- number is freed for the next person.

alter table customer_profiles add column if not exists founding_number  integer;
alter table customer_profiles add column if not exists founding_blocked boolean not null default false;
alter table customer_profiles add column if not exists founding_at      timestamptz;
create unique index if not exists customer_profiles_founding_number_uidx
  on customer_profiles (founding_number) where founding_number is not null;

-- Members can edit their own profile row, so these columns are guarded:
-- only the service role (our API routes) may change them.
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
  return new;
end $$;
drop trigger if exists guard_founding on customer_profiles;
create trigger guard_founding before insert or update on customer_profiles
  for each row execute function guard_founding_columns();

-- Hand out the lowest free number (1..cap). Serialised with an advisory lock so
-- two members finishing their profiles at the same moment can't get the same
-- number or overshoot the cap. Returns the member's number, or null if blocked
-- or the spots are gone.
create or replace function claim_founding_number(p_user uuid, p_cap integer default 100)
  returns integer language plpgsql security definer set search_path = public as $$
declare
  cur integer; blocked boolean; n integer;
begin
  perform pg_advisory_xact_lock(hashtext('founding_number'));
  select founding_number, founding_blocked into cur, blocked from customer_profiles where id = p_user;
  if not found then return null; end if;
  if cur is not null then return cur; end if;
  if blocked then return null; end if;
  select min(g) into n from generate_series(1, p_cap) g
   where not exists (select 1 from customer_profiles where founding_number = g);
  if n is null then return null; end if;
  update customer_profiles set founding_number = n, founding_at = now() where id = p_user;
  return n;
end $$;
revoke all on function claim_founding_number(uuid, integer) from public, anon, authenticated;

-- Portfolio cap: 15 for Founding Creatives, 12 for everyone else.
create or replace function enforce_portfolio_cap()
  returns trigger language plpgsql as $$
declare
  cap integer;
begin
  select case when founding_number is not null then 15 else 12 end into cap
    from customer_profiles where id = new.user_id;
  cap := coalesce(cap, 12);
  if (select count(*) from portfolio_images where user_id = new.user_id) >= cap then
    raise exception 'Portfolio limit reached (max % images).', cap;
  end if;
  return new;
end $$;
