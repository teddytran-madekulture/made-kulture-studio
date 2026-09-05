-- ============================================
-- Migration 104 — Concept reviews (messy / out-of-normal-operations requests)
-- ============================================
-- Paint, fake blood, glitter, smoke bombs and excessive oils are NOT allowed.
-- This is the only door past that, and it is deliberately narrow: the form is
-- NOT linked from site nav. June states the policy first and only mentions the
-- review if the guest presses, so a submission means somebody asked twice and
-- was willing to write a plan. A linked form would be an invitation and would
-- create more work, not less — same reasoning as /tour never being in the nav.
--
-- The field that does the most work is `materials`. "Body paint" is meaningless:
-- water-activated washes off, alcohol-based airbrush stains grout. Asking for the
-- actual product filters people who have not thought it through.
--
-- `location_plan` exists because of a real incident shape Teddy named: people do
-- the messy part in restrooms and on lounge chairs — areas nobody booked — and
-- nobody volunteers that unless asked directly.

create table if not exists concept_reviews (
  id             uuid primary key default gen_random_uuid(),

  -- who
  name           text not null,
  email          text not null,
  phone          text not null,

  -- booking context (may be deciding whether to book at all)
  has_booking    boolean not null default false,
  booking_date   date,
  set_names      text,

  -- the concept
  concept        text not null,
  materials      text not null,   -- exact products/brands. The filter field.
  location_plan  text not null,   -- where it happens AND where people apply/clean off
  headcount      int,

  -- the plans
  prep_plan      text not null,
  cleanup_plan   text not null,
  cleanup_minutes int,            -- must fit INSIDE booked time; cleanup is not free time

  -- references (private bucket; signed URLs only)
  photo_paths    text[] not null default '{}',

  -- acknowledgements, all required at submit
  acknowledged_at timestamptz,

  -- review
  status         text not null default 'pending',  -- pending | approved | declined
  deposit_amount numeric(10,2),                    -- refundable cleaning deposit set on approval
  decision_note  text,
  decision_token text unique not null,             -- one-tap approve/decline, same pattern as tour_requests
  decided_at     timestamptz,

  created_at     timestamptz not null default now()
);

create index if not exists concept_reviews_status_idx on concept_reviews (status, created_at desc);

-- WARNING: service-role only means RLS ENABLED with zero policies. RLS *disabled*
-- is a different state — the anon key would read every submission, including
-- reference photos' paths and the requester's phone and email. Migration 102
-- shipped with exactly this mistake.
alter table concept_reviews enable row level security;

-- Private bucket. Concept references can be personal (body paint, wardrobe), so
-- these are never public URLs — the admin view uses short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('concept-media', 'concept-media', false)
on conflict (id) do nothing;

-- June learns the door exists, and that it stays shut unless pushed on.
insert into agent_kb (topic, content)
select 'concept_review',
  'Messy or out-of-the-ordinary concepts (paint, fake blood, glitter, smoke bombs, excessive oils) are not allowed. Say that plainly first. ONLY if the guest presses further, tell them a concept review can be submitted at /concept-review, and that it asks for the full concept, the exact products they would use, where in the studio it would happen, a prep plan, a cleaning plan and reference photos. Approval is case by case, never guaranteed, and a refundable cleaning deposit applies if approved. Never offer the link unprompted, never say a concept is approved or likely to be approved, and never estimate the deposit amount. Water sets have no review path at all - see water_sets.'
where not exists (select 1 from agent_kb where topic = 'concept_review');
