-- 114_sms_daily_cap.sql — a daily ceiling on outbound texts (lib/sms.ts).
-- Guards against a bug that texts in a loop: past the limit, sending stops for
-- the rest of the Central day and Teddy gets ONE push saying why.
-- Normal volume is ~10–20 a day; the limit is studio_settings.sms_daily_limit (150).
create table if not exists sms_daily_count (
  day   date primary key,
  sent  integer not null default 0
);
alter table sms_daily_count enable row level security;

-- Atomic +1, returns the new count (no read-then-write race between functions).
create or replace function sms_bump(p_day date) returns integer
language sql security definer set search_path = public as $$
  insert into sms_daily_count (day, sent) values (p_day, 1)
  on conflict (day) do update set sent = sms_daily_count.sent + 1
  returning sent;
$$;
revoke all on function sms_bump(date) from public, anon, authenticated;

insert into studio_settings (key, value)
select 'sms_daily_limit', '150'
where not exists (select 1 from studio_settings where key = 'sms_daily_limit');

notify pgrst, 'reload schema';
