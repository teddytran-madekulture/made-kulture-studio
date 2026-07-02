-- Make 'customer' the default account type: most people who create an account
-- are just booking, not joining the creative community. Creative/Brand is now an
-- opt-in. Existing rows keep whatever they already have.
alter table customer_profiles alter column account_type set default 'customer';

-- Trigger default → 'customer' (was 'creative'). Only the tail line changes, but
-- we recreate the whole function so it stays in sync.
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
begin
  insert into public.customer_profiles (id, full_name, phone, roles, instagram, directory_opt_in, onboarded, account_type)
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
    coalesce(nullif(new.raw_user_meta_data->>'account_type', ''), 'customer')
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
