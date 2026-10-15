import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const api = readFileSync(new URL('../supabase/functions/homework-api/index.ts', import.meta.url), 'utf8');
const pick = (name) => {
  const line = api.split('\n').find(l => l.startsWith(`const ${name}=`) || l.startsWith(`function ${name}(`));
  assert.ok(line, `${name} not found`);
  return line;
};
const source = stripTypeScriptTypes([pick('teacherSubKey'), pick('mergeSub'), pick('mergeA')].join('\n'));
const ctx = {};
vm.runInNewContext(`${source}\nthis.mergeA = mergeA;`, ctx);
const mergeA = (oldValue, incoming, name) => JSON.parse(JSON.stringify(ctx.mergeA(oldValue, incoming, name)));

const assign = (subs) => [{ id: 1, title: '작문', subs }];

test('student edit before feedback is saved', () => {
  const saved = mergeA(assign({ 민지: { submitted: true, answer: '旧' } }), assign({ 민지: { submitted: true, answer: '新' } }), '민지');
  assert.equal(saved[0].subs.민지.answer, '新');
});

test('stale student save cannot erase teacher feedback', () => {
  const server = assign({ 민지: { submitted: true, answer: '旧', comment: '좋아요', feedbackStarted: true, feedbackComplete: true } });
  const stale = assign({ 민지: { submitted: true, answer: '新' } });
  const saved = mergeA(server, stale, '민지');
  assert.deepEqual(saved[0].subs.민지, server[0].subs.민지);
});

test('answer is locked once feedback has started, even with empty comment', () => {
  const server = assign({ 민지: { submitted: true, answer: '旧', feedbackStarted: true } });
  const saved = mergeA(server, assign({ 민지: { submitted: true, answer: '新' } }), '민지');
  assert.equal(saved[0].subs.민지.answer, '旧');
});

test('student cannot write teacher feedback fields', () => {
  const server = assign({ 민지: { submitted: false } });
  const saved = mergeA(server, assign({ 민지: { submitted: true, answer: 'A', comment: '셀프 칭찬', feedbackComplete: true } }), '민지');
  assert.equal(saved[0].subs.민지.answer, 'A');
  assert.equal(saved[0].subs.민지.comment, undefined);
  assert.equal(saved[0].subs.민지.feedbackComplete, undefined);
});

test('student save leaves other students untouched', () => {
  const server = assign({ 민지: { submitted: false }, 서준: { submitted: true, answer: 'X', comment: 'ok' } });
  const saved = mergeA(server, assign({ 민지: { submitted: true, answer: 'A' }, 서준: { submitted: false } }), '민지');
  assert.deepEqual(saved[0].subs.서준, server[0].subs.서준);
});

test('new student signup initializes own empty submission', () => {
  const saved = mergeA(assign({}), assign({ 신규: { submitted: false } }), '신규');
  assert.deepEqual(saved[0].subs.신규, { submitted: false });
});
