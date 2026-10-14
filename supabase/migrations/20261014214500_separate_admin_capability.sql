begin;

alter table public.app_users
  add column if not exists is_admin boolean not null default false;

update public.app_users
set role = 'student',
    is_admin = true,
    active = true,
    updated_at = now()
where id = '1ae924bf-46f2-4c5c-b138-31204cc8ae14'
  and username = '김지아';

do $$
begin
  if not exists (
    select 1
    from public.app_users
    where id = '1ae924bf-46f2-4c5c-b138-31204cc8ae14'
      and username = '김지아'
      and role = 'student'
      and is_admin = true
      and active = true
  ) then
    raise exception 'KIM_JIA_ACCOUNT_NOT_FOUND';
  end if;
end;
$$;

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users add constraint app_users_role_check
  check (role in ('student', 'teacher'));

update public.app_shared_state
set value = (
      select coalesce(jsonb_agg(
        case when item ->> 'name' = '김지아'
          then item || '{"active": true}'::jsonb
          else item
        end
      ), '[]'::jsonb)
      from jsonb_array_elements(value) as item
    ),
    updated_at = now()
where key = 'lin-homework-v3-students'
  and jsonb_typeof(value) = 'array';

create or replace function public.app_login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  u public.app_users%rowtype;
  t uuid;
begin
  select * into u
  from public.app_users
  where username = trim(p_username) and active = true
  limit 1;

  if u.id is null or extensions.crypt(p_password, u.password_hash) <> u.password_hash then
    raise exception 'INVALID_LOGIN';
  end if;

  delete from public.app_sessions where expires_at < now();
  insert into public.app_sessions(user_id) values (u.id) returning token into t;

  return jsonb_build_object(
    'token', t::text,
    'user', jsonb_build_object(
      'id', u.id,
      'username', u.username,
      'role', u.role,
      'isAdmin', u.is_admin,
      'avatarUrl', u.avatar_url,
      'vocab', u.vocab
    )
  );
end;
$$;

create or replace function public.app_admin_reset_password(p_admin_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform id from public.app_users
  where id = p_admin_id and is_admin = true and active = true
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

create or replace function public.app_admin_save_review_set(
  p_admin_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_set_id uuid := coalesce(nullif(p_payload ->> 'id', '')::uuid, gen_random_uuid());
  v_lesson_date date := nullif(p_payload ->> 'lessonDate', '')::date;
  v_title text := left(trim(coalesce(p_payload ->> 'title', '')), 120);
  v_status text := coalesce(nullif(p_payload ->> 'status', ''), 'draft');
  v_source_paths text[];
  v_questions jsonb := coalesce(p_payload -> 'questions', '[]'::jsonb);
  v_question jsonb;
  v_position bigint;
begin
  perform id from public.app_users
  where id = p_admin_id and is_admin = true and active = true;
  if not found then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if v_lesson_date is null then
    raise exception 'LESSON_DATE_REQUIRED';
  end if;
  if v_status not in ('draft', 'published') then
    raise exception 'INVALID_REVIEW_STATUS';
  end if;
  if jsonb_typeof(v_questions) <> 'array'
     or jsonb_array_length(v_questions) < 1
     or jsonb_array_length(v_questions) > 5 then
    raise exception 'INVALID_REVIEW_QUESTIONS';
  end if;

  select coalesce(array_agg(value), '{}'::text[])
  into v_source_paths
  from (
    select left(trim(value), 500) as value
    from jsonb_array_elements_text(coalesce(p_payload -> 'sourceImagePaths', '[]'::jsonb))
    where trim(value) <> ''
    limit 5
  ) paths;

  insert into public.review_sets (
    id, lesson_date, title, status, source_image_paths, created_by, published_at
  ) values (
    v_set_id,
    v_lesson_date,
    v_title,
    v_status,
    v_source_paths,
    p_admin_id,
    case when v_status = 'published' then now() else null end
  )
  on conflict (id) do update set
    lesson_date = excluded.lesson_date,
    title = excluded.title,
    status = excluded.status,
    source_image_paths = excluded.source_image_paths,
    updated_at = now(),
    published_at = case
      when excluded.status = 'published'
        then coalesce(public.review_sets.published_at, now())
      else public.review_sets.published_at
    end;

  delete from public.review_questions where review_set_id = v_set_id;

  for v_question, v_position in
    select value, ordinality - 1
    from jsonb_array_elements(v_questions) with ordinality
  loop
    if coalesce(v_question ->> 'type', '') not in ('vocab', 'blank', 'listening', 'expression') then
      raise exception 'INVALID_QUESTION_TYPE';
    end if;
    if trim(coalesce(v_question ->> 'prompt', '')) = ''
       or trim(coalesce(v_question ->> 'answer', '')) = '' then
      raise exception 'QUESTION_FIELDS_REQUIRED';
    end if;

    insert into public.review_questions (
      review_set_id,
      type,
      prompt,
      answer,
      explanation,
      audio_path,
      audio_name,
      position
    ) values (
      v_set_id,
      v_question ->> 'type',
      left(trim(v_question ->> 'prompt'), 1000),
      left(trim(v_question ->> 'answer'), 500),
      nullif(left(trim(coalesce(v_question ->> 'explanation', '')), 1500), ''),
      nullif(left(trim(coalesce(v_question ->> 'audioPath', '')), 500), ''),
      nullif(left(trim(coalesce(v_question ->> 'audioName', '')), 200), ''),
      v_position
    );
  end loop;

  return v_set_id;
end;
$$;

revoke all on function public.app_admin_save_review_set(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.app_admin_save_review_set(uuid, jsonb)
  to service_role;

commit;
