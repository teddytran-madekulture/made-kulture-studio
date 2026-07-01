-- Short-notice booking requests. A customer who has short-notice VIEW access can
-- ask the owner to open up booking inside the 48-hr window; the owner approves a
-- window (48h or until a date), which sets their short_notice grant.
create table if not exists short_notice_requests (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid,
  customer_email text,
  customer_name  text,
  customer_phone text,
  status         text not null default 'pending',   -- pending | approved | denied
  desired_date   date,
  desired_start  numeric,                            -- decimal hour (e.g. 14.5), optional
  note           text,
  approve_token  text not null,                      -- secret used by the owner's approval link
  granted_until  date,                               -- window granted on approval
  requested_at   timestamptz not null default now(),
  resolved_at    timestamptz
);

-- Service-role only (protects tokens + customer info from the anon key).
alter table short_notice_requests enable row level security;

create index if not exists snr_status_idx on short_notice_requests (status, requested_at desc);
create index if not exists snr_token_idx  on short_notice_requests (approve_token);
