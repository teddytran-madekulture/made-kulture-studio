-- 180 — A shareable "group" link for the check-in page (2026-10-28).
-- People in a booker's group often arrive first and wait outside. The booker's
-- check-in link can be forwarded, but it also carries CHECK OUT (ending the
-- session) and the party-size count. guest_token is a SECOND secret for the same
-- booking that opens a reduced page: door code + check in only. The booker
-- shares it from their own phone (SHARE WITH YOUR GROUP) — we send no text.
-- Same pattern as 018's check_in_token: backfill, default, unique index.
alter table bookings add column if not exists guest_token text;
update bookings set guest_token = replace(gen_random_uuid()::text, '-', '') where guest_token is null;
alter table bookings alter column guest_token set default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists bookings_guest_token_idx on bookings(guest_token);
