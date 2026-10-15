import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../supabase/functions/homework-api/index.ts', import.meta.url), 'utf8');
const push = readFileSync(new URL('../supabase/functions/push-api/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261002193052_add_review_learning.sql', import.meta.url), 'utf8');
const capabilityMigration = readFileSync(new URL('../supabase/migrations/20261014214500_separate_admin_capability.sql', import.meta.url), 'utf8');
const expansionMigration = readFileSync(new URL('../supabase/migrations/20261015031554_expand_review_question_limit.sql', import.meta.url), 'utf8');
const reviewId = '11111111-1111-4111-8111-111111111111';
const studentId = '22222222-2222-4222-8222-222222222222';
const adminId = '33333333-3333-4333-8333-333333333333';

function reviewBackend() {
  let handler;
  let savedResult = null;
  const questions = [
    { id: 'q1', type: 'vocab', prompt: '뜻밖에', answer: '意外', explanation: '설명', audio_path: null, audio_name: null, position: 0 },
    { id: 'q2', type: 'blank', prompt: '我想___。', answer: '回家', explanation: null, audio_path: null, audio_name: null, position: 1 },
  ];
  const db = {
    from(table) {
      let inserted = null;
      const result = () => {
        if (table === 'app_sessions') return { data: { user_id: studentId }, error: null };
        if (table === 'app_users') return { data: { id: studentId, username: '학생', role: 'student', active: true, vocab: [] }, error: null };
        if (table === 'review_sets') return { data: { id: reviewId, lesson_date: '2026-09-10', title: '복습', status: 'published' }, error: null };
        if (table === 'review_questions') return { data: questions, error: null };
        if (table === 'review_results') {
          if (inserted) { savedResult = inserted; return { data: null, error: null }; }
          return { data: savedResult, error: null };
        }
        return { data: null, error: null };
      };
      const chain = new Proxy({}, {
        get(_, method) {
          if (method === 'then') return resolve => resolve(result());
          return (...args) => {
            if (method === 'insert') inserted = args[0];
            return method === 'maybeSingle' ? Promise.resolve(result()) : chain;
          };
        },
      });
      return chain;
    },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'signed' }, error: null }) }) },
  };
  const code = stripTypeScriptTypes(api.replace(/^import .*\n/, ''));
  vm.runInNewContext(code, {
    createClient: () => db,
    Deno: { env: { get: () => 'test' }, serve: fn => { handler = fn; } },
    Request, Response, URL, Uint8Array, atob, crypto,
    console: { error() {} },
  });
  return async (path, body) => handler(new Request(`https://test.local/homework-api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: 'Bearer session', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
}

function geminiBackend() {
  let handler;
  let providerRequest;
  const db = {
    from(table) {
      const result = () => table === 'app_sessions'
        ? { data: { user_id: adminId }, error: null }
        : table === 'app_users'
          ? { data: { id: adminId, username: '관리자', role: 'student', is_admin: true, active: true, vocab: [] }, error: null }
          : { data: null, error: null };
      const chain = new Proxy({}, {
        get(_, method) {
          if (method === 'then') return resolve => resolve(result());
          return () => method === 'maybeSingle' ? Promise.resolve(result()) : chain;
        },
      });
      return chain;
    },
    storage: { from: () => ({ download: async () => ({ data: new Blob(['image'], { type: 'image/webp' }), error: null }) }) },
  };
  const code = stripTypeScriptTypes(api.replace(/^import .*\n/, ''));
  vm.runInNewContext(code, {
    createClient: () => db,
    Deno: { env: { get: name => name === 'GEMINI_MODEL' ? 'gemini-2.5-flash' : 'test' }, serve: fn => { handler = fn; } },
    fetch: async (url, options) => {
      providerRequest = { url, options };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ questions: [{ type: 'vocab', question: '뜻밖에를 중국어로 쓰세요.', answer: '没想到', explanation: '' }] }) }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    Request, Response, URL, Uint8Array, Blob, AbortSignal, atob, btoa, crypto,
    console: { error() {} },
  });
  return {
    request: (path, body) => handler(new Request(`https://test.local/homework-api${path}`, {
      method: 'POST',
      headers: { authorization: 'Bearer session', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })),
    providerRequest: () => providerRequest,
  };
}

test('student navigation adds review before messages and homework keeps only assignments', () => {
  assert.match(app, /const items = \[\['home', '홈', Icon\.home\], \['homework', '과제', Icon\.task\], \['notifications', '알림', Icon\.bell\], \['review', '복습', Icon\.review\], \['contact', '쪽지', Icon\.phone\]\]/);
  assert.match(app, /tab === 'review'/);
  assert.doesNotMatch(app, /function ReviewAccordion|reviewSection:/);
  assert.doesNotMatch(app, /\['contact', '그냥', Icon\.chat\]/);
});

test('teacher assignment creation defaults to exercise and shows it first', () => {
  assert.match(app, /useState\(existing\?\.type \|\| 'exercise'\)/);
  assert.match(app, /\['exercise', 'writing', 'recording'\]\.map/);
});

test('all four review question types are supported', () => {
  for (const type of ['vocab', 'blank', 'listening', 'expression']) {
    assert.match(migration, new RegExp(`'${type}'`));
    assert.match(app, new RegExp(`type === '${type}'|\\['[^\\]]*'${type}`));
  }
  assert.match(app, /questions\.length < 20/);
  assert.match(expansionMigration, /jsonb_array_length\(v_questions\) > 20/);
  assert.match(expansionMigration, /SOURCE_IMAGES_REQUIRED/);
  assert.match(app, /moveQuestion\(index, -1\)/);
  assert.match(app, /moveQuestion\(index, 1\)/);
});

test('answers are hidden before completion and grading is server-side', () => {
  assert.match(api, /includeAnswers\?\{answer:q\.answer,explanation:q\.explanation\}:\{\}/);
  assert.match(api, /const correct=normAnswer\(answer\)===normAnswer\(question\.answer\)/);
  assert.match(api, /replace\(\/\\s\+\/g,''\)/);
  assert.doesNotMatch(app, /normAnswer|question\.answer\s*===/);
});

test('student API hides answers before submission and returns server grading afterward', async () => {
  const request = reviewBackend();
  const before = await (await request(`/reviews/${reviewId}`)).json();
  assert.equal(before.review.questions[0].answer, undefined);
  assert.equal(before.review.questions[0].explanation, undefined);

  const submitted = await (await request(`/reviews/${reviewId}/submit`, { answers: { q1: ' 意 外 ', q2: '学校' } })).json();
  assert.equal(submitted.result.score, 1);
  assert.equal(submitted.result.total, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(submitted.result.correctness)), { q1: true, q2: false });
  assert.equal(submitted.questions[0].answer, '意外');
});

test('one saved result per student and review prevents score overwrite', () => {
  assert.match(migration, /unique \(review_set_id, student_id\)/);
  assert.match(api, /const existing=await reviewResult\(setId,u\.id\);if\(existing\)/);
  assert.doesNotMatch(api, /from\('review_results'\)\.upsert/);
});

test('review tables use RLS and are not directly accessible to clients', () => {
  for (const table of ['review_sets', 'review_questions', 'review_results']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`));
  }
});

test('review management and push are admin-only', () => {
  assert.match(api, /if\(p\.startsWith\('\/admin\/'\)\)\{\s*if\(u\.is_admin!==true\)/);
  assert.match(push, /kind === 'review'[\s\S]*user\.is_admin !== true/);
  assert.match(capabilityMigration, /is_admin = true and active = true/);
});

test('Gemini generation stays server-side and validates structured output', () => {
  assert.match(api, /Deno\.env\.get\('GEMINI_API_KEY'\)/);
  assert.match(api, /Deno\.env\.get\('GEMINI_MODEL'\)\|\|'gemini-2\.5-flash'/);
  assert.match(api, /x-goog-api-key/);
  assert.match(api, /responseMimeType:'application\/json'/);
  assert.match(api, /responseJsonSchema/);
  assert.match(api, /validateGeneratedQuestions/);
  assert.match(api, /p==='\/admin\/reviews\/generate'/);
  assert.doesNotMatch(app, /GEMINI_API_KEY|generativelanguage\.googleapis\.com/);
});

test('admin Gemini endpoint sends images server-side and returns editable questions', async () => {
  const backend = geminiBackend();
  const response = await backend.request('/admin/reviews/generate', { lessonDate: '2026-10-14', sourceImagePaths: [`reviews/${adminId}/book.webp`] });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.questions[0].type, 'vocab');
  assert.equal(body.questions[0].prompt, '뜻밖에를 중국어로 쓰세요.');
  assert.equal(body.questions[0].answer, '没想到');
  const request = backend.providerRequest();
  assert.match(request.url, /gemini-2\.5-flash:generateContent/);
  assert.equal(request.options.headers['x-goog-api-key'], 'test');
  assert.match(request.options.body, /inlineData/);
  assert.match(request.options.body, /responseJsonSchema/);
});

test('source photos stay in admin payloads and student review routes omit them', () => {
  assert.match(api, /\/admin\/review-source-upload/);
  assert.match(api, /sourceImages/);
  const studentList = api.match(/if\(p==='\/reviews'[\s\S]*?const reviewMatch=/)?.[0] || '';
  assert.doesNotMatch(studentList, /source_image_paths|sourceImages/);
});

test('red-pen marks expose stable future asset hooks without shipping PNG files', () => {
  assert.match(app, /data-future-asset/);
  assert.match(app, /\/review-marks\/mark-correct-circle\.png/);
  assert.match(app, /\/review-marks\/mark-wrong-slash\.png/);
});

test('review deep links reuse the existing notification and push paths', () => {
  assert.match(app, /makeDeepLink\('review', \{ reviewId: review\.id \}\)/);
  assert.match(app, /target\.kind === 'review' && target\.reviewId/);
  assert.match(app, /replaceTab\('student', 'review'\)/);
  assert.doesNotMatch(app, /reviewOpen: true/);
  assert.match(push, /query = query\.eq\('role', 'student'\)/);
});

test('admin details remain absent from public update notes', () => {
  const updateNotes = app.match(/const UPDATE_NOTES = \[(.*?)\];/s)?.[1] || '';
  assert.doesNotMatch(updateNotes, /김지아|관리자|admin/i);
});
