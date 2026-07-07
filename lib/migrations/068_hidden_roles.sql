-- ============================================
-- Migration 068 — Hidden roles
-- ============================================
-- Lets an owner suppress any role (built-in or custom) so it disappears from
-- signup, profiles, and the directory filter. Built-in roles live in code
-- (lib/roles.ts); hiding one just records its name here. /api/roles subtracts
-- this set from the effective list. Custom roles are removed by deleting their
-- directory_roles row instead; this table is only for hiding built-ins (and as
-- a belt-and-suspenders hide for customs).

create table if not exists hidden_roles (
  role      text primary key,
  hidden_at timestamptz not null default now()
);
alter table hidden_roles enable row level security;
