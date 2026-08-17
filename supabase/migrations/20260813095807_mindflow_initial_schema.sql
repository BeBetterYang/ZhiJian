create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  phone text,
  avatar jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (char_length(username) between 2 and 30),
  constraint profiles_phone_format check (phone is null or phone ~ '^1[3-9][0-9]{9}$'),
  constraint profiles_avatar_object check (jsonb_typeof(avatar) = 'object')
);

create unique index profiles_username_lower_key on public.profiles (lower(username));
create unique index profiles_phone_key on public.profiles (phone) where phone is not null;

create table public.libraries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint libraries_data_object check (jsonb_typeof(data) = 'object')
);

create table public.mind_maps (
  user_id uuid not null references auth.users(id) on delete cascade,
  map_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, map_id),
  constraint mind_maps_id_format check (map_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint mind_maps_data_object check (jsonb_typeof(data) = 'object')
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger libraries_set_updated_at
before update on public.libraries
for each row execute function private.set_updated_at();

create trigger mind_maps_set_updated_at
before update on public.mind_maps
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, username, phone)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1)),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  );
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.libraries enable row level security;
alter table public.mind_maps enable row level security;

create policy profiles_select_own
on public.profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy profiles_update_own
on public.profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy libraries_select_own
on public.libraries for select
to authenticated
using ((select auth.uid()) = user_id);

create policy libraries_insert_own
on public.libraries for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy libraries_update_own
on public.libraries for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy mind_maps_select_own
on public.mind_maps for select
to authenticated
using ((select auth.uid()) = user_id);

create policy mind_maps_insert_own
on public.mind_maps for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy mind_maps_update_own
on public.mind_maps for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy mind_maps_delete_own
on public.mind_maps for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.profiles, public.libraries, public.mind_maps from anon;
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.libraries to authenticated;
grant select, insert, update, delete on public.mind_maps to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'map-assets',
  'map-assets',
  true,
  15728640,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy map_assets_select_own
on storage.objects for select
to authenticated
using (
  bucket_id = 'map-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy map_assets_insert_own
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'map-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy map_assets_update_own
on storage.objects for update
to authenticated
using (
  bucket_id = 'map-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'map-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy map_assets_delete_own
on storage.objects for delete
to authenticated
using (
  bucket_id = 'map-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
