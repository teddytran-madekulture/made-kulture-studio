-- ============================================
-- Migration 021 — Props directory
-- ============================================
-- A browse-only catalog of studio props (included with every booking). Mirrors
-- the equipment catalog but with no price, quantity, or availability tracking.

create table if not exists props (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category     text,                                  -- Misc | Bench | Tables | Sofas | Chairs | Fitness
  description  text,
  image_url    text,
  needs_repair boolean not null default false,        -- flag for props that need fixing
  is_active    boolean not null default true,         -- hidden from the public directory when false
  sort_order   int     not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists props_category_idx on props (category);

-- Service-role only (all prop APIs use the service key); RLS protects against anon access.
alter table props enable row level security;
