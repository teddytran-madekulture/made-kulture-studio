-- Migration 162 — Mini Sessions: cover photo + pay link (2026-10-09)
-- The photographer's cover image tops the sign-up page, the link preview
-- (Open Graph) and the downloadable flyer. Stored in a public bucket.
-- payment_url is the photographer's OWN pay link (Venmo, Cash App, PayPal,
-- Square, Stripe…). Clients see a "Pay" button; Made Kulture never touches it.
alter table mini_sessions add column if not exists cover_url text;
alter table mini_sessions add column if not exists payment_url text;

insert into storage.buckets (id, name, public)
values ('mini-media', 'mini-media', true)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
