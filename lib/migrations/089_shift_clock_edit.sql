-- 089_shift_clock_edit.sql — Clock-time corrections + forgot-to-punch handling.
-- clock_edited_at: stamped when an admin manually sets/fixes a shift's clock in/out
--   (so a forgotten or wrong punch never breaks payroll — you can always correct it).
-- auto_clock_out: true when the nightly sweep auto-closed a shift the worker left on
--   the clock past its end (capped at the scheduled end) — flags it for review.

alter table shifts add column if not exists clock_edited_at timestamptz;
alter table shifts add column if not exists auto_clock_out boolean not null default false;

notify pgrst, 'reload schema';
