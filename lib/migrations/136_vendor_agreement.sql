-- 136_vendor_agreement.sql — Production Services Vendor Agreement gate (2026-10-03).
-- A member must accept lib/vendor-agreement.ts before creating listings. The
-- acceptance is stamped here, and the service_listings INSERT policy refuses a
-- row from anyone who hasn't accepted, so the UI cannot be bypassed.
alter table customer_profiles add column if not exists vendor_terms_accepted_at timestamptz;
alter table customer_profiles add column if not exists vendor_terms_version     text;
alter table customer_profiles add column if not exists vendor_terms_name        text;

drop policy if exists "listings insert own" on service_listings;
create policy "listings insert own" on service_listings for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from customer_profiles p where p.id = auth.uid() and p.vendor_terms_accepted_at is not null)
  );

notify pgrst, 'reload schema';
