-- ============================================
-- Migration 067 — Funding opportunities tracker
-- ============================================
-- A simple pipeline of grants / loans / rebates the studio can pursue to fund
-- the buildout. Teddy updates status + next action as he works each one.
-- Seeded once (only if empty) from the 2026 funding research.

create table if not exists funding_opportunities (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  type         text,                                  -- 'Grant' | 'Loan' | 'Rebate' | 'Advising'
  amount       text,                                  -- freeform, e.g. '$5K–$250K'
  fit          int  not null default 3,               -- 1–5 (how well it fits Made Kulture)
  status       text not null default 'not_started',   -- not_started|researching|preparing|applied|approved|declined
  deadline     text,                                  -- freeform: 'Open now', 'Fall 2026', or a date
  next_action  text,
  url          text,
  notes        text,
  sort         int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Seed the research-backed pipeline, but only if the table is empty.
insert into funding_opportunities (name, type, amount, fit, status, deadline, next_action, url, sort)
select * from (values
  ('Harris County Opportunity Fund (PeopleFund)', 'Loan',     '$5K–$250K',    5, 'not_started', 'Open now',                'Prep fact sheet + docs, then open inquiry',       'https://peoplefund.org/harris-county-opportunity-fund/', 1),
  ('SBA 504 Loan (via a CDC)',                    'Loan',     'up to $5.5M',  4, 'not_started', 'Open (bigger paperwork)', 'Talk to a Houston CDC once the ask is sized',      'https://www.sba.gov/funding-programs/loans/504-loans',   2),
  ('PeopleFund / LiftFund (CDFI)',                'Loan',     'up to $50K+',  4, 'not_started', 'Open now',                'Same intake as the Opportunity Fund',             'https://peoplefund.org/',                                3),
  ('FedEx Entrepreneur Fund (Hello Alice)',       'Grant',    '$10K',         3, 'not_started', 'Closed — reopens ~Fall 2026', 'Draft the pitch now; apply the day it opens',  'https://helloalice.com/grants/fedex/',                   4),
  ('Hello Alice rotating grants',                 'Grant',    '$5K–$25K',     3, 'not_started', 'Rolling',                 'Create a free profile; watch the listings',       'https://helloalice.com/funding/grants/',                 5),
  ('CenterPoint commercial HVAC rebate',          'Rebate',   'per-ton',      4, 'not_started', 'Open (yearly terms)',     'Use a registered contractor for the A/C install', 'https://www.centerpointenergy.com/en-us/SaveEnergyandMoney/Pages/centerpoint-efficiency.aspx?sa=HO&au=bus', 6),
  ('Texas Small Business Credit Initiative',      'Loan',     'varies',       3, 'not_started', 'Open',                    'Route through the UH SBDC',                       'https://gov.texas.gov/business/page/financing-and-capital', 7),
  ('UH SBDC / Houston Business Solutions Center', 'Advising', 'free',         5, 'not_started', 'Open',                    'Book a free advisor session',                     'https://www.sbdc.uh.edu/sbdc/How-To-Get-Business-Financing-In-Houston.asp', 8)
) as v(name, type, amount, fit, status, deadline, next_action, url, sort)
where not exists (select 1 from funding_opportunities);
