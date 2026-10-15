begin;

-- 복습 구조 v2: 단어(vocab, 빈칸 통합) / 쓰기(writing, 채점 제외 + AI 문법 교정) / 필기 질문(note)
-- 기존 유형(blank, listening, expression)은 이미 만든 복습을 위해 계속 허용합니다.

alter table public.review_questions drop constraint if exists review_questions_type_check;
alter table public.review_questions add constraint review_questions_type_check
  check (type in ('vocab', 'blank', 'listening', 'expression', 'writing', 'note'));

-- 쓰기 답안의 AI 문법 교정 결과 (문제 id → { corrected, note })
alter table public.review_results
  add column if not exists corrections jsonb not null default '{}'::jsonb;

-- 쓰기만 있는 복습은 채점 대상이 0개일 수 있음
alter table public.review_results drop constraint if exists review_results_check;
alter table public.review_results add constraint review_results_check
  check (total >= 0 and score <= total);

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

  if coalesce(array_length(v_source_paths, 1), 0) < 1 then
    raise exception 'SOURCE_IMAGES_REQUIRED';
  end if;

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
      left(trim(v_question ->> 'answer'), 1000),
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
