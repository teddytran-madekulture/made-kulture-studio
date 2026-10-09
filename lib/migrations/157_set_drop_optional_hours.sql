-- 157_set_drop_optional_hours.sql — "about how many hours" is optional on flat-deposit drops (2026-10-09).
-- With a flat deposit the hours answer changes nothing for the customer, so it is
-- an optional heads-up shown only in admin. NULL = they didn't say.
alter table set_drop_pledges alter column hours_wanted drop not null;
alter table set_drop_pledges alter column hours_wanted drop default;
notify pgrst, 'reload schema';
