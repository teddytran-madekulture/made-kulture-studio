-- 133_photo_credits.sql — credit the people in a portfolio photo (2026-10-02).
--
-- A member tags who worked on / appears in each portfolio photo, with a role
-- ("Model", "Makeup Artist"...). Two kinds of credit:
--   • a DIRECTORY MEMBER  → member_id set; shows as a link to their profile and
--     the photo appears on their profile's TAGGED tab. Shows right away; the
--     tagged member can remove themselves (removed_at).
--   • someone NOT in the directory → name + optional Instagram handle, plus an
--     invite_token. The uploader shares the invite link themselves (the studio
--     never messages strangers). Signing up through the link claims the credit
--     (member_id set). An unclaimed credit whose Instagram matches a member's
--     handle is also shown as that member at read time.
--
-- Service-role only (all access goes through /api/directory/credits), so RLS is
-- on with no policies.

create table if not exists portfolio_credits (
  id            uuid primary key default gen_random_uuid(),
  image_id      uuid not null references portfolio_images(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,   -- who uploaded the photo
  member_id     uuid references auth.users(id) on delete set null,            -- tagged member (null = not in the directory yet)
  name          text,                                                         -- display name for a non-member
  instagram     text,                                                         -- lower-case handle, no @
  role          text not null,
  invite_token  text unique,
  notified_at   timestamptz,
  claimed_at    timestamptz,
  removed_at    timestamptz,                                                  -- tagged member removed themselves
  created_at    timestamptz not null default now()
);
alter table portfolio_credits enable row level security;

create index if not exists portfolio_credits_image_idx  on portfolio_credits (image_id);
create index if not exists portfolio_credits_member_idx on portfolio_credits (member_id) where member_id is not null;
create index if not exists portfolio_credits_ig_idx     on portfolio_credits (instagram) where instagram is not null;

-- One credit per person per photo.
create unique index if not exists portfolio_credits_member_once
  on portfolio_credits (image_id, member_id) where member_id is not null;
