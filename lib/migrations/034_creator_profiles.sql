-- Phase 1 of the creator community: richer member profiles + portfolios.
--   1. New profile columns (bio, links, video, contact-display toggles).
--   2. portfolio_images table (per-member gallery) + RLS + a hard 12-image cap.
--   3. Public 'portfolios' storage bucket + per-user-folder policies.
-- Members-only viewing is enforced at the API layer (same rule as the directory).

-- 1. Profile fields ────────────────────────────────────────────────────────────
alter table customer_profiles add column if not exists bio         text;
alter table customer_profiles add column if not exists links       jsonb   not null default '[]'::jsonb; -- [{label,url}]
alter table customer_profiles add column if not exists video_url   text;
alter table customer_profiles add column if not exists show_email  boolean not null default false;
alter table customer_profiles add column if not exists show_phone  boolean not null default false;

-- 2. Portfolio images ──────────────────────────────────────────────────────────
create table if not exists portfolio_images (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  url         text not null,
  sort_order  int  not null default 0,
  is_mature   boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table portfolio_images enable row level security;
create index if not exists portfolio_images_user_idx on portfolio_images (user_id, sort_order);

-- A member manages only their own image rows; any signed-in member may read
-- (profile pages are members-only, also enforced in the API).
drop policy if exists "portfolio read"        on portfolio_images;
drop policy if exists "portfolio insert own"  on portfolio_images;
drop policy if exists "portfolio update own"  on portfolio_images;
drop policy if exists "portfolio delete own"  on portfolio_images;
create policy "portfolio read"       on portfolio_images for select to authenticated using (true);
create policy "portfolio insert own" on portfolio_images for insert to authenticated with check (auth.uid() = user_id);
create policy "portfolio update own" on portfolio_images for update to authenticated using (auth.uid() = user_id);
create policy "portfolio delete own" on portfolio_images for delete to authenticated using (auth.uid() = user_id);

-- Hard cap: max 12 images per member (enforced server-side, not just in the UI).
create or replace function enforce_portfolio_cap()
  returns trigger
  language plpgsql
as $$
begin
  if (select count(*) from portfolio_images where user_id = new.user_id) >= 12 then
    raise exception 'Portfolio limit reached (max 12 images).';
  end if;
  return new;
end;
$$;
drop trigger if exists portfolio_cap on portfolio_images;
create trigger portfolio_cap before insert on portfolio_images
  for each row execute function enforce_portfolio_cap();

-- 3. Storage bucket for portfolio images ───────────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('portfolios', 'portfolios', true)
  on conflict (id) do nothing;

-- Files live under <user_id>/<filename>. A member may write only inside their
-- own folder; everyone (with the URL) can read (bucket is public).
drop policy if exists "portfolios read"        on storage.objects;
drop policy if exists "portfolios insert own"  on storage.objects;
drop policy if exists "portfolios update own"  on storage.objects;
drop policy if exists "portfolios delete own"  on storage.objects;
create policy "portfolios read" on storage.objects
  for select using (bucket_id = 'portfolios');
create policy "portfolios insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'portfolios' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "portfolios update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'portfolios' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "portfolios delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'portfolios' and (storage.foldername(name))[1] = auth.uid()::text);
