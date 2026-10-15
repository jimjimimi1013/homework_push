import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const push = readFileSync(new URL('../supabase/functions/push-api/index.ts', import.meta.url), 'utf8');

function pushBackend(current, accounts, initialNotices = []) {
  let handler;
  let notices = initialNotices;
  const db = {
    from(table) {
      const steps = [];
      let upsertValue = null;
      const result = () => {
        if (table === 'app_sessions') return { data: { user_id: current.id }, error: null };
        if (table === 'app_push_config') return { data: { public_key: 'public', private_key: 'private', subject: 'mailto:test@example.com' }, error: null };
        if (table === 'app_push_subscriptions') return { data: [], error: null };
        if (table === 'app_shared_state') {
          if (upsertValue) notices = upsertValue.value;
          return { data: upsertValue ? null : { value: notices }, error: null };
        }
        if (table === 'app_users') {
          const id = steps.find(step => step[0] === 'eq' && step[1] === 'id')?.[2];
          if (id) return { data: { ...current }, error: null };
          let rows = accounts.filter(account => account.active);
          for (const [method, field, value] of steps) {
            if (method === 'eq') rows = rows.filter(row => row[field] === value);
            if (method === 'neq') rows = rows.filter(row => row[field] !== value);
            if (method === 'in') rows = rows.filter(row => value.includes(row[field]));
            if (method === 'or' && field === 'role.eq.teacher,is_admin.eq.true') rows = rows.filter(row => row.role === 'teacher' || row.is_admin === true);
          }
          const columns = steps.find(step => step[0] === 'select')?.[1] || 'id';
          return { data: rows.map(row => Object.fromEntries(columns.split(',').map(column => [column, row[column]]))), error: null };
        }
        return { data: null, error: null };
      };
      const chain = new Proxy({}, {
        get(_, method) {
          if (method === 'then') return (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
          return (...args) => {
            steps.push([method, ...args]);
            if (method === 'upsert') upsertValue = args[0];
            return chain;
          };
        },
      });
      return chain;
    },
  };
  const webpush = { setVapidDetails() {}, async sendNotification() {} };
  const code = stripTypeScriptTypes(push.replace(/^import .*\n/gm, ''));
  vm.runInNewContext(code, {
    createClient: () => db,
    webpush,
    Deno: { env: { get: () => 'test' }, serve: fn => { handler = fn; } },
    Request,
    Response,
    URL,
    Date,
    Math,
    console: { error() {} },
  });
  return {
    get notices() { return notices; },
    async send(body) {
      return handler(new Request('https://test.local/push-api/send', {
        method: 'POST',
        headers: { authorization: 'Bearer session', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }));
    },
  };
}

test('student contact tab is renamed and reuses the phone icon', () => {
  assert.match(app, /\['contact', '쪽지', Icon\.phone\]/);
  assert.doesNotMatch(app, /그냥 한번 넣어본 기능|심심할때 한번씩 보내보세요/);
});

test('student and teacher share the free message composer', () => {
  assert.match(app, /function FreeMessageComposer/);
  assert.match(app, /placeholder: "메시지를 입력하세요", targets: contactTargets/);
  assert.match(app, /placeholder: "학생에게 메시지를 보내보세요", targets: activeStudents/);
  assert.match(app, /onClick: \(\) => setStage\('targets'\)/);
  assert.match(app, /onClick: \(\) => setStage\('confirm'\)/);
  assert.match(app, /onClick: \(\) => setStage\('targets'\)[\s\S]*"취소"/);
});

test('recipient selection supports select all, clear, multiple recipients and disabled empty send', () => {
  assert.match(app, /setRecipients\(targets\.map\(target => target\.key\)\)/);
  assert.match(app, /"전체 선택"/);
  assert.match(app, /setRecipients\(\[\]\)/);
  assert.match(app, /"선택 해제"/);
  assert.match(app, /disabled: !recipients\.length/);
  assert.match(app, /`보내기 \(\$\{recipients\.length\}명\)`/);
});

test('free messages use a 180 character limit and server-side duplicate key', () => {
  assert.match(app, /const FREE_MESSAGE_MAX_LENGTH = 180/);
  assert.match(app, /say\(`메시지는 \$\{FREE_MESSAGE_MAX_LENGTH\}자까지 입력할 수 있어요\.`\)/);
  assert.match(app, /setMessage\(value\.slice\(0, FREE_MESSAGE_MAX_LENGTH\)\)/);
  assert.doesNotMatch(app, /maxLength: FREE_MESSAGE_MAX_LENGTH/);
  assert.match(push, /const FREE_MESSAGE_MAX_LENGTH = 180/);
  assert.match(push, /notice\.sender === user\.username && notice\.contactMessage === message && notice\.contactTargetKey === targetKey/);
  assert.match(push, /< 60000/);
  assert.match(push, /같은 메시지는 1분 후에 다시 보낼 수 있어요/);
});

test('server validates student and teacher modes, self exclusion and every named recipient', () => {
  assert.match(push, /senderMode === 'student' && isStudentUser\(user\)/);
  assert.match(push, /senderMode === 'teacher' && isTeacherUser\(user\)/);
  assert.match(push, /\.neq\('id', user\.id\)/);
  assert.match(push, /targetUsernames\.some\(username => username === user\.username \|\| !foundUsernames\.has\(username\)\)/);
  assert.match(push, /선생님은 학생에게만 메시지를 보낼 수 있어요/);
});

test('server stores app notifications before reusing the existing push sender', () => {
  assert.match(push, /const NOTICES_KEY = 'lin-homework-v3-notices'/);
  assert.match(push, /app_shared_state'[\s\S]*upsert\(\{ key: NOTICES_KEY, value: \[\.\.\.notices, \.\.\.recipientNotices\]/);
  assert.match(push, /kind: 'contact'[\s\S]*sender: user\.username[\s\S]*contactMessage: message/);
  assert.match(push, /await sendToUserIds\(\[\.\.\.teacherTargets, \.\.\.studentTargets\]/);
});

test('preset contact messages keep their existing protected path', () => {
  assert.match(push, /kind === 'contact'[\s\S]*CONTACT_MESSAGES\.has\(message\)/);
  assert.match(push, /TEACHER_ONLY_CONTACT_MESSAGES\.has\(message\) && target !== 'teacher'/);
  assert.match(app, /CONTACT_MESSAGES\.map/);
});

test('student free message stores teacher and selected student notifications', async () => {
  const current = { id: 'student-1', username: '학생1', role: 'student', is_admin: false, active: true };
  const backend = pushBackend(current, [
    current,
    { id: 'teacher-1', username: '선생님', role: 'teacher', is_admin: false, active: true },
    { id: 'student-2', username: '학생2', role: 'student', is_admin: false, active: true },
  ]);
  const response = await backend.send({ kind: 'free-message', senderMode: 'student', body: '안녕하세요', targetTeacher: true, targetUsernames: ['학생2'], url: '/?kind=contact' });
  assert.equal(response.status, 200);
  assert.equal(backend.notices.length, 2);
  assert.equal(backend.notices[0].audience, 'teacher');
  assert.equal(backend.notices[1].user, '학생2');
  assert.equal(backend.notices[1].sender, '학생1');
});

test('server rejects self, missing recipients and duplicate free messages', async () => {
  const current = { id: 'student-1', username: '학생1', role: 'student', is_admin: false, active: true };
  const accounts = [current, { id: 'student-2', username: '학생2', role: 'student', is_admin: false, active: true }];
  const self = pushBackend(current, accounts);
  assert.equal((await self.send({ kind: 'free-message', senderMode: 'student', body: '안녕', targetUsernames: ['학생1'] })).status, 403);
  const missing = pushBackend(current, accounts);
  assert.equal((await missing.send({ kind: 'free-message', senderMode: 'student', body: '안녕', targetUsernames: ['없는학생'] })).status, 403);
  const duplicate = pushBackend(current, accounts, [{ kind: 'contact', sender: '학생1', contactMessage: '안녕', contactTargetKey: '학생2', contactSentAt: Date.now() }]);
  assert.equal((await duplicate.send({ kind: 'free-message', senderMode: 'student', body: '안녕', targetUsernames: ['학생2'] })).status, 409);
});

test('teacher can send only to active students; admin teacher mode is view-only', async () => {
  const adminUser = { id: 'admin-1', username: '관리자', role: 'student', is_admin: true, active: true };
  const adminBackend = pushBackend(adminUser, [adminUser, { id: 'student-2', username: '학생2', role: 'student', is_admin: false, active: true }]);
  assert.equal((await adminBackend.send({ kind: 'free-message', senderMode: 'teacher', body: '확인해주세요', targetUsernames: ['학생2'] })).status, 403);
  for (const current of [
    { id: 'teacher-1', username: '선생님', role: 'teacher', is_admin: false, active: true },
  ]) {
    const student = { id: 'student-2', username: '학생2', role: 'student', is_admin: false, active: true };
    const backend = pushBackend(current, [current, student]);
    assert.equal((await backend.send({ kind: 'free-message', senderMode: 'teacher', body: '확인해주세요', targetUsernames: ['학생2'] })).status, 200);
    assert.equal(backend.notices.at(-1).user, '학생2');
    assert.equal(backend.notices.at(-1).sender, current.username);
  }
});
