-- 182_page_views.sql — site traffic for Admin → Insights → Traffic (2026-11-01).
-- One row per page view on the PUBLIC site and the store apps (the app is the
-- same site in a web view, so `platform` tells them apart).
--
-- No names, emails or IP addresses. A visitor is a random id kept in that
-- browser's localStorage (visitor_id), a visit is a random id per tab session
-- (session_id). user_id is filled only when a signed-in member is browsing.
-- Paths are stored with any token segment replaced by ':id' (manage links,
-- check-in links, pay links carry secrets in the URL).
--
-- Written only by /api/track/pv with the service key: RLS on, no policies.
-- Rows older than 13 months are deleted by /api/admin/traffic on read.
create table if not exists page_views (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  visitor_id   text not null,
  session_id   text not null,
  user_id      uuid references auth.users(id) on delete set null,
  kind         text not null default 'view' check (kind in ('view', 'booked')),
  path         text not null,
  referrer     text,            -- external host only, first view of a visit
  utm_source   text,            -- ?utm_source= / ?ref= on the landing page
  platform     text not null default 'web' check (platform in ('web', 'ios', 'android')),
  device       text,            -- mobile | tablet | desktop
  country      text,
  city         text
);
create index if not exists page_views_created_idx on page_views (created_at);
create index if not exists page_views_visitor_idx on page_views (visitor_id);
alter table page_views enable row level security;

notify pgrst, 'reload schema';
