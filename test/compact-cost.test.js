'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runFixture } = require('./helper.js');

test('compact-meta: 압축 재료 3종(rewrite · extra · postCtx)이 snap.calibration에 그대로 실린다', () => {
  const { snap } = runFixture('compact-meta');
  const cal = snap.calibration;
  assert.equal(cal.summary, 21000); // compactMetadata.postTokens
  assert.equal(cal.rewrite, 99000); // 압축 직후 호출의 rewrite
  assert.ok(Math.abs(cal.extra - 0.2277) < 1e-9);
  assert.equal(cal.postCtx, 101002); // 압축 직후 호출의 ctx(total)
});

test('compact-meta: sonnet advice.compactionCost는 COMPACT 고정 상수로 계산된 0.660', () => {
  const { snap } = runFixture('compact-meta');
  const s = snap.sessions[0];
  assert.ok(Math.abs(s.advice.compactionCost - 0.66) < 1e-9);
  assert.equal(s.advice.summaryTokens, 20000);
  assert.equal(s.advice.rewriteTokens, 55000);
  assert.equal(s.advice.regrowthTokens, 60000);
});

test('compact-meta: advice.postCtx는 sysTokens + 20000에서 상한 걸림 (콜드스타트 sysTokens=40000)', () => {
  const { snap } = runFixture('compact-meta');
  const s = snap.sessions[0];
  assert.equal(s.sysTokens, 40000);
  assert.equal(s.advice.postCtx, 60000); // min(101002, 40000+20000)
});
