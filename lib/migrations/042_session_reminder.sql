-- "15 minutes left" end-of-session reminder text. A frequent cron sweep texts
-- the customer when their booking is within 15 min of ending; this column marks
-- it sent so the reminder fires at most once per booking. Nullable — bookings
-- made before this feature simply have no timestamp.
alter table bookings add column if not exists session_reminder_sent_at timestamptz;
