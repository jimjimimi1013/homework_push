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
const structureMigration = readFileSync(new URL('../supabase/migrations/20261015083000_review_structure_v2.sql', import.meta.url), 'utf8');
const reviewId = '11111111-1111-4111-8111-111111111111';
const studentId = '22222222-2222-4222-8222-222222222222';
const adminId = '33333333-3333-4333-8333-333333333333';

function reviewBackend({ extraQuestions = [], fetchImpl } = {}) {
  let handler;
  let savedResult = null;
  const questions = [
    { id: 'q1', type: 'vocab', prompt: '뜻밖에', answer: '意外', explanation: '설명', audio_path: null, audio_name: null, position: 0 },
    { id: 'q2', type: 'blank', prompt: '我想___。', answer: '回家', explanation: null, audio_path: null, audio_name: null, position: 1 },
    ...extraQuestions,
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
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    Request, Response, URL, Uint8Array, AbortSignal, atob, crypto,
    console: { error() {} },
  });
  const request = async (path, body) => handler(new Request(`https://test.local/homework-api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: 'Bearer session', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  request.saved = () => savedResult;
  return request;
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
    Deno: { env: { get: name => name === 'GEMINI_MODEL' ? 'gemini-3.8-flash' : 'test' }, serve: fn => { handler = fn; } },
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

test('review editor offers vocab, writing and note; legacy types stay readable', () => {
  assert.match(app, /const REVIEW_EDITOR_TYPES = \['vocab', 'writing', 'note'\];/);
  assert.match(app, /type === 'vocab' \|\| type === 'blank' \? '단어' : type === 'writing' \? '쓰기' : type === 'note' \? '필기 질문'/);
  for (const type of ['vocab', 'blank', 'listening', 'expression', 'writing', 'note']) assert.match(structureMigration, new RegExp(`'${type}'`));
  assert.match(structureMigration, /add column if not exists corrections jsonb/);
  assert.match(structureMigration, /check \(total >= 0 and score <= total\)/);
  assert.match(app, /questions\.length < 20/);
  assert.match(expansionMigration, /jsonb_array_length\(v_questions\) > 20/);
  assert.match(expansionMigration, /SOURCE_IMAGES_REQUIRED/);
  assert.match(app, /moveQuestion\(index, -1\)/);
  assert.match(app, /moveQuestion\(index, 1\)/);
});

test('answers are hidden before completion and grading is server-side', () => {
  assert.match(api, /includeAnswers\?\{answer:q\.answer,explanation:q\.explanation\}:\{\}/);
  assert.match(api, /const correct=normAnswer\(answer\)===normAnswer\(question\.answer\)/);
  assert.match(api, /const normAnswer=\(v:any\)=>String\(v\?\?''\)\.replace\(\/\[\\s\\p\{P\}\]\+\/gu,''\)/);
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

test('grading ignores spaces and punctuation', async () => {
  const request = reviewBackend();
  const submitted = await (await request(`/reviews/${reviewId}/submit`, { answers: { q1: '意外。', q2: ' 回 家 ！' } })).json();
  assert.equal(submitted.result.score, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(submitted.result.correctness)), { q1: true, q2: true });
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

test('review management and push are admin or teacher only; account admin stays admin-only', () => {
  assert.match(api, /if\(p\.startsWith\('\/admin\/'\)\)\{\s*if\(u\.is_admin!==true&&!\(staff\(u\)&&p\.startsWith\('\/admin\/review'\)\)\)/);
  assert.match(push, /kind === 'review'[\s\S]*user\.is_admin !== true && !isTeacherUser\(user\)/);
  const teacherMigration = readFileSync(new URL('../supabase/migrations/20261016090000_review_teacher_manage.sql', import.meta.url), 'utf8');
  assert.match(teacherMigration, /\(is_admin = true or role = 'teacher'\) and active = true/);
  assert.match(capabilityMigration, /is_admin = true and active = true/);
});

test('Gemini generation stays server-side and validates structured output', () => {
  assert.match(api, /Deno\.env\.get\('GEMINI_API_KEY'\)/);
  assert.match(api, /Deno\.env\.get\('GEMINI_MODEL'\)\|\|'gemini-3\.8-flash'/);
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
  assert.match(request.url, /gemini-3\.8-flash:generateContent/);
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

const writingQuestion = { id: 'q3', type: 'writing', prompt: '你周末做什么？', answer: '我周末去公园。', explanation: null, audio_path: null, audio_name: null, position: 2 };

test('writing is excluded from score and gets AI grammar correction', async () => {
  let correctionRequest;
  const fetchImpl = async (url, options) => {
    correctionRequest = { url, options };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ corrections: [{ id: 'q3', corrected: '我周末去了公园。', note: '과거 표현에 了를 붙였어요.' }, { id: 'unknown', corrected: 'x', note: '' }] }) }] } }] }), { status: 200 });
  };
  const request = reviewBackend({ extraQuestions: [writingQuestion], fetchImpl });
  const submitted = await (await request(`/reviews/${reviewId}/submit`, { answers: { q1: '意外', q2: '学校', q3: '我周末去公园' } })).json();
  assert.equal(submitted.result.score, 1);
  assert.equal(submitted.result.total, 2);
  assert.equal(submitted.result.correctness.q3, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(submitted.result.corrections)), { q3: { corrected: '我周末去了公园。', note: '과거 표현에 了를 붙였어요.' } });
  assert.deepEqual(JSON.parse(JSON.stringify(request.saved().corrections)), { q3: { corrected: '我周末去了公园。', note: '과거 표현에 了를 붙였어요.' } });
  assert.match(correctionRequest.options.body, /쓰기 답안을 첨삭해 주세요/);
  assert.match(correctionRequest.options.body, /我周末去公园/);
});

test('submission still succeeds without correction when AI fails', async () => {
  const request = reviewBackend({ extraQuestions: [writingQuestion], fetchImpl: async () => new Response('{}', { status: 500 }) });
  const response = await request(`/reviews/${reviewId}/submit`, { answers: { q1: '意外', q3: '我周末去公园' } });
  const submitted = await response.json();
  assert.equal(response.status, 201);
  assert.deepEqual(JSON.parse(JSON.stringify(submitted.result.corrections)), {});
  assert.equal(submitted.result.score, 1);
});

test('empty writing answers are not sent for correction', async () => {
  let called = false;
  const request = reviewBackend({ extraQuestions: [writingQuestion], fetchImpl: async () => { called = true; return new Response('{}', { status: 500 }); } });
  await request(`/reviews/${reviewId}/submit`, { answers: { q1: '意外' } });
  assert.equal(called, false);
});

test('Gemini generation uses vocab, writing and note only', () => {
  assert.match(api, /const generatedReviewTypes=new Set\(\['vocab','writing','note'\]\)/);
  assert.match(api, /enum:\['vocab','writing','note'\]/);
  assert.match(api, /단어\(vocab\) 3~6개/);
  assert.match(api, /쓰기\(writing\) 2~3개/);
  assert.match(api, /필기 질문\(note\) 2~4개/);
  assert.match(api, /적게 만들어도 됩니다/);
  assert.doesNotMatch(api, /enum:\['vocab','blank','expression'\]/);
});

const meaningQuestion = { id: 'q4', type: 'note', prompt: '意外의 뜻을 쓰세요.', answer: '', explanation: '뜻밖에, 의외로', audio_path: null, audio_name: null, position: 3 };

test('questions without an answer are graded by AI meaning check in the same request', async () => {
  let calls = 0, body;
  const fetchImpl = async (url, options) => {
    calls++; body = options.body;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ corrections: [{ id: 'q3', corrected: '我周末去了公园。', note: '了 추가' }], grades: [{ id: 'q4', correct: true, note: '의미가 같아요.' }] }) }] } }] }), { status: 200 });
  };
  const request = reviewBackend({ extraQuestions: [writingQuestion, meaningQuestion], fetchImpl });
  const submitted = await (await request(`/reviews/${reviewId}/submit`, { answers: { q1: '意外', q2: '学校', q3: '我周末去公园', q4: '예상 밖에' } })).json();
  assert.equal(calls, 1);
  assert.match(body, /의미가 맞으면 correct를 true/);
  assert.match(body, /뜻밖에, 의외로/);
  assert.equal(submitted.result.score, 2);
  assert.equal(submitted.result.total, 3);
  assert.equal(submitted.result.correctness.q4, true);
  assert.equal(submitted.result.corrections.q4.note, '의미가 같아요.');
  assert.equal(submitted.result.corrections.q3.corrected, '我周末去了公园。');
});

test('AI-graded question is left ungraded when AI fails', async () => {
  const request = reviewBackend({ extraQuestions: [meaningQuestion], fetchImpl: async () => new Response('{}', { status: 503 }) });
  const submitted = await (await request(`/reviews/${reviewId}/submit`, { answers: { q1: '意外', q4: '예상 밖에' } })).json();
  assert.equal(submitted.result.total, 2);
  assert.equal(submitted.result.correctness.q4, undefined);
});

test('empty answer to an AI-graded question is wrong without calling AI', async () => {
  let called = false;
  const request = reviewBackend({ extraQuestions: [meaningQuestion], fetchImpl: async () => { called = true; return new Response('{}', { status: 500 }); } });
  const submitted = await (await request(`/reviews/${reviewId}/submit`, { answers: { q1: '意外' } })).json();
  assert.equal(called, false);
  assert.equal(submitted.result.correctness.q4, false);
  assert.equal(submitted.result.total, 3);
});

test('answer is optional in editor, DB and AI generation', () => {
  const optional = readFileSync(new URL('../supabase/migrations/20261015090000_review_optional_answer.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(optional, /trim\(coalesce\(v_question ->> 'answer', ''\)\) = ''/);
  assert.match(optional, /left\(trim\(coalesce\(v_question ->> 'answer', ''\)\), 1000\)/);
  assert.match(app, /questions\.some\(question => !String\(question\.prompt \|\| ''\)\.trim\(\)\)/);
  assert.match(app, /placeholder: "정답칸을 비워두면 AI가 자동채점합니다\."/);
  assert.match(api, /answer를 빈 문자열로 두고, 채점 기준이 될 참고 답안을 explanation에/);
  assert.match(api, /\(!answer&&!explanation\)/);
});

test('admin can delete a review set; questions and results cascade and files are cleaned up', () => {
  assert.match(api, /p==='\/admin\/reviews\/delete'&&req\.method==='POST'/);
  const adminBlock = api.slice(api.indexOf("if(p.startsWith('/admin/')){"), api.indexOf("if(p==='/admin/review-source-upload'"));
  assert.match(adminBlock, /if\(u\.is_admin!==true&&!\(staff\(u\)&&p\.startsWith\('\/admin\/review'\)\)\)/);
  assert.match(adminBlock, /from\('review_sets'\)\.delete\(\)\.eq\('id',id\)/);
  assert.match(adminBlock, /storage\.from\('homework-images'\)\.remove\(imgs\)/);
  assert.match(migration, /references public\.review_sets\(id\) on delete cascade/i);
  assert.match(app, /수업 복습을 삭제할까요\?\\n학생 제출 결과도 함께 삭제돼요\./);
  assert.match(app, /api\('\/admin\/reviews\/delete'/);
});

test('writing correction does not force edits and praises good answers', () => {
  assert.match(api, /문법과 표현이 모두 자연스러우면 억지로 고치지 말고/);
  assert.match(api, /'A보다 B가 더 자연스러워요'처럼 원래 표현과 추천 표현을 함께/);
  assert.doesNotMatch(api, /사소한 표현 차이는 고치지 않습니다/);
  assert.match(api, /'문법과 표현이 훌륭해요\.'처럼 짧은 칭찬/);
  assert.match(app, /correction\.corrected\.trim\(\) !== String\(result\.answers\?\.\[question\.id\] \|\| ''\)\.trim\(\)/);
});

test('AI meaning grading gives a learning tip instead of a bare verdict', () => {
  assert.match(api, /'맞았습니다'처럼 결과만 말하지 말고 학습에 도움이 되는 내용/);
  assert.match(api, /맞았으면 더 정확하거나 자연스러운 뜻, 뉘앙스/);
  assert.match(api, /틀렸으면 올바른 뜻과 헷갈린 부분을 짧게 설명/);
});

test('AI does not create pinyin-writing questions', () => {
  assert.match(api, /병음을 쓰게 하는 문제는 만들지 마세요/);
  assert.doesNotMatch(api, /pinyinKey|answerMatches/);
  assert.doesNotMatch(app, /성조는 숫자로 입력/);
});

test('AI feedback stays short and targeted', () => {
  assert.match(api, /장황한 설명 대신 그 답안에 지금 가장 도움이 되는 핵심\(더 나은 표현, 꼭 필요한 내용\) 한두 가지만 짧고 구체적으로/);
});

test('review photos: JPEG upload, removed on publish, orphans cleaned, no longer required to save', () => {
  const optional = readFileSync(new URL('../supabase/migrations/20261015100000_review_sources_optional.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(optional, /SOURCE_IMAGES_REQUIRED/);
  assert.match(app, /canvas\.toBlob\(resolve, 'image\/jpeg', \.82\)/);
  assert.match(api, /if\(b\.status==='published'&&uuid\(data\)\)\{try\{await removeReviewSources\(String\(data\)\)\}/);
  assert.match(api, /update\(\{source_image_paths:\[\]\}\)/);
  assert.match(api, /if\(p==='\/admin\/reviews'&&req\.method==='GET'\)\{await cleanupOrphanReviewSources\(u\.id\)/);
  assert.match(api, /const cutoff=Date\.now\(\)-60\*60\*1000/);
  const editorSave = app.slice(app.indexOf('const save = async status =>'), app.indexOf('const save = async status =>') + 600);
  assert.doesNotMatch(editorSave, /필기된 교재 사진을 한 장 이상/);
  assert.match(app, /const generateQuestions = async \(\) => \{[\s\S]{0,200}필기된 교재 사진을 한 장 이상/);
});

test('AI questions are short without source phrases', () => {
  assert.match(api, /질문\(question\)은 '다음 단어를 중국어로 쓰세요: 뜻밖에', '意外의 뜻을 쓰세요', '빈칸에 들어갈 단어를 쓰세요: 我想___。'처럼 짧고 단순하게/);
  assert.match(api, /'교재 속', '사진에서', '필기한 내용에 따르면', '수업에서 배운' 같은 출처 설명이나 불필요한 수식어는 넣지 마세요/);
});

test('review grading shows rotating fun loading messages', () => {
  assert.match(app, /const REVIEW_GRADING_MESSAGES = \['답변 숙성시키는 중…', '중국 갔다 오는 중…'/);
  assert.match(app, /setInterval\(\(\) => setGradingMessage\(current => current \+ 1\), 1300\)/);
  assert.match(app, /setGradingOrder\(\[\.\.\.shuffleList\(REVIEW_GRADING_STUDENT_MESSAGES\), \.\.\.shuffleList\(REVIEW_GRADING_MESSAGES\)\]\)/);
  assert.match(app, /busy && React\.createElement\("div", \{ className: "fixed inset-0 z-\[95\]/);
});

test('review date input text is vertically centered on iOS', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(app, /className: "lin-date-input mt-2 block h-12/);
  assert.match(html, /\.lin-date-input::-webkit-date-and-time-value \{ margin: 0; min-height: 46px; line-height: 46px; text-align: left; \}/);
});

test('AI generation forbids source phrases via system instruction', async () => {
  assert.match(api, /학생은 교재 사진을 볼 수 없습니다\. question, answer, explanation 어디에도 '사진', '교재', '필기'/);
  assert.match(api, /나쁜 예: '结伴 옆에 伙伴이 필기되어 있습니다\.'/);
  assert.match(api, /question에는 답을 쓰는 데 꼭 필요한 정보만 넣고, 그 외의 설명·배경·힌트·맥락은 넣지 마세요/);
  const backend = geminiBackend();
  await backend.request('/admin/reviews/generate', { lessonDate: '2026-10-14', sourceImagePaths: [`reviews/${adminId}/book.webp`] });
  assert.match(backend.providerRequest().options.body, /"systemInstruction":\{"parts":\[\{"text":"학생은 교재 사진을 볼 수 없습니다/);
});

test('teacher home student status shows small O/X for the latest published review', () => {
  assert.match(app, /page !== 'teacher' \|\| teacherTab !== 'home'\)/);
  assert.match(app, /`복습 O\/X · \$\{reviewDateLabel\(reviewStatus\.lessonDate\)\} 수업`/);
  assert.match(api, /if\(p==='\/admin\/review-status'&&req\.method==='GET'\)/);
  assert.match(api, /eq\('status','published'\)\.order\('lesson_date',\{ascending:false\}\)/);
  assert.match(app, /api\('\/admin\/review-status', \{\}, token\)/);
  assert.match(app, /reviewStatus\.done\[s\.name\] \? 'O' : 'X'/);
  assert.match(app, /assignmentWeekView: assignmentWeekViews\.current\.teacher, reviewStatus: reviewStatus \}/);
  assert.ok(app.indexOf("const [teacherTab, setTeacherTab]") < app.indexOf("api('/admin/review-status'"), 'effect must come after teacherTab state');
});

test('published reviews open a student-style preview with edit/delete; drafts open the editor', () => {
  assert.match(app, /onClick: \(\) => review\.status === 'published' && onPreview \? onPreview\(review\) : onEdit\(review\)/);
  assert.match(app, /function ReviewResult\(\{ review, onBack, preview, onEdit, onDelete, studentName \}\)/);
  assert.match(app, /preview \? "표준 답안" : studentName/);
  assert.match(app, /const answer = preview \? \(reference \|\| '\(답안 없음\)'\)/);
  assert.match(app, /page === 'admin-review-preview' && adminPreview && canManageReviews\(user\)/);
  assert.match(app, /replacePage\('admin-review-editor'\)/);
  assert.match(app, /preview \? React\.createElement\("div", \{ className: "mt-2" \}, previewActions\)/);
});

test('teacher student detail lists reviews and opens a completed student result', () => {
  assert.match(api, /if\(p==='\/admin\/student-reviews'&&req\.method==='GET'\)/);
  assert.match(api, /questions:result\?await reviewQuestions\(set\.id,true\):\[\]/);
  assert.match(app, /api\(`\/admin\/student-reviews\?username=\$\{encodeURIComponent\(selectedStudent\)\}`, \{\}, token\)/);
  assert.match(app, /page === 'teacher-student-review' && studentReviewOpen\?\.result && selectedStudent/);
  assert.match(app, /studentName \? `\$\{studentName\} 답` : "내가 쓴 답"/);
  assert.ok(app.indexOf('const [selectedStudent, setSelectedStudent]') < app.indexOf("api(`/admin/student-reviews"), 'effect after selectedStudent state');
});

test('teacher student detail separates homework and review status with strong tabs', () => {
  assert.match(app, /\[\['homework', '과제 상태'\], \['review', '복습 상태'\]\]/);
  assert.match(app, /statusTab === k \? \{ background: C, color: '#fff' \} : \{ background: '#F1F1F1', color: '#666' \}/);
  assert.match(app, /statusTab === 'review' && React\.createElement\(React\.Fragment/);
});
