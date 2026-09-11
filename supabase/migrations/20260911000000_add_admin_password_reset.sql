-- Existing accounts, passwords and login functions are left unchanged.
begin;

alter table public.app_users drop constraint app_users_role_check;
alter table public.app_users add constraint app_users_role_check
  check (role in ('student', 'teacher', 'admin'));

-- Only the trusted API may call this RPC. Never accept the admin ID from a client.
create or replace function public.app_admin_reset_password(p_admin_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform id from public.app_users
  where id = p_admin_id and role = 'admin' and active = true
  for update;
  if not found then
    raise exception 'ADMIN_REQUIRED';
  end if;

  perform id from public.app_users
  where id = p_user_id and role in ('student', 'teacher')
  for update;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;

  -- Same bcrypt hashing and session revocation as app_change_password.
  update public.app_users
  set password_hash = extensions.crypt('0000', extensions.gen_salt('bf')),
      updated_at = now()
  where id = p_user_id;
  delete from public.app_sessions where user_id = p_user_id;
  return true;
end;
$$;

revoke all on function public.app_admin_reset_password(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_admin_reset_password(uuid, uuid) to service_role;

commit;
