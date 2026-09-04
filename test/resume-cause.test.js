'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runFixture } = require('./helper.js');

test('resume-array-marker: 배열형 재개 마커 뒤 브레이크는 session_resume', () => {
  const { breaks } = runFixture('resume-array-marker');
  assert.equal(breaks.length, 1);
  assert.equal(breaks[0].cause, 'session_resume');
  assert.equal(breaks[0].rewrite, 30000);
});

test('resume-noise: last-prompt/file-history-snapshot만으로는 session_resume이 아님 (SC-3)', () => {
  const { breaks } = runFixture('resume-noise');
  assert.equal(breaks.length, 1);
  assert.notEqual(breaks[0].cause, 'session_resume');
});

test('resume-dup-uuid: 같은 uuid 마커 재기록은 무시되어 두 번째 session_resume이 안 됨 (FR-3)', () => {
  const { breaks } = runFixture('resume-dup-uuid');
  assert.equal(breaks.length, 2);
  assert.equal(breaks[0].cause, 'session_resume');
  assert.notEqual(breaks[1].cause, 'session_resume');
});
