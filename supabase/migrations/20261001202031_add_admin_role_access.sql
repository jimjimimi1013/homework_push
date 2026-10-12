begin;

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users add constraint app_users_role_check
  check (role in ('student', 'teacher', 'admin'));

update public.app_users
set role = 'admin', updated_at = now()
where id = '1ae924bf-46f2-4c5c-b138-31204cc8ae14'
  and username = '김지아';

do $$
begin
  if not exists (
    select 1 from public.app_users
    where id = '1ae924bf-46f2-4c5c-b138-31204cc8ae14'
      and role = 'admin'
  ) then
    raise exception 'KIM_JIA_ACCOUNT_NOT_FOUND';
  end if;
end;
$$;

update public.app_shared_state
set value = (
      select coalesce(jsonb_agg(
        case when item ->> 'name' = '김지아'
          then item || '{"active": false}'::jsonb
          else item
        end
      ), '[]'::jsonb)
      from jsonb_array_elements(value) as item
    ),
    updated_at = now()
where key = 'lin-homework-v3-students'
  and jsonb_typeof(value) = 'array';

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
