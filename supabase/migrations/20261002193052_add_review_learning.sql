begin;

create table public.review_sets (
  id uuid primary key default gen_random_uuid(),
  lesson_date date not null,
  title text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  source_image_paths text[] not null default '{}'::text[],
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table public.review_questions (
  id uuid primary key default gen_random_uuid(),
  review_set_id uuid not null references public.review_sets(id) on delete cascade,
  type text not null
    check (type in ('vocab', 'blank', 'listening', 'expression')),
  prompt text not null,
  answer text not null,
  explanation text,
  audio_path text,
  audio_name text,
  position integer not null check (position >= 0),
  unique (review_set_id, position)
);

create table public.review_results (
  id uuid primary key default gen_random_uuid(),
  review_set_id uuid not null references public.review_sets(id) on delete cascade,
  student_id uuid not null references public.app_users(id),
  answers jsonb not null default '{}'::jsonb,
  correctness jsonb not null default '{}'::jsonb,
  score integer not null check (score >= 0),
  total integer not null check (total > 0 and score <= total),
  completed_at timestamptz not null default now(),
  unique (review_set_id, student_id)
);

create index review_sets_published_lesson_date_idx
  on public.review_sets (lesson_date desc)
  where status = 'published';
create index review_questions_set_position_idx
  on public.review_questions (review_set_id, position);
create index review_results_student_completed_idx
  on public.review_results (student_id, completed_at desc);

alter table public.review_sets enable row level security;
alter table public.review_questions enable row level security;
alter table public.review_results enable row level security;

revoke all on public.review_sets from public, anon, authenticated;
revoke all on public.review_questions from public, anon, authenticated;
revoke all on public.review_results from public, anon, authenticated;
grant all on public.review_sets to service_role;
grant all on public.review_questions to service_role;
grant all on public.review_results to service_role;

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
  where id = p_admin_id and role = 'admin' and active = true;
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
