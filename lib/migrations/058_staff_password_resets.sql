-- ============================================
-- Migration 058 — Staff password reset (forgot-password magic link)
-- ============================================
-- One-time, expiring tokens so a locked-out staff member (esp. the sole Owner)
-- can recover access via an email link — the staff-side equivalent of the admin
-- magic-link recovery. DB-backed (not in-memory) so it survives serverless
-- cold starts and works across Vercel instances.

create table if not exists staff_password_resets (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff_users(id) on delete cascade,
  token_hash  text not null,               -- sha256 of the emailed token
  expires_at  timestamptz not null,
  used_at     timestamptz,                 -- one-time use guard
  created_at  timestamptz not null default now()
);
create index if not exists staff_password_resets_token_idx on staff_password_resets (token_hash);

alter table staff_password_resets enable row level security;
