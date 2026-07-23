-- Phase 1 of the staffing system: the onboarding / operations-manual container.
--   worker_profiles     — a person who is (or is becoming) a studio worker
--   onboarding_modules  — versioned orientation modules + quiz (jsonb)
--   onboarding_progress — a worker's pass/score per module version
-- Marketplace pieces (shift board, clock-in, reviews, Square Payroll sync) come
-- in later phases. Access is service-role only; the app enforces per-user scope at
-- the API layer (same pattern as the directory / promos).

-- Enums (idempotent) ────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'worker_class') then
    create type worker_class as enum ('attendant','sanitation','intern','freelancer');
  end if;
  if not exists (select 1 from pg_type where typname = 'worker_status') then
    create type worker_status as enum ('applicant','active','inactive');
  end if;
end $$;

-- worker_profiles ────────────────────────────────────────────────────────────────
create table if not exists worker_profiles (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid references auth.users(id) on delete cascade,  -- member login; nullable until claimed
  email         text,
  full_name     text,
  worker_class  worker_class not null,
  status        worker_status not null default 'applicant',
  learning_only boolean not null default false,   -- true for intern/student
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table worker_profiles enable row level security;   -- service-role only
create unique index if not exists worker_profiles_account_idx
  on worker_profiles (account_id) where account_id is not null;
create index if not exists worker_profiles_class_idx on worker_profiles (worker_class, status);

-- onboarding_modules ─────────────────────────────────────────────────────────────
create table if not exists onboarding_modules (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null,
  title        text not null,
  body         text not null default '',
  version      int  not null default 1,
  required_for worker_class[] not null default '{}',
  quiz         jsonb not null default '{"pass_pct":80,"retake_on_miss":false,"questions":[]}'::jsonb,
  sort_order   int  not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (slug, version)
);
alter table onboarding_modules enable row level security;   -- service-role only
create index if not exists onboarding_modules_slug_idx on onboarding_modules (slug, version desc);

-- onboarding_progress ────────────────────────────────────────────────────────────
create table if not exists onboarding_progress (
  id             uuid primary key default gen_random_uuid(),
  worker_id      uuid not null references worker_profiles(id) on delete cascade,
  module_slug    text not null,
  module_version int  not null,
  passed         boolean not null default false,
  score_pct      int,
  answers        jsonb,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (worker_id, module_slug, module_version)
);
alter table onboarding_progress enable row level security;   -- service-role only
create index if not exists onboarding_progress_worker_idx on onboarding_progress (worker_id);
