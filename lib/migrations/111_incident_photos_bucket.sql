-- 111_incident_photos_bucket.sql — photos attached to account-standing incidents.
-- Private: evidence of a damaged set can show people. Admin sees 10-minute
-- signed URLs only (app/api/admin/incidents). Paths live in customer_incidents.photo_urls.
insert into storage.buckets (id, name, public)
values ('incident-photos', 'incident-photos', false)
on conflict (id) do nothing;

-- Probation: new bookings go through the request + auto-pay flow. Marks why a
-- request exists so the owner text and the queue can say "approval needed".
alter table short_notice_requests add column if not exists reason text;   -- null/'short_notice' | 'probation'
notify pgrst, 'reload schema';
