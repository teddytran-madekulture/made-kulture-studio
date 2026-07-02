-- Sign-up / creative-directory upgrades:
--  1. Extend handle_new_user so a new signup's instagram + directory visibility
--     persist from auth metadata (new members default to VISIBLE = opt-in true).
--  2. role_suggestions: custom "Other" roles people type, queued for owner review.
--  3. directory_roles: owner-approved extra roles, added on top of the code list.

-- 1. New-user trigger (extends the existing full_name/phone/roles copy) ──────────
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
begin
  insert into public.customer_profiles (id, full_name, phone, roles, instagram, directory_opt_in)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    coalesce(
      (select array_agg(value) from jsonb_array_elements_text(
        case when jsonb_typeof(new.raw_user_meta_data->'roles') = 'array'
             then new.raw_user_meta_data->'roles'
             else '[]'::jsonb end
      )),
      '{}'
    ),
    nullif(new.raw_user_meta_data->>'instagram', ''),
    -- New members are visible by default; only an explicit "false" opts them out.
    coalesce((new.raw_user_meta_data->>'directory_opt_in')::boolean, true)
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- 2. Custom-role suggestions (owner reviews these) ─────────────────────────────
create table if not exists role_suggestions (
  id             uuid primary key default gen_random_uuid(),
  role           text not null,
  suggested_by   uuid,
  suggested_email text,
  status         text not null default 'pending',   -- pending | approved | dismissed
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);
alter table role_suggestions enable row level security;
create index if not exists role_suggestions_status_idx on role_suggestions (status, created_at desc);

-- 3. Owner-approved extra roles (shown alongside the built-in list) ─────────────
create table if not exists directory_roles (
  role      text primary key,
  added_at  timestamptz not null default now()
);
alter table directory_roles enable row level security;
