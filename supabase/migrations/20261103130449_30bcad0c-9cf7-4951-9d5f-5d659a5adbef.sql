create or replace function public.set_updated_at() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.prevent_username_change() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.username is distinct from old.username then
    raise exception 'username cannot be changed';
  end if;
  return new;
end $$;

revoke execute on function public.handle_new_user() from anon, authenticated, public;