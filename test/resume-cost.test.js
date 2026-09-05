'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runFixture } = require('./helper.js');
const { price } = require('../server.js');

test('resume-cost: riskUsd · freshCost · costDelta는 ctx · sysTokens · CAL.regrowth로 손계산한 값과 같다', () => {
  const { snap } = runFixture('resume-cost');
  const s = snap.sessions[0];
  assert.equal(s.sysTokens, 40000); // 콜드스타트 첫 호출(cache_read_input_tokens=0)
  assert.equal(s.ctx, 500000); // 마지막 호출의 in+cw+cr
  assert.equal(snap.calibration.regrowth, 80000); // 압축 표본 없음 → DEFAULTS.regrowth 폴백
  assert.equal(s.continueThreshold, 120000); // sysTokens 40000 + regrowth 80000

  const p = price(s.model);
  const riskUsd = s.ctx * p.in * 2 / 1e6;
  const freshCost = s.continueThreshold * p.in * 2 / 1e6;
  assert.ok(Math.abs(s.riskUsd - riskUsd) < 1e-9);
  assert.ok(Math.abs(s.freshCost - freshCost) < 1e-9);
  assert.ok(Math.abs(s.costDelta - (riskUsd - freshCost)) < 1e-9);
  assert.ok(Math.abs(s.riskUsd - 2.00) < 1e-9);
  assert.ok(Math.abs(s.freshCost - 0.48) < 1e-9);
  assert.ok(Math.abs(s.costDelta - 1.52) < 1e-9); // 양수 → 새 세션이 쌈
});
