-- Migration 159 — Mini Sessions: photographer approves slot switches (2026-10-09)
-- Per mini-session day toggle. With it on, a client's "switch" becomes a request
-- (pending_slot) that the photographer approves or declines from the roster.
alter table mini_sessions add column if not exists approve_switches boolean not null default false;
alter table mini_session_clients add column if not exists pending_slot integer check (pending_slot is null or pending_slot >= 0);
notify pgrst, 'reload schema';
