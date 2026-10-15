import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const api = readFileSync(new URL('../supabase/functions/homework-api/index.ts', import.meta.url), 'utf8');
const line = name => {
  const found = api.split('\n').find(l => l.startsWith(`const ${name}=`));
  assert.ok(found, `${name} not found`);
  return found;
};
const start = api.indexOf('async function loadReviewQuestionRows');
const end = api.indexOf('// 교재 사진은 AI 문제 생성용');
assert.ok(start > 0 && end > start, 'regrade helpers not found');
const source = stripTypeScriptTypes([line('normAnswer'), line('ungradedReviewTypes'), api.slice(start, end)].join('\n'));

function setup({ newQs, results, aiGrades = {} }) {
  const updates = [];
  const aiCalls = [];
  const query = table => {
    const q = {
      select: () => q, eq: () => q,
      order: async () => ({ data: newQs, error: null }),
      update: row => ({ eq: async (_k, id) => { updates.push({ id, row }); return { error: null }; } }),
      then: (resolve) => resolve({ data: table === 'review_results' ? results : newQs, error: null }),
    };
    return q;
  };
  const ctx = {
    supabase: { from: query },
    reviewWithAI: async (writings, grades) => { aiCalls.push(grades); return { corrections: {}, grades: Object.fromEntries(grades.filter(g => aiGrades[g.id]).map(g => [g.id, aiGrades[g.id]])) }; },
  };
  vm.runInNewContext(`${source}\nthis.regrade = regradeReviewResults;`, ctx);
  return { regrade: ctx.regrade, updates, aiCalls };
}

const oldQs = [
  { id: 'o1', type: 'vocab', prompt: 'Q1', answer: '错', explanation: '' },
  { id: 'o2', type: 'vocab', prompt: 'Q2', answer: '', explanation: '뜻' },
  { id: 'o3', type: 'writing', prompt: 'Q3', answer: '', explanation: '예시' },
];

test('fixed answer key regrades kept student answers under new question ids', async () => {
  const newQs = [
    { id: 'n1', type: 'vocab', prompt: 'Q1', answer: '对', explanation: '' },
    { id: 'n2', type: 'vocab', prompt: 'Q2', answer: '', explanation: '뜻' },
    { id: 'n3', type: 'writing', prompt: 'Q3', answer: '', explanation: '예시' },
  ];
  const results = [{ id: 'r1', answers: { o1: '对', o2: '의미', o3: '我很好' }, correctness: { o1: false, o2: true }, corrections: { o2: { note: 'AI' }, o3: { corrected: '我很好。', note: '좋아요' } } }];
  const { regrade, updates, aiCalls } = setup({ newQs, results });
  await regrade('s', oldQs, [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }]);
  assert.equal(aiCalls.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(updates[0].row)), {
    answers: { n1: '对', n2: '의미', n3: '我很好' },
    correctness: { n1: true, n2: true },
    corrections: { n2: { note: 'AI' }, n3: { corrected: '我很好。', note: '좋아요' } },
    score: 2, total: 2,
  });
});

test('changed meaning reference is regraded by AI; reorder follows payload ids', async () => {
  const newQs = [
    { id: 'n2', type: 'vocab', prompt: 'Q2', answer: '', explanation: '새 뜻' },
    { id: 'n1', type: 'vocab', prompt: 'Q1', answer: '错', explanation: '' },
  ];
  const results = [{ id: 'r1', answers: { o1: '错', o2: '의미' }, correctness: { o1: true, o2: true }, corrections: {} }];
  const { regrade, updates, aiCalls } = setup({ newQs, results, aiGrades: { n2: { correct: false, note: '아니에요' } } });
  await regrade('s', oldQs, [{ id: 'o2' }, { id: 'o1' }]);
  assert.equal(aiCalls[0][0].reference, '새 뜻');
  const row = JSON.parse(JSON.stringify(updates[0].row));
  assert.deepEqual(row.correctness, { n2: false, n1: true });
  assert.equal(row.score, 1);
  assert.equal(row.total, 2);
});

test('payload without previous ids leaves results untouched', async () => {
  const { regrade, updates } = setup({ newQs: [], results: [{ id: 'r1', answers: {}, correctness: {}, corrections: {} }] });
  await regrade('s', oldQs, [{ type: 'vocab' }]);
  assert.equal(updates.length, 0);
});

test('published review: questions locked, only answer/explanation updated in place, then regraded', () => {
  const save = api.slice(api.indexOf("if(p==='/admin/reviews/save'"), api.indexOf("if(p==='/admin/reviews/delete'"));
  assert.match(save, /if\(cur\?\.status==='published'\)\{/);
  assert.match(save, /from\('review_questions'\)\.update\(\{answer:[^}]*explanation:[^}]*\}\)\.eq\('id',id\)\.eq\('review_set_id',setId\)/);
  assert.doesNotMatch(save.slice(save.indexOf("cur?.status==='published'"), save.indexOf('app_admin_save_review_set')), /prompt:|type:/);
  assert.match(save, /await regradeReviewResults\(setId,oldQs,oldQs\.map/);
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /const locked = existing\?\.status === 'published';/);
  assert.match(app, /readOnly: locked/);
  assert.match(app, /!locked && questions\.length < 20/);
});
