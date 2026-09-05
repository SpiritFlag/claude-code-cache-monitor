'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runFixture } = require('./helper.js');

const close = (a, b) => Math.abs(a - b) < 1e-6;

test('model-mix: costByModel 실비 두 항목과 합이 손계산과 같다', () => {
  const { snap } = runFixture('model-mix');
  const s = snap.sessions[0];
  const mc = s.modelCompare;
  assert.equal(mc.mixed, true);
  assert.equal(mc.breakdown.length, 2);
  const byModel = Object.fromEntries(mc.breakdown.map(b => [b.model, b]));
  assert.equal(byModel['claude-sonnet-5'].calls, 1);
  assert.equal(byModel['claude-opus-5'].calls, 1);
  assert.ok(close(byModel['claude-sonnet-5'].cost, 0.100999));
  assert.ok(close(byModel['claude-opus-5'].cost, 0.0837475));
  assert.ok(close(mc.actual, byModel['claude-sonnet-5'].cost + byModel['claude-opus-5'].cost));
});

test('model-mix: rows 넷의 배수는 costAsTok(전체 토큰, 모델) / actual', () => {
  const { snap } = runFixture('model-mix');
  const s = snap.sessions[0];
  const mc = s.modelCompare;
  assert.equal(mc.rows.length, 4);
  const byModel = Object.fromEntries(mc.rows.map(r => [r.model, r]));

  assert.ok(close(byModel['claude-sonnet-5'].cost, 0.134498));
  assert.ok(close(byModel['claude-opus-5'].cost, 0.336245));
  assert.ok(close(byModel['claude-fable-5-1'].cost, 0.64249));
  assert.ok(close(byModel['claude-haiku-4-5-20251001'].cost, 0.067249));

  for (const r of mc.rows) assert.ok(close(r.ratio, r.cost / mc.actual));

  // 마지막 호출이 opus라 s.model === claude-opus-5. opus/sonnet/haiku는 family()가 자기 자신이라
  // 정확 일치와 결과가 같다(fable 계열만 묶인다)
  assert.equal(byModel['claude-opus-5'].current, true);
  assert.equal(byModel['claude-sonnet-5'].current, false);
  assert.equal(byModel['claude-fable-5-1'].current, false);
  assert.equal(byModel['claude-haiku-4-5-20251001'].current, false);
});

test('model-fable-family (질문 q1): 실제 모델 claude-fable-5는 family()로 묶여 fable-5-1 칸이 현재로 표시되고, 배수는 1.00×가 아닐 수 있다', () => {
  const { snap } = runFixture('model-fable-family');
  const s = snap.sessions[0];
  assert.equal(s.model, 'claude-fable-5');
  const mc = s.modelCompare;
  const byModel = Object.fromEntries(mc.rows.map(r => [r.model, r]));
  assert.equal(byModel['claude-fable-5-1'].current, true); // family(fable-5) === family(fable-5-1)
  assert.ok(close(mc.actual, 0.167495));
  assert.ok(close(byModel['claude-fable-5-1'].cost, 0.137495)); // read 단가가 달라(0.1 vs 0.025) actual과 다름
  assert.ok(!close(byModel['claude-fable-5-1'].ratio, 1)); // "현재"인데 배수가 1.00×가 아님을 그대로 확인
  assert.ok(close(byModel['claude-fable-5-1'].ratio, 0.8208901758261441));
});
