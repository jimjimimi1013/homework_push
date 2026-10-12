import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../supabase/functions/homework-api/index.ts', import.meta.url), 'utf8');
const pushSource = readFileSync(new URL('../supabase/functions/push-api/index.ts', import.meta.url), 'utf8');
const migrationSource = readFileSync(new URL('../supabase/migrations/20261001202031_add_admin_role_access.sql', import.meta.url), 'utf8');

const adminId = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';

function backend(role, rpcError = null) {
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
                ? { id: adminId, username: 'operator', role, active: true }
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

test('admin can list teacher/student accounts without password fields', async () => {
  const api = backend('admin');
  assert.equal((await api.request('/admin/accounts')).status, 200);
  const steps = api.queries.at(-1).steps;
  assert.equal(steps.find(step => step[0] === 'select')[1], 'id,username,role,active');
  assert.deepEqual(Array.from(steps.find(step => step[0] === 'in')[2]), ['teacher', 'student']);
});

test('admin reset uses the authenticated admin id and fixed server RPC', async () => {
  const api = backend('admin');
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

test('admin and teacher retain teacher operations; student remains restricted', async () => {
  for (const role of ['admin', 'teacher', 'student']) {
    const api = backend(role);
    const expected = role === 'student' ? 403 : 200;
    assert.equal((await api.request('/student-vocab', { username: 'student', vocab: [] })).status, expected);
    assert.equal((await api.request('/student-active', { username: 'student', active: true })).status, expected);
    assert.equal((await api.request('/state', { key: 'lin-homework-v3-banner', value: { enabled: false } }, 'PUT')).status, expected);
  }
});

test('admin is included in teacher push authorization and recipients', () => {
  assert.match(pushSource, /role === 'teacher' \|\| role === 'admin'/);
  assert.match(pushSource, /query = query\.in\('role', \['teacher', 'admin'\]\)/);
  assert.doesNotMatch(pushSource, /user\.role !== 'teacher'\)/);
});

test('migration promotes the existing account and does not create another admin account', () => {
  assert.match(migrationSource, /update public\.app_users[\s\S]*set role = 'admin'/);
  assert.doesNotMatch(migrationSource, /insert into public\.app_users/i);
  assert.match(migrationSource, /password_hash = extensions\.crypt\('0000'/);
  assert.match(migrationSource, /role in \('student', 'teacher'\)/);
});

test('frontend authorization is role-based and admin is not disclosed in update notes', () => {
  assert.doesNotMatch(appSource, /user\.username\s*===\s*['"]김지아['"]/);
  assert.doesNotMatch(apiSource, /username\s*===?\s*['"]김지아['"]/);
  assert.doesNotMatch(pushSource, /username\s*===?\s*['"]김지아['"]/);
  assert.match(appSource, /role === 'teacher' \|\| role === 'admin'/);
  assert.match(appSource, /page === 'admin-accounts' && user\.role === 'admin'/);
  const updateNotes = appSource.match(/const UPDATE_NOTES = \[(.*?)\];/s)?.[1] || '';
  assert.doesNotMatch(updateNotes, /김지아|관리자|admin/i);
});
