-- ============================================
-- Migration 019 — Front-desk staff accounts + audit log
-- ============================================
-- Adds individual employee logins with role-based permissions and an
-- append-only audit log of who did what. This is the foundation for the
-- front-desk operations console (Phase 1). NOTE: the DB `roles` columns
-- elsewhere are *creative* roles for customers (photographer/model) and are
-- unrelated to these staff roles.
--
-- Passwords and PINs are stored as scrypt hashes (salt:hash), never plaintext.
-- The first owner account is created at runtime via /api/staff/bootstrap
-- (authorized by the existing ADMIN_PASSWORD) — no password hash is seeded here.

create table if not exists staff_users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  name          text not null,
  role          text not null check (role in ('front_desk','manager','owner')),
  password_hash text not null,                 -- scrypt 'salt:hash'
  pin_hash      text,                          -- scrypt 'salt:hash' (optional quick-unlock)
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

create index if not exists staff_users_active_idx on staff_users (is_active) where is_active = true;

-- Append-only audit log. staff_name is denormalized so the log stays readable
-- even if a staff account is later deleted.
create table if not exists staff_audit_log (
  id            bigint generated always as identity primary key,
  staff_user_id uuid references staff_users(id) on delete set null,
  staff_name    text not null,
  action        text not null,                 -- e.g. 'booking.cancel', 'payment.refund', 'staff.create'
  entity_type   text,                          -- 'booking' | 'payment' | 'staff' | ...
  entity_id     text,
  amount_cents  int,                           -- for money actions
  details       jsonb,                         -- before/after, reason, etc.
  created_at    timestamptz not null default now()
);

create index if not exists staff_audit_log_created_idx on staff_audit_log (created_at desc);
create index if not exists staff_audit_log_staff_idx   on staff_audit_log (staff_user_id);
create index if not exists staff_audit_log_entity_idx  on staff_audit_log (entity_type, entity_id);
