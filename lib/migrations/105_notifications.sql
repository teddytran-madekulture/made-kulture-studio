-- 105_notifications.sql — every owner notification, recorded.
--
-- Why this exists (2026-09-05): a web push that is accepted by FCM/Apple and
-- never displayed on the device looks IDENTICAL in every log we have to one
-- that worked. Teddy's iPhone renders them; his Windows Chrome accepts and
-- shows nothing. Until now a push was fire-and-forget, so anything that failed
-- to display was simply GONE — including a guest arriving at the studio.
--
-- The fix is not to make push more reliable (we don't control the device). It is
-- to stop making push the only copy. lib/push.ts writes a row here on EVERY
-- send, so the admin has a durable history no matter what the OS did with it.
--
-- ⚠️ The row is written even when push is DORMANT (no VAPID keys) or when there
-- are ZERO subscriptions. Those are exactly the cases where the notification
-- would otherwise vanish without trace, so they are the ones most worth keeping.

create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  title       text        not null,
  body        text        not null default '',
  url         text,                                -- deep link the push carried
  tag         text,
  meta        jsonb,
  -- What the PUSH TRANSPORT did. Accepted is NOT delivered: a push service
  -- returns 201 for "queued", which says nothing about whether a human saw it.
  -- Stored so history can say "sent to 2 devices" without ever claiming "read".
  subscriptions int not null default 0,
  accepted      int not null default 0,
  send_results  jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ⚠️ Service-role only means RLS ENABLED with zero policies. RLS *disabled* is a
-- DIFFERENT state in which the anon key reads the table freely. Migration 102
-- shipped with exactly that mistake. This table carries booking context and
-- customer names, so the distinction matters.
alter table notifications enable row level security;

-- The only two queries this table serves: newest-first paging, and the unread
-- count for the nav badge.
create index if not exists notifications_created_idx on notifications (created_at desc);
create index if not exists notifications_unread_idx  on notifications (read_at) where read_at is null;
