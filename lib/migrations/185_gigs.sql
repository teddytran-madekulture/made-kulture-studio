-- 185 — GIGS (2026-11-21). Paid creative work shared with the directory.
--
-- Two ways a gig gets here:
--   * a listed Brand or Vendor account posts it        (posted_by = 'member')
--     -> status 'pending' until Teddy approves it in /admin/gigs
--   * Teddy posts it for an outside company            (posted_by = 'studio')
--     -> goes live straight away; the company gets a private manage link
--        (manage_token) to see applicants and reply. No account needed.
--
-- Contact details never change hands through this feature: a member-posted
-- gig opens a normal directory DM; a studio-posted gig keeps its back-and-forth
-- in gig_messages, relayed by email. company_email is PRIVATE (admin + the
-- manage link only), never returned to members.
--
-- Member alerts go out ONCE, when a gig goes live (alerts_sent_at is the claim),
-- to listed members whose roles overlap roles_needed and who have notify_gigs on.
--
-- Service-role only: RLS ON with NO policies.

create table if not exists gigs (
  id                uuid primary key default gen_random_uuid(),
  posted_by         text not null check (posted_by in ('member','studio')),
  poster_id         uuid references auth.users(id) on delete set null,   -- null for studio-posted
  company_name      text not null,
  company_email     text,                                                -- studio-posted only; PRIVATE
  manage_token      uuid not null unique default gen_random_uuid(),
  title             text not null,
  description       text,
  roles_needed      text[] not null default '{}',
  pay               text not null,                                       -- "$400 / day", "$1,500 flat" — paid gigs only
  gig_date          date,
  date_note         text,                                                -- "Dec 3-5", "flexible"
  location          text,
  at_studio         boolean not null default false,
  apply_by          date,
  status            text not null default 'pending'
                    check (status in ('pending','live','declined','pulled','filled','closed')),
  decline_reason    text,
  pull_reason       text,                                                -- 'reports' | 'admin'
  approved_at       timestamptz,
  alerts_sent_at    timestamptz,
  alerts_count      int,
  terms_accepted_at timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists gigs_status_idx on gigs (status, expires_at);
create index if not exists gigs_poster_idx on gigs (poster_id);
alter table gigs enable row level security;

create table if not exists gig_applications (
  id               uuid primary key default gen_random_uuid(),
  gig_id           uuid not null references gigs(id) on delete cascade,
  applicant_id     uuid not null references auth.users(id) on delete cascade,
  note             text,
  conversation_id  uuid,                                                 -- member-posted gigs: the DM it opened
  seen_at          timestamptz,                                          -- poster / company opened it
  created_at       timestamptz not null default now(),
  unique (gig_id, applicant_id)
);
create index if not exists gig_applications_gig_idx on gig_applications (gig_id);
alter table gig_applications enable row level security;

-- Studio-posted gigs only: the relayed thread between the company and one applicant.
create table if not exists gig_messages (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references gig_applications(id) on delete cascade,
  sender          text not null check (sender in ('company','member')),
  body            text not null,
  created_at      timestamptz not null default now()
);
create index if not exists gig_messages_app_idx on gig_messages (application_id, created_at);
alter table gig_messages enable row level security;

create table if not exists gig_reports (
  id          uuid primary key default gen_random_uuid(),
  gig_id      uuid not null references gigs(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason      text not null,
  note        text,
  status      text not null default 'open' check (status in ('open','dismissed')),
  created_at  timestamptz not null default now(),
  unique (gig_id, reporter_id)
);
alter table gig_reports enable row level security;

-- Members' "Gig alerts" switch (Settings -> Directory & notifications). On by default.
alter table customer_profiles add column if not exists notify_gigs boolean not null default true;

notify pgrst, 'reload schema';
