-- ============================================
-- Migration 010 — Creative roles + searchable directory
-- ============================================
-- Customers can tag themselves with creative roles (photographer, model, MUA,
-- etc.) at signup or in their profile, and opt in to a searchable directory so
-- others can find collaborators. directory_opt_in is OFF by default — a person
-- only appears in the directory if they explicitly turn it on.

alter table customer_profiles add column if not exists roles            text[] not null default '{}';
alter table customer_profiles add column if not exists directory_opt_in boolean not null default false;

-- GIN index for fast "has role X" lookups; partial index for opted-in members.
create index if not exists customer_profiles_roles_idx on customer_profiles using gin (roles);
create index if not exists customer_profiles_directory_idx on customer_profiles (directory_opt_in) where directory_opt_in = true;
