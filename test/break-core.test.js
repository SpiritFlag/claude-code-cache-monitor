'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runFixture } = require('./helper.js');

test('prev-in-tail: rewrite 보정 후 브레이크 없음 (SC-1)', () => {
  const { breaks } = runFixture('prev-in-tail');
  assert.equal(breaks.length, 0);
});

test('breakpoint-shift: 13필드가 모두 있고 rewrite·shrink가 3885 (SC-8)', () => {
  const { breaks } = runFixture('breakpoint-shift');
  assert.equal(breaks.length, 1);
  const b = breaks[0];
  const FIELDS = ['prevIn', 'prevCr', 'prevTotal', 'curIn', 'curCw', 'curCr', 'cw1h', 'cw5m', 'shrink', 'grew', 'gapMin', 'prefixIntact', 'events'];
  for (const k of FIELDS) assert.ok(k in b, `missing field ${k}`);
  assert.equal(b.rewrite, 3885);
  assert.equal(b.shrink, 3885);
  assert.equal(b.prefixIntact, b.curCr >= b.prevCr);
});
