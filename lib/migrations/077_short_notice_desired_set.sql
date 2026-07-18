-- Short-notice requests now capture the specific SET the customer wants (in
-- addition to date + time), and approvals can grant a precise timed window
-- (e.g. 1 hour) rather than only a whole-day "until" date.
alter table short_notice_requests
  add column if not exists desired_set        text,          -- set slug the customer wants (e.g. 'set-a')
  add column if not exists granted_expires_at timestamptz;    -- exact expiry when approved for a timed window
