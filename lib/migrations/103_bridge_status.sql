-- 103_bridge_status.sql — remember a Bridge's up/down state so an outage can be
-- alerted on WITHOUT alerting on every blip.
--
-- Why a table at all: the webhook handler is stateless. It sees "OFFLINE" and has
-- no way to wait and find out whether the Bridge comes back. On 2026-09-04 the
-- back-door Bridge went offline at 14:00:19 Central and returned at 14:00:43 —
-- 24 seconds. Alerting straight from the handler would have sent a text about
-- nothing. So the handler records the transition here and /api/cron/bridge-health
-- asks, minutes later, whether it is STILL down.
--
-- Why it matters: while a Bridge is down, that door's activity logs never reach
-- us, so door-code check-in is silently blind and overtime does not accrue
-- (app/admin/dashboard/page.tsx:410 — `if (!b.checked_in_at) return 0`).

create table if not exists bridge_status (
  device_id     text primary key,           -- the BRIDGE id (EB1X…), not the lock (DBX…)
  label         text,                       -- 'front door' / 'back door', for the alert text
  is_online     boolean     not null default true,
  changed_at    timestamptz not null default now(),  -- when the CURRENT state began
  last_event_at timestamptz not null default now(),  -- last type-10 seen, state change or not
  alerted_at    timestamptz,                -- set when we alert; CLEARED on recovery
  created_at    timestamptz not null default now()
);

-- WARNING: service-role only means RLS ENABLED with zero policies. Disabled RLS is
-- NOT the same thing — with it off, the anon key reads the table freely. Migration
-- 102 shipped with exactly that mistake and the Supabase editor caught it.
alter table bridge_status enable row level security;

-- The cron's hot path: "any bridge down, and since when".
create index if not exists bridge_status_offline_idx
  on bridge_status (is_online, changed_at);

-- Labels only. State is left at the defaults and owned by the webhook from here on.
-- ON CONFLICT DO NOTHING so re-running never stomps live state.
insert into bridge_status (device_id, label) values
  ('EB1X11e1f23c', 'front door'),
  ('EB1X11d71784', 'back door')
on conflict (device_id) do nothing;
