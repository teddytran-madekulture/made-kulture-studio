-- Account type: members are either a Creative (individual) or a Brand (company
-- that hires creatives / posts castings). Default creative.
alter table customer_profiles add column if not exists account_type text not null default 'creative';

-- Extend the new-user trigger so account_type persists from signup metadata.
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
    coalesce((new.raw_user_meta_data->>'directory_opt_in')::boolean, true),
    (new.raw_user_meta_data ? 'directory_opt_in'),
    coalesce(nullif(new.raw_user_meta_data->>'account_type', ''), 'creative')
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
