'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runFixture } = require('./helper.js');
const { detail } = require('../server.js');

test('prompt-marks: 마커 목록 길이가 스냅숏 prompts 건수와 같다 (SC-16)', () => {
  const { snap } = runFixture('prompt-marks');
  const s = snap.sessions[0];
  const d = detail(s.id);
  assert.equal(d.prompts.length, 2);
  assert.equal(d.prompts.length, s.prompts);
});

test('prompt-marks: 두 마커의 t가 사람 프롬프트 두 줄의 시각과 같다 (SC-17)', () => {
  const { snap } = runFixture('prompt-marks');
  const d = detail(snap.sessions[0].id);
  assert.equal(d.prompts[0].t, Date.parse('2026-09-01T00:00:00.000Z'));
  assert.equal(d.prompts[1].t, Date.parse('2026-09-01T00:00:30.000Z'));
});

test('prompt-marks: detail 응답에 프롬프트 본문이 실리지 않는다 (SC-18)', () => {
  const { snap } = runFixture('prompt-marks');
  const d = detail(snap.sessions[0].id);
  const json = JSON.stringify(d);
  assert.ok(!json.includes('prompt-body-one'));
  assert.ok(!json.includes('prompt-body-two'));
});
