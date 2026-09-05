'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runFixture } = require('./helper.js');
const { detail } = require('../server.js');

test('axis-gap-30m: 마지막 시리즈 점의 a는 스냅숏 activeMs와 같다 (SC-1)', () => {
  const { snap } = runFixture('axis-gap-30m');
  const s = snap.sessions[0];
  const d = detail(s.id);
  assert.equal(d.series[d.series.length - 1].a, s.activeMs);
});

test('axis-gap-30m/90m: 뒤 두 점의 a 차이는 공백 길이와 무관하게 10000 (SC-2)', () => {
  const { snap: snap30 } = runFixture('axis-gap-30m');
  const d30 = detail(snap30.sessions[0].id);
  const { snap: snap90 } = runFixture('axis-gap-90m');
  const d90 = detail(snap90.sessions[0].id);
  const diff30 = d30.series[2].a - d30.series[1].a;
  const diff90 = d90.series[2].a - d90.series[1].a;
  assert.equal(diff30, 10000);
  assert.equal(diff90, 10000);
});

test('axis-gap: 마지막 점의 a가 직전 점보다 크다 (SC-3)', () => {
  const { snap } = runFixture('axis-gap-30m');
  const d = detail(snap.sessions[0].id);
  const last = d.series.length - 1;
  assert.ok(d.series[last].a > d.series[last - 1].a);
});
