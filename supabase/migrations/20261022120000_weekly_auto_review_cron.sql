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
