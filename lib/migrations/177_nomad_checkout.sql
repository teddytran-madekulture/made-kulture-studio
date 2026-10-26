-- 177 — Nomad check-out checklist + photos (2026-10-26). Before leaving, the
-- member ticks the checklist and takes photos of the space, so there's a record
-- of how the house was left. Logic: app/api/account/nomad (action 'checkout'),
-- app/api/account/nomad/checkout-photo, lib/nomad-checkout.ts.
-- RLS ON, ZERO policies = service role only (same rule as 174).

alter table nomad_stays add column if not exists checked_out_at timestamptz;
alter table nomad_stays add column if not exists checkout_reminded_at timestamptz;

create table if not exists nomad_checkouts (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  stay_id            uuid not null unique references nomad_stays(id) on delete cascade,
  membership_id      uuid not null references nomad_memberships(id) on delete cascade,
  house_id           uuid,
  checklist          jsonb not null default '{}'::jsonb,
  notes              text,
  photos             text[] not null default '{}'   -- paths in the private nomad-checkout bucket
);
alter table nomad_checkouts enable row level security;

-- Private bucket: photos of the inside of the house. Admin sees signed URLs only.
insert into storage.buckets (id, name, public)
values ('nomad-checkout', 'nomad-checkout', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
