-- ============================================
-- Migration 119 — Community events (directory / portfolio / casting analytics)
-- ============================================
-- One row per member action in the community area, written ONLY by
-- /api/track (service role) for SIGNED-IN members. Powers Admin → Community.
--
-- What is logged: searches + role filters, profile views, portfolio opens,
-- contact clicks (message / follow / instagram / email / link / reel),
-- casting views + apply clicks. Message CONTENT is never logged — messaging,
-- follows and casting outcomes are read from their own tables instead.
-- Rows older than 12 months are deleted by the admin route (see retention).

create table if not exists community_events (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,  -- who did it
  type        text not null,          -- search | filter | profile_view | portfolio_seen | portfolio_open | contact_click | casting_view | casting_apply | casting_list_view
  target_id   uuid,                   -- profile (user id) or casting id acted on
  query       text,                   -- search text, lowercased, max 80 chars
  meta        jsonb,                  -- small extras: {results, role, what, index, photos}
  created_at  timestamptz not null default now()
);

create index if not exists community_events_type_time_idx on community_events (type, created_at desc);
create index if not exists community_events_target_idx    on community_events (target_id, type);
create index if not exists community_events_user_time_idx on community_events (user_id, created_at desc);

-- RLS on with NO policies: only the service role (API routes) can read or write.
alter table community_events enable row level security;
