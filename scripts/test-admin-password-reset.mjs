// Offline tests: real API/component source with mocked DB and React hooks.
// No production requests, account changes or Push messages are sent.
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const apiSource = readFileSync(new URL('../supabase/functions/homework-api/index.ts', import.meta.url), 'utf8');
const targetId = '00000000-0000-4000-8000-000000000002';
const adminId = '00000000-0000-4000-8000-000000000001';
function backend(role, rpcError = null) {
  let handler;
  const calls = [];
  const queries = [];
  const db = {
    from(table) {
      const q = { table, steps: [] };
      queries.push(q);
      const chain = new Proxy({}, { get(_, method) {
        const result = () => ({ data: table === 'app_sessions' ? (role ? { user_id: adminId } : null)
          : table === 'app_users' ? { id: adminId, username: 'operator', role, active: true } : null, error: null });
        if (method === 'then') return resolve => resolve(result());
        return (...args) => { q.steps.push([method, ...args]); return method === 'maybeSingle' ? Promise.resolve(result()) : chain; };
      }});
      return chain;
    },
    async rpc(name, args) { calls.push({ name, args }); return { data: true, error: rpcError && { message: rpcError } }; },
  };
  const code = stripTypeScriptTypes(apiSource.replace(/^import .*\n/, ''));
  vm.runInNewContext(code, {
    createClient: () => db, Deno: { env: { get: () => 'test' }, serve: fn => { handler = fn; } },
    Request, Response, URL, console: { error() {} },
  });
  return { calls, queries, async request(path, body, method = body ? 'POST' : 'GET') {
    return handler(new Request('https://test.local/homework-api' + path, {
      method, headers: { authorization: 'Bearer test-session', 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
  }};
}

for (const role of [null, 'student', 'teacher']) {
  test(`${role || 'invalid session'} cannot list accounts or reset passwords`, async () => {
    const api = backend(role);
    assert.equal((await api.request('/admin/accounts')).status, role ? 403 : 401);
    assert.equal((await api.request('/admin/reset-password', { userId: targetId, role: 'admin' })).status, role ? 403 : 401);
    assert.equal(api.calls.length, 0);
  });
}
test('admin RPC identity comes from the session, ignores supplied password/actor', async () => {
  const api = backend('admin');
  assert.equal((await api.request('/admin/reset-password', { userId: targetId, p_admin_id: targetId, password: 'override' })).status, 200);
  assert.equal(api.calls[0].name, 'app_admin_reset_password');
  assert.deepEqual(JSON.parse(JSON.stringify(api.calls[0].args)), { p_admin_id: adminId, p_user_id: targetId });
});
test('account list never selects password columns and includes only teacher/student', async () => {
  const api = backend('admin');
  assert.equal((await api.request('/admin/accounts')).status, 200);
  const steps = api.queries.at(-1).steps;
  assert.equal(steps.find(s => s[0] === 'select')[1], 'id,username,role,active');
  assert.deepEqual(Array.from(steps.find(s => s[0] === 'in')[2]), ['teacher', 'student']);
});
test('invalid target is rejected before invoking RPC', async () => {
  const api = backend('admin');
  assert.equal((await api.request('/admin/reset-password', { userId: 'invalid' })).status, 400);
  assert.equal(api.calls.length, 0);
});
for (const [message, status] of [['ADMIN_REQUIRED', 403], ['ACCOUNT_NOT_FOUND', 404], ['database failed', 500]]) {
  test(`RPC ${message} cannot report success`, async () => {
    const api = backend('admin', message);
    const response = await api.request('/admin/reset-password', { userId: targetId });
    assert.equal(response.status, status);
    assert.ok((await response.json()).error);
  });
}
for (const role of ['teacher', 'admin', 'student']) {
  test(`${role}: existing teacher-only operations retain correct access`, async () => {
    const api = backend(role), expected = role === 'student' ? 403 : 200;
    assert.equal((await api.request('/student-vocab', { username: 'student', vocab: [] })).status, expected);
    assert.equal((await api.request('/student-active', { username: 'student', active: true })).status, expected);
    assert.equal((await api.request('/state', { key: 'lin-homework-v3-banner', value: { enabled: false } }, 'PUT')).status, expected);
    assert.equal((await api.request('/change-password', { currentPassword: 'old', newPassword: 'next' })).status, 200);
  });
}

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
function uiHarness(component, api = async () => ({ accounts: [] })) {
  let cursor = 0, slots = [], effects = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useEffect(fn) { const index = cursor++; if (!(index in slots)) { slots[index] = true; effects.push(fn); } },
    useMemo: fn => fn(),
  };
  const ctx = vm.createContext({ React: react, apiMock: api, console });
  vm.runInContext(appSource.replace(/ReactDOM\.createRoot[\s\S]*$/, '') + '\napi = apiMock;', ctx);
  return { render(props) { cursor = 0; ctx.props = props; const tree = vm.runInContext(`${component}(props)`, ctx); effects.splice(0).forEach(fn => fn()); return tree; } };
}
const flatten = node => !node || typeof node !== 'object' ? [] : [node, ...node.children.flatMap(flatten)];
const button = (tree, label) => flatten(tree).find(n => n.type === 'button' && n.children.includes(label));
const settle = () => new Promise(resolve => setImmediate(resolve));
test('account menu is visible only to admin, using the existing menu', () => {
  for (const role of ['admin', 'teacher', 'student']) {
    const h = uiHarness('AccountMenu'), props = { user: { username: 'test', role }, onManageAccounts() {} };
    const first = h.render(props);
    flatten(first).find(n => n.props['aria-label'] === '계정 메뉴').props.onClick();
    assert.equal(!!button(h.render(props), '계정 관리'), role === 'admin');
  }
});
test('cancel makes no reset request; confirmation prevents double-submit and shows success', async () => {
  const calls = [], messages = [];
  let finish;
  const h = uiHarness('AdminAccounts', async (path, opts) => {
    calls.push(path);
    if (path.endsWith('accounts')) return { accounts: [{ id: targetId, username: 'student', role: 'student', active: true }] };
    assert.equal(JSON.parse(opts.body).userId, targetId);
    await new Promise(resolve => { finish = resolve; });
    return { ok: true };
  });
  const props = { token: 'test', say: msg => messages.push(msg), onBack() {} };
  h.render(props); await settle();
  button(h.render(props), '비밀번호 초기화').props.onClick();
  button(h.render(props), '취소').props.onClick();
  assert.equal(calls.length, 1);
  assert.equal(flatten(h.render(props)).some(n => n.props.role === 'dialog'), false);
  button(h.render(props), '비밀번호 초기화').props.onClick();
  const send = button(h.render(props), '초기화').props.onClick;
  const pending = send(); await send();
  assert.equal(calls.length, 2);
  finish(); await pending;
  assert.deepEqual(messages, ['비밀번호가 0000으로 초기화되었습니다.']);
  assert.equal(flatten(h.render(props)).some(n => n.props.role === 'dialog'), false);
});
test('failed reset keeps confirmation open and shows no success', async () => {
  const messages = [];
  const h = uiHarness('AdminAccounts', async path => {
    if (path.endsWith('accounts')) return { accounts: [{ id: targetId, username: 'teacher', role: 'teacher', active: true }] };
    throw new Error('실패');
  });
  const props = { token: 'test', say: msg => messages.push(msg) };
  h.render(props); await settle();
  button(h.render(props), '비밀번호 초기화').props.onClick();
  await button(h.render(props), '초기화').props.onClick();
  assert.deepEqual(messages, ['실패']);
  assert.equal(flatten(h.render(props)).some(n => n.props.role === 'dialog'), true);
});
