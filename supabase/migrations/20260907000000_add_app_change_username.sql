create or replace function public.app_change_username(
  p_user_id uuid,
  p_new_username text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  old_name text;
  next_name text := btrim(coalesce(p_new_username, ''));
begin
  select username
  into old_name
  from public.app_users
  where id = p_user_id
    and active = true
  for update;

  if old_name is null then
    raise exception 'USER_NOT_FOUND';
  end if;
  if char_length(next_name) < 1 or char_length(next_name) > 30 then
    raise exception 'INVALID_USERNAME';
  end if;
  if next_name = '선생님' then
    raise exception 'RESERVED_USERNAME';
  end if;
  if next_name = old_name then
    return jsonb_build_object('username', old_name);
  end if;
  if exists (
    select 1
    from public.app_users
    where username = next_name
      and id <> p_user_id
  ) then
    raise exception 'USERNAME_TAKEN';
  end if;

  begin
    update public.app_users
    set username = next_name,
        updated_at = now()
    where id = p_user_id;
  exception
    when unique_violation then
      raise exception 'USERNAME_TAKEN';
  end;

  update public.app_shared_state as state
  set value = coalesce((
    select jsonb_agg(
      item
      || case when item->>'name' = old_name then jsonb_build_object('name', next_name) else '{}'::jsonb end
      || case when item->>'username' = old_name then jsonb_build_object('username', next_name) else '{}'::jsonb end
      order by position
    )
    from jsonb_array_elements(state.value) with ordinality as entry(item, position)
  ), '[]'::jsonb),
      updated_at = now()
  where key = 'lin-homework-v3-students'
    and jsonb_typeof(value) = 'array';

  update public.app_shared_state
  set value = (value - old_name) || jsonb_build_object(next_name, value->old_name),
      updated_at = now()
  where key in ('lin-homework-v3-vocab', 'lin-homework-v3-notice-dismissed')
    and jsonb_typeof(value) = 'object'
    and value ? old_name;

  update public.app_shared_state as state
  set value = coalesce((
    select jsonb_agg(
      case
        when jsonb_typeof(item->'subs') = 'object' and (item->'subs') ? old_name
          then item || jsonb_build_object(
            'subs', ((item->'subs') - old_name) || jsonb_build_object(next_name, item->'subs'->old_name)
          )
        else item
      end
      order by position
    )
    from jsonb_array_elements(state.value) with ordinality as entry(item, position)
  ), '[]'::jsonb),
      updated_at = now()
  where key = 'lin-homework-v3-assigns'
    and jsonb_typeof(value) = 'array';

  update public.app_shared_state as state
  set value = coalesce((
    select jsonb_agg(
      item
      || case when item->>'user' = old_name then jsonb_build_object('user', next_name) else '{}'::jsonb end
      || case when item->>'student' = old_name then jsonb_build_object('student', next_name) else '{}'::jsonb end
      || case when item->>'sender' = old_name then jsonb_build_object('sender', next_name) else '{}'::jsonb end
      || case
          when item->>'kind' in ('submission', 'contact') and item ? 'message'
            then jsonb_build_object('message', replace(item->>'message', '[' || old_name || ']', '[' || next_name || ']'))
          else '{}'::jsonb
        end
      order by position
    )
    from jsonb_array_elements(state.value) with ordinality as entry(item, position)
  ), '[]'::jsonb),
      updated_at = now()
  where key = 'lin-homework-v3-notices'
    and jsonb_typeof(value) = 'array';

  return jsonb_build_object('username', next_name);
end;
$$;

revoke all on function public.app_change_username(uuid, text) from public, anon, authenticated;
grant execute on function public.app_change_username(uuid, text) to service_role;
