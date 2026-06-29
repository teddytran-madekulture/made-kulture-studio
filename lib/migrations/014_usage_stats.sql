-- ============================================
-- Migration 014 — Usage stats RPC for the admin usage monitor
-- ============================================
-- pg_database_size and the storage.objects table aren't reachable through the
-- normal API, so this security-definer function exposes just the two numbers
-- the usage panel needs. Row counts are done with normal count queries.

create or replace function public.admin_usage_stats()
returns json
language sql
security definer
set search_path = public, storage
as $$
  select json_build_object(
    'db_bytes',      pg_database_size(current_database()),
    'avatar_bytes',  coalesce((select sum((metadata->>'size')::bigint) from storage.objects where bucket_id = 'avatars'), 0),
    'storage_bytes', coalesce((select sum((metadata->>'size')::bigint) from storage.objects), 0)
  );
$$;
