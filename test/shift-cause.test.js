'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runFixture } = require('./helper.js');

test('breakpoint-shift: breakpoint_shift로 분류되고 breakCost는 0, streak은 끊기지 않음 (SC-6)', () => {
  const { s, breaks } = runFixture('breakpoint-shift');
  assert.equal(breaks.length, 1);
  assert.equal(breaks[0].cause, 'breakpoint_shift');
  assert.equal(s.breakCost, 0);
  assert.equal(s.streak, 2);
});
