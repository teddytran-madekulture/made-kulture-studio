-- 088_payroll.sql — Square Payroll timecard sync scaffolding.
-- Worker clocks in/out (085) → Teddy approves the hours → app writes a Labor
-- timecard to the worker's Square Team profile → Teddy clicks "Import time and
-- wages" in Square Payroll. Actual wages + W-2/1099 classification are set on the
-- Square side (CPA-pending); this only pushes hours. Per-class toggle gates which
-- roles sync — attendants/sanitation ON (W-2 hourly), interns/freelancers OFF
-- until classification is confirmed.

alter table worker_profiles add column if not exists square_team_member_id text;
alter table shifts add column if not exists timecard_id text;
alter table shifts add column if not exists timecard_synced_at timestamptz;

-- Per-class payroll enablement (key/value in studio_settings; guard, don't clobber).
insert into studio_settings (key, value)
select v.key, v.value from (values
  ('payroll_enabled_attendant', 'true'),
  ('payroll_enabled_sanitation', 'true'),
  ('payroll_enabled_intern', 'false'),
  ('payroll_enabled_freelancer', 'false')
) as v(key, value)
where not exists (select 1 from studio_settings s where s.key = v.key);

notify pgrst, 'reload schema';
