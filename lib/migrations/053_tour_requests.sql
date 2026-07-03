-- ============================================
-- Migration 053 — Studio tour requests (request → Teddy approves)
-- ============================================
-- Tours are free 30-min visits offered ONLY during windows where a regular
-- single-set booking is already active (studio is open/staffed) and never
-- during full buyouts. Teddy approves/declines via token link from push/SMS.

create table if not exists tour_requests (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  phone         text not null,
  email         text,
  purpose       text,                              -- what they're planning to shoot
  start_time    timestamptz not null,
  end_time      timestamptz not null,
  status        text not null default 'pending',   -- pending | approved | declined | cancelled
  is_custom     boolean not null default false,     -- true = outside open windows; Teddy must open the studio
  decision_token text unique not null,             -- one-tap approve/decline link for Teddy
  gcal_event_id text,                              -- calendar event once approved
  created_at    timestamptz not null default now()
);
create index if not exists tour_requests_start_idx on tour_requests (start_time);

alter table tour_requests enable row level security;

-- June learns about tours.
insert into agent_kb (topic, content)
select 'tours',
  'Studio tours: yes! Free 30-minute tours. Book at /tour. Two options there: (1) pick from the listed times (days the studio is already open for shoots — these are easiest to confirm), or (2) request a custom date and time if nothing listed works — custom requests depend on Teddy''s availability to open the studio, so they''re not guaranteed. Either way Teddy confirms by text shortly after the request.'
where not exists (select 1 from agent_kb where topic = 'tours');
