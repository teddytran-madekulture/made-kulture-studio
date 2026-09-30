-- 126 — POSE GUIDE (2026-09-29)
-- The second PORTAL feature. A library of poses by category, from three
-- sources: a Pexels starter set (credited to the photographer), the studio's
-- own shots, and GUEST contributions — which stay 'pending' until approved in
-- /admin/poses. Service-role only: RLS on, no policies.
create table if not exists poses (
  id                  uuid primary key default gen_random_uuid(),
  category            text not null,
  source              text not null,              -- 'pexels' | 'studio' | 'guest'
  status              text not null default 'live', -- 'live' | 'pending' | 'rejected' | 'hidden'
  image_url           text,                       -- pexels: hotlinked image
  storage_path        text,                       -- studio/guest: path in the 'poses' bucket
  width               int,
  height              int,
  pexels_id           bigint unique,
  credit_name         text,                       -- photographer / contributor shown on the pose
  credit_url          text,                       -- pexels photographer page (never a tappable link on the tablet)
  set_slug            text,                       -- "Shot in <set>"
  contributor_user_id uuid,                       -- guest: the booking's account, if any
  booking_id          uuid,                       -- guest: the session it came from
  consent_rights      boolean,                    -- guest ticked: I have the rights to this photo
  consent_people      boolean,                    -- guest ticked: everyone pictured agreed
  consented_at        timestamptz,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists poses_cat_idx on poses (category, status, created_at desc);
create index if not exists poses_status_idx on poses (status, created_at);
alter table poses enable row level security;

-- "Show on wall" from a guest's phone.
alter table portal_sessions add column if not exists wall_pose_id uuid;
alter table portal_sessions add column if not exists wall_at timestamptz;

insert into storage.buckets (id, name, public)
  values ('poses', 'poses', false)
  on conflict (id) do nothing;
