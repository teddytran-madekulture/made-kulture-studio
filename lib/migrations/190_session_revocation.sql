-- 190 — REAL LOGOUT (2026-11-23). Admin and staff cookies are signed tokens the
-- server could not cancel: logging out only deleted the cookie in THAT browser,
-- so a copied cookie kept working until it expired (7 days admin, 12h staff).
--
-- admin_session_revocations = the list of cancelled admin sessions. A row whose
-- id is a session id cancels that one session; the row '__all__' cancels every
-- session issued at or before its revoked_at ("Sign out all devices").
-- A session with NO row is valid, so LOGIN NEVER DEPENDS ON THIS TABLE.
-- middleware.ts checks it on every request that carries an admin cookie.
--
-- staff_users.sessions_valid_after = staff sessions issued before this are
-- refused (set at staff logout). Deactivating a staff account or changing its
-- role is also enforced on the next request by the same middleware check.
--
-- Service-role only: RLS ON with NO policies.
create table if not exists admin_session_revocations (
  id         text primary key,
  revoked_at timestamptz not null default now()
);
alter table admin_session_revocations enable row level security;

alter table staff_users add column if not exists sessions_valid_after timestamptz;
