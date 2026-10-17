import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../supabase/functions/homework-api/index.ts', import.meta.url), 'utf8');
const pushSource = readFileSync(new URL('../supabase/functions/push-api/index.ts', import.meta.url), 'utf8');
const migrationSource = readFileSync(new URL('../supabase/migrations/20261014214500_separate_admin_capability.sql', import.meta.url), 'utf8');

const adminId = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';

function backend(role, isAdmin = false, rpcError = null) {
  let handler;
  const calls = [];
  const queries = [];
  const db = {
    from(table) {
      const query = { table, steps: [] };
      queries.push(query);
      const chain = new Proxy({}, {
        get(_, method) {
          const result = () => ({
            data: table === 'app_sessions'
              ? (role ? { user_id: adminId } : null)
              : table === 'app_users'
                ? { id: adminId, username: 'operator', role, is_admin: isAdmin, active: true }
                : null,
            error: null,
          });
          if (method === 'then') return resolve => resolve(result());
          return (...args) => {
            query.steps.push([method, ...args]);
            return method === 'maybeSingle' ? Promise.resolve(result()) : chain;
          };
        },
      });
      return chain;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: true, error: rpcError ? { message: rpcError } : null };
    },
  };
  const code = stripTypeScriptTypes(apiSource.replace(/^import .*\n/, ''));
  vm.runInNewContext(code, {
    createClient: () => db,
    Deno: { env: { get: () => 'test' }, serve: fn => { handler = fn; } },
    Request,
    Response,
    URL,
    console: { error() {} },
  });
  return {
    calls,
    queries,
    async request(path, body, method = body ? 'POST' : 'GET') {
      return handler(new Request(`https://test.local/homework-api${path}`, {
        method,
        headers: { authorization: 'Bearer test-session', 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }));
    },
  };
}

for (const role of [null, 'student', 'teacher']) {
  test(`${role || 'invalid session'} cannot use admin APIs`, async () => {
    const api = backend(role);
    assert.equal((await api.request('/admin/accounts')).status, role ? 403 : 401);
    assert.equal((await api.request('/admin/reset-password', { userId: targetId })).status, role ? 403 : 401);
    assert.equal(api.calls.length, 0);
  });
}

test('student with admin capability can list teacher/student accounts without password fields', async () => {
  const api = backend('student', true);
  assert.equal((await api.request('/admin/accounts')).status, 200);
  const steps = api.queries.at(-1).steps;
  assert.equal(steps.find(step => step[0] === 'select')[1], 'id,username,role,active');
  assert.deepEqual(Array.from(steps.find(step => step[0] === 'in')[2]), ['teacher', 'student']);
  assert.deepEqual(steps.find(step => step[0] === 'eq').slice(1), ['active', true]);
});

test('admin reset uses the authenticated admin id and fixed server RPC', async () => {
  const api = backend('student', true);
  const response = await api.request('/admin/reset-password', {
    userId: targetId,
    p_admin_id: targetId,
    password: 'not-allowed',
  });
  assert.equal(response.status, 200);
  assert.equal(api.calls[0].name, 'app_admin_reset_password');
  assert.deepEqual(JSON.parse(JSON.stringify(api.calls[0].args)), {
    p_admin_id: adminId,
    p_user_id: targetId,
  });
});

test('only teachers keep teacher operations; admin teacher mode is view-only', async () => {
  for (const [role, isAdmin, expected] of [['student', true, 403], ['teacher', false, 200], ['student', false, 403]]) {
    const api = backend(role, isAdmin);
    assert.equal((await api.request('/student-vocab', { username: 'student', vocab: [] })).status, expected);
    assert.equal((await api.request('/student-active', { username: 'student', active: true })).status, expected);
    assert.equal((await api.request('/state', { key: 'lin-homework-v3-banner', value: { enabled: false } }, 'PUT')).status, expected);
  }
});

test('teacher push authorization and recipients exclude admin capability', () => {
  assert.match(pushSource, /const isTeacherUser = \(user: \{ role\?: string \}\) => user\.role === 'teacher'/);
  assert.doesNotMatch(pushSource, /is_admin\.eq\.true/);
  assert.match(pushSource, /query = query\.eq\('role', 'teacher'\)\.neq\('id', user\.id\)/);
});

test('admin saves from teacher pages are rejected as view-only', async () => {
  assert.match(apiSource, /if\(b\.mode==='teacher'&&!staff\(u\)\)return fail\('보기 전용 모드에서는 저장할 수 없어요\.',403\)/);
  assert.equal((await backend('student', true).request('/state', { key: 'lin-homework-v3-assigns', value: [], mode: 'teacher' }, 'PUT')).status, 403);
  assert.match(appSource, /const mode = isAdminUser\(user\) && String\(pageRef\.current \|\| ''\)\.startsWith\('teacher'\) \? 'teacher' : undefined;/);
  assert.match(appSource, /JSON\.stringify\(\{ key, value, mode \}\)/);
});

test('admin student can use student review and messaging actions from student mode', async () => {
  const api = backend('student', true);
  assert.equal((await api.request('/reviews')).status, 200);
  assert.notEqual((await api.request(`/reviews/${targetId}/submit`, { answers: {} })).status, 403);
  assert.match(apiSource, /const learner=\(u:any\)=>u\?\.role==='student'/);
  assert.match(pushSource, /const isStudentUser = \(user: \{ role\?: string \}\) => user\.role === 'student'/);
  assert.match(pushSource, /kind === 'contact'[\s\S]*!isStudentUser\(user\)/);
  assert.match(pushSource, /kind === 'submission'[\s\S]*!isStudentUser\(user\)/);
});

test('migration keeps the existing account as a student with separate admin capability', () => {
  assert.match(migrationSource, /set role = 'student',[\s\S]*is_admin = true/);
  assert.doesNotMatch(migrationSource, /insert into public\.app_users/i);
  assert.match(migrationSource, /password_hash = extensions\.crypt\('0000'/);
  assert.match(migrationSource, /role in \('student', 'teacher'\)/);
  assert.match(migrationSource, /item \|\| '\{"active": true\}'::jsonb/);
});

test('frontend authorization uses the admin capability and admin is not disclosed in update notes', () => {
  assert.doesNotMatch(appSource, /user\.username\s*===\s*['"]김지아['"]/);
  assert.doesNotMatch(apiSource, /username\s*===?\s*['"]김지아['"]/);
  assert.doesNotMatch(pushSource, /username\s*===?\s*['"]김지아['"]/);
  assert.match(appSource, /const isAdminUser = user => user\?\.isAdmin === true/);
  assert.match(appSource, /page === 'admin-accounts' && isAdminUser\(user\)/);
  const updateNotes = appSource.match(/const UPDATE_NOTES = \[(.*?)\];/s)?.[1] || '';
  assert.doesNotMatch(updateNotes, /김지아|관리자|admin/i);
});

test('admin opens in student mode and can switch between student and admin screens', () => {
  assert.match(appSource, /const defaultPageForRole = role => role === 'teacher' \? 'teacher' : 'student'/);
  assert.match(appSource, /switchModeLabel: "관리자 화면"/);
  assert.match(appSource, /onAdminMode: isAdminUser\(user\) \? \(\) => resetPage\('teacher'\) : null/);
  assert.match(appSource, /switchModeLabel: "학생 화면"/);
  assert.match(appSource, /onStudentMode: isAdminUser\(user\) \? \(\) => resetPage\('student'\) : null/);
});

test('students and teachers can add initially empty vocabulary progress with the shared picker', () => {
  assert.match(appSource, /function VocabAddModal\(\{ onClose, onSave \}\)/);
  assert.match(appSource, /levels\.length > 0 && levels\.every/);
  assert.match(appSource, /addingVocab && React\.createElement\(VocabAddModal, \{ onClose: \(\) => setAddingVocab\(false\), onSave: onVocab \}\)/);
  assert.equal((appSource.match(/"단어 진도 추가하기"/g) || []).length, 2);
});

test('update notes and notification text keep the requested readability rules', () => {
  assert.match(appSource, /const RECENT_UPDATE_NOTES = UPDATE_NOTES\.slice\(0, 5\)/);
  assert.match(appSource, /const UPDATE_NOTES = \['폰트 가독성 개선', '단어 진도 추가 기능 개선', '쪽지 기능 개선'/);
  assert.match(appSource, /"새 버전이 있어요\."/);
  assert.match(appSource, /"업데이트 후 최신 기능을 사용할 수 있어요\."/);
  assert.match(appSource, /RECENT_UPDATE_NOTES\.map/);
  assert.equal((appSource.match(/text-\[#333\] whitespace-pre-wrap/g) || []).length, 2);
  assert.doesNotMatch(appSource, /text-\[14px\][^\n]*onOpenNotice/);
});

test('admin can open review management from the student account menu', () => {
  assert.match(appSource, /function StudentApp\(\{[^}]*onManageReviews[^}]*\}\)/);
  assert.match(appSource, /onManageReviews: onManageReviews, onSwitchMode: onAdminMode, switchModeLabel: "관리자 화면"/);
  assert.match(appSource, /onAdminMode: isAdminUser\(user\) \? \(\) => resetPage\('teacher'\) : null, onManageReviews: isAdminUser\(user\) \? \(\) => openPage\('admin-reviews'\) : null/);
  assert.match(appSource, /canManageReviews\(user\) && onManageReviews && React\.createElement\("button"/);
});

test('teacher can manage reviews and sees a one-time review guide', () => {
  assert.match(appSource, /const canManageReviews = user => isAdminUser\(user\) \|\| user\?\.role === 'teacher';/);
  assert.match(appSource, /onManageReviews: canManageReviews\(user\) \? \(\) => openPage\('admin-reviews'\) : null, onStudentMode/);
  assert.match(appSource, /page === 'admin-reviews' && canManageReviews\(user\)/);
  assert.match(appSource, /page === 'admin-review-editor' && canManageReviews\(user\)/);
  assert.match(appSource, /page === 'admin-accounts' && isAdminUser\(user\)/);
  assert.match(appSource, /showReviewGuide && !showUpdateNotes && user\?\.role === 'teacher' && React\.createElement\(TeacherReviewGuideSheet/);
  assert.match(appSource, /localStorage\.setItem\(TEACHER_REVIEW_GUIDE_KEY, '1'\)/);
});

test('startup uses pinned production React and shows a splash during auto-login', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /react@18\.3\.1\/umd\/react\.production\.min\.js/);
  assert.match(html, /react-dom@18\.3\.1\/umd\/react-dom\.production\.min\.js/);
  assert.match(html, /@tailwindcss\/browser@4\.3\.3/);
  assert.doesNotMatch(html, /development\.js/);
  assert.match(appSource, /if \(page === 'login' && token && !user\)/);
});
