-- 115_sms_messages.sql — two-way texting on the toll-free number (/admin/texts).
-- Every text IN (webhook /api/webhooks/twilio-sms) and every customer text OUT
-- (lib/sms.ts sendSMSResult — automatic ones AND admin replies) lands here, so a
-- thread shows what the customer is replying to. Owner alerts are NOT logged.
-- Service-role only: RLS on, no policies.
create table if not exists sms_messages (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,                          -- the customer, E.164
  direction   text not null check (direction in ('in', 'out')),
  body        text not null default '',
  media_count integer not null default 0,
  sent_by     text,                                   -- out only: 'system' | 'admin'
  twilio_sid  text,
  read_at     timestamptz,                            -- in only: when Teddy opened it
  created_at  timestamptz not null default now()
);
create index if not exists sms_messages_phone_idx  on sms_messages (phone, created_at desc);
create index if not exists sms_messages_recent_idx on sms_messages (created_at desc);
create index if not exists sms_messages_unread_idx on sms_messages (phone) where direction = 'in' and read_at is null;
-- Twilio retries a webhook it thinks failed; the sid keeps a retry from doubling a message.
-- A FULL unique constraint (not a partial index) so upsert onConflict can use it;
-- NULL sids never collide with each other.
do $$ begin
  alter table sms_messages add constraint sms_messages_twilio_sid_key unique (twilio_sid);
exception when duplicate_table or duplicate_object then null;
end $$;
alter table sms_messages enable row level security;

notify pgrst, 'reload schema';
