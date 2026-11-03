-- Purpose profiles: one row per auth user; username unique regardless of case
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- uniqueness is case-insensitive: ALI, Ali and ali are the same identifier
create unique index profiles_username_lower_key on public.profiles (lower(username));

-- keep updated_at fresh
create or replace function public.set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- the username is the permanent identity: it cannot be changed later
create or replace function public.prevent_username_change() returns trigger
language plpgsql
as $$
begin
  if new.username is distinct from old.username then
    raise exception 'username cannot be changed';
  end if;
  return new;
end $$;

create trigger profiles_protect_username
  before update on public.profiles
  for each row execute function public.prevent_username_change();

-- create the profile automatically when an auth user is created
-- (username passed as user metadata at signup)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(coalesce(new.email, 'user'), '@', 1))
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();