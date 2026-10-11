-- 166_partners.sql — Partner links (2026-10-11).
--
-- A partner (first: Neil Jou Agency) gets a short link, madekulture.com/p/<code>.
-- Opening it drops a 30-day `mk_ref` cookie; a website booking made while the
-- cookie is set is stamped with bookings.partner_code. /admin/partners shows
-- clicks, bookings and revenue per partner. Tracking only — no reward is paid
-- automatically (Teddy decides any studio-credit perk by hand).
--
-- ⚠️ /api/bookings stamps partner_code with a SEPARATE update after the insert,
-- never inside it: the insert runs after the card is charged, so a column
-- problem there would charge a card and create no booking.
--
-- RLS enabled with NO policies = service role only.

create table if not exists partners (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  name        text not null,
  owner_id    uuid references auth.users(id) on delete set null,
  note        text not null default '',
  active      boolean not null default true,
  clicks      integer not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists partners_code_uq on partners (lower(code));
alter table partners enable row level security;

alter table bookings add column if not exists partner_code text;
create index if not exists bookings_partner_code_idx on bookings (partner_code) where partner_code is not null;

notify pgrst, 'reload schema';
