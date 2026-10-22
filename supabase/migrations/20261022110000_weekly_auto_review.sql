begin;

alter table public.review_questions drop constraint if exists review_questions_type_check;
alter table public.review_questions add constraint review_questions_type_check
  check (type in ('vocab', 'blank', 'listening', 'expression', 'writing', 'note', 'reading', 'sentence'));

-- 주간 자동 복습용 문제 유형 추가: reading(독해), sentence(문장 완성). (나머지 로직은 20261016090000과 동일)

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
  where id = p_admin_id and (is_admin = true or role = 'teacher') and active = true;
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
    if coalesce(v_question ->> 'type', '') not in ('vocab', 'blank', 'listening', 'expression', 'writing', 'note', 'reading', 'sentence') then
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

-- 주간 자동 복습 (HSK 4~5급)
-- 매주 토요일 11:00 KST(=02:00 UTC) 생성·공개·알림, 11:20에 한 번 더(실패 시 재시도, 성공했으면 아무것도 안 함)
-- 매주 토요일 20:30 KST(=11:30 UTC) 아직 안 푼 학생에게 리마인드
-- 함수 쪽에서 시간대·하루 1회를 확인하므로 중복 실행돼도 안전합니다.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobname) from cron.job where jobname in ('lin-weekly-review', 'lin-weekly-review-retry', 'lin-weekly-reminder');

select cron.schedule('lin-weekly-review', '0 2 * * 6',
  $$select net.http_get(url := 'https://vuucplkujislvarqvdzf.supabase.co/functions/v1/homework-api/cron/weekly-review', timeout_milliseconds := 120000)$$);
select cron.schedule('lin-weekly-review-retry', '20 2 * * 6',
  $$select net.http_get(url := 'https://vuucplkujislvarqvdzf.supabase.co/functions/v1/homework-api/cron/weekly-review', timeout_milliseconds := 120000)$$);
select cron.schedule('lin-weekly-reminder', '30 11 * * 6',
  $$select net.http_get(url := 'https://vuucplkujislvarqvdzf.supabase.co/functions/v1/homework-api/cron/weekly-reminder', timeout_milliseconds := 60000)$$);

select jobname, schedule from cron.job where jobname like 'lin-weekly-%' order by jobname;
