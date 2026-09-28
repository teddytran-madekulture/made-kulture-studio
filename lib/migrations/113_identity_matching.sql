-- 113_identity_matching.sql — recognise a suspended customer under new details.
-- lib/identity-match.ts. Both tables service-role only (RLS on, zero policies).

-- Square gives every card a fingerprint that stays the same across accounts.
-- Recorded whenever a card is used, so a later suspension recognises it.
create table if not exists customer_card_fingerprints (
  fingerprint     text not null,
  customer_id     uuid not null references customers(id) on delete cascade,
  square_card_id  text,
  last4           text,
  brand           text,
  billing_postal  text,
  seen_at         timestamptz not null default now(),
  primary key (fingerprint, customer_id)
);
create index if not exists ccf_customer_idx on customer_card_fingerprints (customer_id);
alter table customer_card_fingerprints enable row level security;

-- Every match found, blocked or flagged — what Teddy reviews on /admin/standing.
create table if not exists identity_matches (
  id                    uuid primary key default gen_random_uuid(),
  suspended_customer_id uuid references customers(id) on delete set null,
  signal                text not null,   -- card | phone | email | payer | instagram | name_zip
  strength              text not null,   -- strong | weak
  detail                text,
  action                text not null,   -- blocked | flagged
  booker                text,            -- who was booking (name · email)
  where_seen            text,            -- which door
  created_at            timestamptz not null default now()
);
create index if not exists identity_matches_created_idx on identity_matches (created_at desc);
alter table identity_matches enable row level security;

notify pgrst, 'reload schema';
