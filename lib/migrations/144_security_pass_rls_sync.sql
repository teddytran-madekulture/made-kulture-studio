-- 144_security_pass_rls_sync.sql — 2026-10-06 security pass, database half.
--
-- 1. The repo and the live DB had drifted: six tables were created with no
--    RLS in these files, and lib/schema.sql still carries a public SELECT on
--    bookings — but a pg_catalog check on prod (2026-10-06) shows RLS ON for
--    every public table and the bookings policy already gone (both fixed by
--    hand in the dashboard). This makes the files say the same thing, so a
--    fresh environment is never built open. No-op on prod.
-- 2. customer_profiles.customers_update_own is a plain auth.uid() = id with
--    no column restriction, so a member could self-stamp the Vendor Agreement
--    (vendor_terms_accepted_at gates service_listings inserts, migration 136)
--    and list a service without ever agreeing. Same guard-trigger pattern as
--    migration 120's founding columns: only the service role may change them.
--    /api/listings/agreement already writes these with the service client.

-- 1. RLS on the tables the migrations left open (service-role only; no policies)
alter table if exists staff_users           enable row level security;
alter table if exists staff_audit_log       enable row level security;
alter table if exists square_devices        enable row level security;
alter table if exists site_images           enable row level security;
alter table if exists email_templates       enable row level security;
alter table if exists funding_opportunities enable row level security;

-- Bookings were readable by anyone (door codes, manage tokens, card ids).
drop policy if exists "availability is public" on bookings;

-- 2. Pin the Vendor Agreement columns to the service role.
create or replace function guard_vendor_terms_columns()
  returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.vendor_terms_accepted_at := null;
      new.vendor_terms_version     := null;
      new.vendor_terms_name        := null;
    else
      new.vendor_terms_accepted_at := old.vendor_terms_accepted_at;
      new.vendor_terms_version     := old.vendor_terms_version;
      new.vendor_terms_name        := old.vendor_terms_name;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_vendor_terms on customer_profiles;
create trigger guard_vendor_terms before insert or update on customer_profiles
  for each row execute function guard_vendor_terms_columns();

-- The leftover anon-callable SECURITY DEFINER function (migration 014).
revoke execute on function admin_usage_stats() from public, anon, authenticated;

notify pgrst, 'reload schema';
