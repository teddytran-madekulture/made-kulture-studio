-- 171 — birth date on member profiles (2026-10-16)
--
-- Teddy: "just add the birth date requirement for now". Collected at signup
-- (email form -> auth metadata -> handle_new_user below) and on /welcome for
-- Google/Apple sign-ups and for existing members who don't have one yet.
-- Private: never shown on a profile, never returned by the directory routes
-- (they select explicit columns). No perks or age rules hang off it yet.
--
-- Set-once from the member side: /api/account/profile only writes it while it
-- is still NULL (via the service role). Changing it later goes through admin.

alter table customer_profiles add column if not exists birth_date date;

-- Under-18 block (Teddy 2026-10-16: the parent signs up, never the kid).
-- Stamped when someone enters an under-18 date on /welcome (Google/Apple
-- sign-ups and existing members — their auth account already exists). The
-- account area then shows only the "18 or older" message; admin gets a push.
alter table customer_profiles add column if not exists underage_blocked_at timestamptz;

-- Same function as 039, plus birth_date. A malformed or missing value in the
-- metadata becomes NULL instead of failing the signup (the cast is guarded).
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  bd date;
begin
  begin
    bd := nullif(new.raw_user_meta_data->>'birth_date', '')::date;
  exception when others then
    bd := null;
  end;

  -- Server-side backstop for the signup form's own check: an email signup
  -- carrying an under-18 date fails outright, so editing the page can't get
  -- around it. (Google/Apple sign-ups carry no date and are handled on /welcome.)
  if bd is not null and bd > (current_date - interval '18 years')::date then
    raise exception 'UNDERAGE: accounts are 18+';
  end if;

  insert into public.customer_profiles (id, full_name, phone, roles, instagram, directory_opt_in, onboarded, account_type, birth_date)
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
    coalesce((new.raw_user_meta_data->>'directory_opt_in')::boolean, false),
    (new.raw_user_meta_data ? 'directory_opt_in'),
    coalesce(nullif(new.raw_user_meta_data->>'account_type', ''), 'customer'),
    case when bd between date '1900-01-01' and current_date then bd else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

notify pgrst, 'reload schema';
