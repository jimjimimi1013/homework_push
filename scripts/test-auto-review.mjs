import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const api = readFileSync(new URL('../supabase/functions/homework-api/index.ts', import.meta.url), 'utf8');
const push = readFileSync(new URL('../supabase/functions/push-api/index.ts', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/migrations/20261022110000_weekly_auto_review.sql', import.meta.url), 'utf8');
const kstLine = api.split('\n').find(l => l.startsWith('function kstNow('));

const kstAt = (iso) => {
  const ctx = { Date: class extends Date { static now() { return new Date(iso).getTime(); } } };
  vm.runInNewContext(`${stripTypeScriptTypes(kstLine)}\nthis.r = kstNow();`, ctx);
  return ctx.r;
};

test('KST clock: Saturday 11:00 KST is 02:00 UTC', () => {
  const r = kstAt('2026-10-24T02:00:00Z');
  assert.equal(r.day, 6);
  assert.equal(r.mins, 11 * 60);
  assert.equal(r.date, '2026-10-24');
  assert.equal(r.label, '10월 24일 11:00');
  assert.equal(kstAt('2026-10-24T11:30:00Z').mins, 20 * 60 + 30);
});

test('cron endpoints are time-windowed and run once per day; failure releases the claim', () => {
  assert.match(api, /now\.day!==6\|\|now\.mins<10\*60\+55\|\|now\.mins>12\*60/);
  assert.match(api, /now\.day!==6\|\|now\.mins<20\*60\+25\|\|now\.mins>21\*60\+30/);
  assert.match(api, /claimOnce\(claimKey\)/);
  assert.match(api, /catch\(e\)\{await supabase\.from\('app_shared_state'\)\.delete\(\)\.eq\('key',claimKey\);throw e\}/);
  assert.match(api, /claimOnce\(`auto-review-reminder-\$\{now\.date\}`\)/);
  assert.match(api, /filter\(\(id:string\)=>!doneIds\.has\(id\)\)/);
  assert.match(api, /if\(p==='\/cron\/weekly-review'&&req\.method==='GET'\)return ok\(await runWeeklyAutoReview\(\)\)/);
});

test('internal push is only allowed with the service role key', () => {
  assert.match(push, /path === '\/internal\/send'/);
  assert.match(push, /if \(!bearer \|\| bearer !== SERVICE_KEY\) return fail\('권한이 없습니다\.', 403\)/);
  assert.ok(push.indexOf("'/internal/send'") < push.indexOf('const user = await currentUser(req)'));
});

test('pg_cron schedules: Sat 02:00/02:20 UTC review, 11:30 UTC reminder', () => {
  assert.match(sql, /cron\.schedule\('lin-weekly-review', '0 2 \* \* 6'/);
  assert.match(sql, /cron\.schedule\('lin-weekly-review-retry', '20 2 \* \* 6'/);
  assert.match(sql, /cron\.schedule\('lin-weekly-reminder', '30 11 \* \* 6'/);
});

test('question bank: answers may list alternatives with " / " and match case-insensitively', () => {
  const lines = ['normAnswer', 'answerMatches'].map(n => api.split('\n').find(l => l.startsWith(`const ${n}=`)));
  const ctx = {};
  vm.runInNewContext(`${stripTypeScriptTypes(lines.join('\n'))}\nthis.m = answerMatches;`, ctx);
  assert.equal(ctx.m('adc', 'ADC'), true);
  assert.equal(ctx.m('A D C', 'ADC'), true);
  assert.equal(ctx.m('他会偶尔去健身房锻炼', '他偶尔会去健身房锻炼。 / 他会偶尔去健身房锻炼。'), true);
  assert.equal(ctx.m('他去健身房偶尔锻炼', '他偶尔会去健身房锻炼。 / 他会偶尔去健身房锻炼。'), false);
  assert.equal(ctx.m('', 'A'), false);
});

test('weekly review uses the private bank first, AI only as fallback; no HSK wording in notices/push', () => {
  assert.match(api, /const BANK_PATH='hsk\/hsk5_bank\.json'/);
  assert.match(api, /if\(fromBank\)questions=fromBank\.questions/);
  assert.match(api, /const AUTO_PUSH_TEXT='공부해서 짱이되자!'/);
  const runner = api.slice(api.indexOf('async function runWeeklyAutoReview'), api.indexOf('async function runWeeklyReminder'));
  const reminder = api.slice(api.indexOf('async function runWeeklyReminder'), api.indexOf('async function signed'));
  assert.doesNotMatch(runner + reminder, /HSK/);
  assert.match(sql, /'reading', 'sentence'\)/);
});
