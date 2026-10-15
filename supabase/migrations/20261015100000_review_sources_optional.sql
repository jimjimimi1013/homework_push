begin;

-- 교재 사진은 AI 문제 생성에만 쓰고 학생 공개 시 삭제하므로, 복습 저장 시 사진을 필수로 요구하지 않습니다.

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
     or jsonb_array_length(v_questions) > 20 then
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
    if coalesce(v_question ->> 'type', '') not in ('vocab', 'blank', 'listening', 'expression', 'writing', 'note') then
      raise exception 'INVALID_QUESTION_TYPE';
    end if;
    if trim(coalesce(v_question ->> 'prompt', '')) = '' then
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
      left(trim(coalesce(v_question ->> 'answer', '')), 1000),
      nullif(left(trim(coalesce(v_question ->> 'explanation', '')), 1500), ''),
      nullif(left(trim(coalesce(v_question ->> 'audioPath', '')), 500), ''),
      nullif(left(trim(coalesce(v_question ->> 'audioName', '')), 200), ''),
      v_position
    );
  end loop;

  return v_set_id;
end;
$$;

commit;
