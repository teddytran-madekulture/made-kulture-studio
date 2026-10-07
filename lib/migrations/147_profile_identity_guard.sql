-- 147_profile_identity_guard.sql — protecting who a member is (2026-10-07).
--
-- 1. Name, phone and Instagram on customer_profiles can only be changed by the
--    SERVICE ROLE (i.e. /api/account/profile after its checks). A signed-in
--    member writing their own row directly keeps the old values — same pattern
--    as guard_vendor_terms. Inserts (signup) are untouched.
-- 2. name_changed_at / instagram_changed_at drive the 30-day cooldown for
--    directory members.
-- 3. profile_change_log: every change to name / phone / Instagram, for admin.
--    (Email changes are already logged in customer_email_changes.)
-- 4. phone_verifications: 6-digit SMS codes for changing a phone number.

alter table customer_profiles add column if not exists name_changed_at      timestamptz;
alter table customer_profiles add column if not exists instagram_changed_at timestamptz;

create table if not exists profile_change_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  field      text not null,            -- 'full_name' | 'phone' | 'instagram'
  old_value  text,
  new_value  text,
  created_at timestamptz not null default now()
);
create index if not exists profile_change_log_created_idx on profile_change_log (created_at desc);
create index if not exists profile_change_log_user_idx on profile_change_log (user_id, created_at desc);
alter table profile_change_log enable row level security;

create table if not exists phone_verifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  phone      text not null,            -- 10 digits
  code_hash  text not null,
  attempts   int  not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists phone_verifications_user_idx on phone_verifications (user_id, created_at desc);
alter table phone_verifications enable row level security;

create or replace function guard_profile_identity_columns()
  returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.full_name            := old.full_name;
    new.phone                := old.phone;
    new.instagram            := old.instagram;
    new.name_changed_at      := old.name_changed_at;
    new.instagram_changed_at := old.instagram_changed_at;
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_identity on customer_profiles;
create trigger guard_profile_identity before update on customer_profiles
  for each row execute function guard_profile_identity_columns();

notify pgrst, 'reload schema';
